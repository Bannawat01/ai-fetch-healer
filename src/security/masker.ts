import type { JsonValue } from "../types";

const DEFAULT_SENSITIVE_KEYS = [
	"email",
	"username",
	"password",
	"token",
	"phone",
	"credit_card",
	"bank_account",
	"card_number",
	"api_key",
	"secret",
];

export interface MaskerOptions {
	/** Extra key names to treat as sensitive, on top of the built-in defaults. */
	additionalSensitiveKeys?: string[];
	/** If set, every sensitive value is replaced with this exact string instead of a category-specific mask. */
	maskingString?: string;
}

export interface PayloadMasker {
	/** Returns a schema-only view of payload: sensitive values masked, everything else reduced to its type name. Never leaks raw values. */
	mask(payload: unknown): JsonValue;
}

const NON_ALPHANUMERIC = /[^a-z0-9]/g;

function normalizeKey(value: string): string {
	return value.toLowerCase().replace(NON_ALPHANUMERIC, "");
}

/**
 * Recursively strips a payload down to a schema-only shape before it's sent
 * to an LLM provider: sensitive keys (email, password, tokens, etc.) become
 * masked placeholders, everything else becomes its JS type name. This is the
 * library's core privacy guarantee - raw values must never reach a provider.
 */
export class Masker implements PayloadMasker {
	private readonly sensitiveKeys: Set<string>;
	private readonly maskingString?: string;

	constructor(options: MaskerOptions = {}) {
		const additional = options.additionalSensitiveKeys ?? [];
		this.sensitiveKeys = new Set(
			[...DEFAULT_SENSITIVE_KEYS, ...additional].map((key) =>
				normalizeKey(key),
			),
		);
		this.maskingString = options.maskingString;
	}

	mask(payload: unknown): JsonValue {
		return this.maskValue(payload);
	}

	private maskValue(payload: unknown, currentKey?: string): JsonValue {
		if (currentKey !== undefined) {
			// Normalize once - isSensitiveKey and getSensitiveMask both need it,
			// and this runs on every key of every payload passed through mask().
			const normalized = normalizeKey(currentKey);
			if (this.isSensitiveKey(normalized)) {
				return this.getSensitiveMask(normalized);
			}
		}

		if (payload === null) {
			return "null";
		}

		if (Array.isArray(payload)) {
			if (payload.length === 0) {
				return [];
			}
			return [this.maskValue(payload[0], currentKey)];
		}

		if (typeof payload === "object") {
			const maskedObj: Record<string, JsonValue> = {};
			const payloadRecord = payload as Record<string, unknown>;

			for (const key in payloadRecord) {
				if (Object.hasOwn(payloadRecord, key)) {
					maskedObj[key] = this.maskValue(payloadRecord[key], key);
				}
			}

			return maskedObj;
		}

		return typeof payload;
	}

	/** @param normalizedKey Already run through normalizeKey(). */
	private isSensitiveKey(normalizedKey: string): boolean {
		for (const sensitive of this.sensitiveKeys) {
			if (normalizedKey.includes(sensitive)) {
				return true;
			}
		}

		return false;
	}

	/** @param normalized Already run through normalizeKey(). */
	private getSensitiveMask(normalized: string): JsonValue {
		if (this.maskingString) {
			return this.maskingString;
		}

		if (normalized.includes("email")) return "masked_email";
		if (normalized.includes("phone")) return "masked_phone";
		if (normalized.includes("username") || normalized.includes("user"))
			return "masked_identity";
		if (normalized.includes("password")) return "masked_password";
		if (
			normalized.includes("token") ||
			normalized.includes("apikey") ||
			normalized.includes("api")
		) {
			return "masked_token";
		}
		if (normalized.includes("bank")) return "masked_financial";
		if (normalized.includes("credit") || normalized.includes("card")) {
			return "masked_credit_card";
		}

		return "masked_sensitive";
	}
}

const defaultMasker = new Masker();

/** Convenience wrapper around a default-configured `Masker`. Use `new Masker(options)` directly for custom sensitive keys. */
export function maskPayload(payload: unknown): JsonValue {
	return defaultMasker.mask(payload);
}
