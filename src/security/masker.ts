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
	additionalSensitiveKeys?: string[];
	maskingString?: string;
}

export interface PayloadMasker {
	mask(payload: unknown): JsonValue;
}

function normalizeKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
		if (currentKey && this.isSensitiveKey(currentKey)) {
			return this.getSensitiveMask(currentKey);
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

	private isSensitiveKey(key: string): boolean {
		const normalized = normalizeKey(key);

		for (const sensitive of this.sensitiveKeys) {
			if (normalized.includes(sensitive)) {
				return true;
			}
		}

		return false;
	}

	private getSensitiveMask(key: string): JsonValue {
		if (this.maskingString) {
			return this.maskingString;
		}

		const normalized = normalizeKey(key);
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

export function maskPayload(payload: unknown): JsonValue {
	return defaultMasker.mask(payload);
}
