import { Masker, type PayloadMasker } from "../security/masker";
import type {
	HealingRule,
	ILLMProvider,
	JsonPayload,
	JsonScalarType,
	JsonValue,
} from "../types";
import { HeuristicCache } from "./cache";

export interface Logger {
	log(...args: unknown[]): void;
	warn(...args: unknown[]): void;
}

export interface HealEvent {
	rule: HealingRule;
	source: "llm" | "cache";
}

export interface HealerConfig {
	fetchFunction?: typeof fetch;
	cache?: HeuristicCache;
	masker?: PayloadMasker;
	maxErrorDetailsChars?: number;
	healableStatuses?: number[];
	/**
	 * The original request must have failed (400/422) for a healed retry to
	 * fire, so under normal conditions the retry is the only send that ever
	 * succeeds. Set false only if the upstream API is known to apply side
	 * effects (e.g. partial writes) even on a rejected non-idempotent request.
	 */
	allowUnsafeRetry?: boolean;
	/** Attempts for provider.heal() on failure (network/timeout). Default 2. */
	healRetries?: number;
	/** Base delay in ms for exponential backoff between heal attempts. Default 250. */
	healRetryBaseMs?: number;
	/** Defaults to `console`. Pass a no-op logger to silence all output. */
	logger?: Logger;
	/** Called once a healing rule (from cache or a fresh LLM call) is about to be applied. */
	onHeal?: (event: HealEvent) => void;
	/** Called when provider.heal() exhausts retries, or the rule it returns fails validation. */
	onHealFail?: (error: unknown) => void;
}

const DEFAULT_HEALABLE_STATUSES = [400, 422];
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healWithRetry(
	provider: ILLMProvider,
	schema: JsonValue,
	errorDetails: string,
	retries: number,
	baseMs: number,
	logger: Logger,
): Promise<Awaited<ReturnType<ILLMProvider["heal"]>>> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await provider.heal(schema, errorDetails);
		} catch (error) {
			lastError = error;

			if (attempt < retries) {
				logger.warn(
					`[ai-fetch-healer] provider.heal() attempt ${attempt + 1} failed, retrying...`,
				);
				await sleep(baseMs * 2 ** attempt);
			}
		}
	}

	throw lastError;
}

const globalCache = new HeuristicCache();
const globalMasker = new Masker();

function isStringMap(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== "object") {
		return false;
	}

	return Object.values(value).every((v) => typeof v === "string");
}

function isTypeChangeMap(
	value: unknown,
): value is Record<string, JsonScalarType> {
	if (!value || typeof value !== "object") {
		return false;
	}

	return Object.values(value).every((v) =>
		["string", "number", "boolean", "null"].includes(String(v)),
	);
}

function isNonEmptyValue(v: JsonValue): boolean {
	return !(typeof v === "string" && v.trim() === "");
}

function isPlainRecord(value: unknown): value is Record<string, JsonValue> {
	return (
		!!value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.values(value as Record<string, JsonValue>).every(isNonEmptyValue)
	);
}

function isHealingRule(value: unknown): value is HealingRule {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as HealingRule;
	const validAction = typeof candidate.action === "string";
	const validMapping =
		candidate.mapping === undefined || isStringMap(candidate.mapping);
	const validTypeChanges =
		candidate.typeChanges === undefined ||
		isTypeChangeMap(candidate.typeChanges);
	const validAddFields =
		candidate.addFields === undefined || isPlainRecord(candidate.addFields);

	return validAction && validMapping && validTypeChanges && validAddFields;
}

function coerceJsonValue(
	value: JsonValue,
	targetType: JsonScalarType,
): JsonValue {
	if (targetType === "string") {
		return String(value);
	}

	if (targetType === "number") {
		if (typeof value === "number") {
			return value;
		}

		if (typeof value === "boolean") {
			return value ? 1 : 0;
		}

		if (typeof value === "string") {
			const parsed = Number(value.trim());
			return Number.isFinite(parsed) ? parsed : value;
		}

		return value;
	}

	if (targetType === "boolean") {
		if (typeof value === "boolean") {
			return value;
		}

		if (typeof value === "number") {
			return value !== 0;
		}

		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			if (["true", "1", "yes", "y"].includes(normalized)) {
				return true;
			}
			if (["false", "0", "no", "n", ""].includes(normalized)) {
				return false;
			}
		}

		return value;
	}

	return null;
}

function ensureReadableResponse(response: Response): Response {
	if (response.bodyUsed && typeof response.clone === "function") {
		return response.clone();
	}

	return response;
}

/**
 * Wraps `fetch` (or `config.fetchFunction`) so requests that fail with a
 * healable status (default 400/422) get a schema-fix rule from `provider`,
 * applied, and retried once. Any failure along the healing path - masking,
 * the provider call, an invalid rule - falls back to returning the original
 * response untouched; healing never throws to the caller.
 */
export function createHealedFetch(
	provider: ILLMProvider,
	config: HealerConfig = {},
) {
	const baseFetch = config.fetchFunction || globalThis.fetch;
	const cache = config.cache || globalCache;
	const masker = config.masker || globalMasker;
	const maxErrorDetailsChars = config.maxErrorDetailsChars ?? 4000;
	const healableStatuses = config.healableStatuses ?? DEFAULT_HEALABLE_STATUSES;
	const allowUnsafeRetry = config.allowUnsafeRetry ?? true;
	const healRetries = config.healRetries ?? 2;
	const healRetryBaseMs = config.healRetryBaseMs ?? 250;
	const logger = config.logger ?? console;
	const onHeal = config.onHeal;
	const onHealFail = config.onHealFail;

	return async function healedFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const response = await baseFetch(input, init);

		if (response.ok || !healableStatuses.includes(response.status)) {
			return response;
		}

		try {
			const contentLengthRaw = response.headers?.get?.("content-length");
			const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN;
			let errorDetails = `${response.status} ${response.statusText}`;

			if (
				!Number.isFinite(contentLength) ||
				contentLength <= maxErrorDetailsChars * 4
			) {
				if (typeof response.clone === "function") {
					errorDetails = await response.clone().text();
				} else if (typeof response.text === "function") {
					errorDetails = await response.text();
				}
			}

			if (errorDetails.length > maxErrorDetailsChars) {
				errorDetails = errorDetails.slice(0, maxErrorDetailsChars);
			}

			if (!init?.body || typeof init.body !== "string") {
				return ensureReadableResponse(response);
			}

			const parsedPayload = JSON.parse(init.body);
			if (
				!parsedPayload ||
				typeof parsedPayload !== "object" ||
				Array.isArray(parsedPayload)
			) {
				return ensureReadableResponse(response);
			}

			const originalPayload = parsedPayload as JsonPayload;

			const maskedSchema = masker.mask(originalPayload);

			const method = (init.method || "GET").toUpperCase();
			const isIdempotent = IDEMPOTENT_METHODS.has(method);

			if (!isIdempotent && !allowUnsafeRetry) {
				logger.warn(
					`[ai-fetch-healer] Skipping healed retry for non-idempotent method "${method}". ` +
						"Set allowUnsafeRetry: true (default) to allow it.",
				);
				return ensureReadableResponse(response);
			}

			if (!isIdempotent) {
				logger.warn(
					`[ai-fetch-healer] Retrying non-idempotent method "${method}" with healed payload. ` +
						"The original request failed validation (no side effect expected), but set " +
						"allowUnsafeRetry: false if your upstream API may apply partial writes on rejected requests.",
				);
			}

			const urlStr =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			const cacheKey = cache.generateKey(method, urlStr, maskedSchema);

			let healingRule = cache.get(cacheKey);

			if (!healingRule) {
				logger.log(
					`[ai-fetch-healer] Cache miss. Consulting AI (${provider.name})...`,
				);

				let healResult: Awaited<ReturnType<ILLMProvider["heal"]>>;
				try {
					healResult = await healWithRetry(
						provider,
						maskedSchema,
						errorDetails,
						healRetries,
						healRetryBaseMs,
						logger,
					);
				} catch (healError) {
					onHealFail?.(healError);
					throw healError;
				}

				healingRule = healResult.rule;

				if (!isHealingRule(healingRule)) {
					logger.warn(
						"[ai-fetch-healer] Invalid healing rule from provider. Returning original response.",
					);
					onHealFail?.(new Error("Provider returned an invalid healing rule"));
					return ensureReadableResponse(response);
				}

				cache.set(cacheKey, healingRule);
				onHeal?.({ rule: healingRule, source: "llm" });
			} else {
				logger.log(
					"[ai-fetch-healer] Cache hit! Applying healing rule locally.",
				);
				onHeal?.({ rule: healingRule, source: "cache" });
			}

			if (
				!healingRule.mapping &&
				!healingRule.typeChanges &&
				!healingRule.addFields
			) {
				return ensureReadableResponse(response);
			}

			if (
				healingRule.action !== "MAP_FIELDS" &&
				healingRule.action !== "CHANGE_TYPE" &&
				healingRule.action !== "ADD_REQUIRED"
			) {
				logger.warn(
					`[ai-fetch-healer] Unsupported action "${healingRule.action}". Applying mapping fallback.`,
				);
			}

			const finalPayload: JsonPayload = { ...originalPayload };
			const mapping = healingRule.mapping ?? {};

			for (const [oldKey, newKey] of Object.entries(mapping)) {
				if (finalPayload[oldKey] === undefined) {
					continue;
				}

				if (oldKey !== newKey) {
					finalPayload[newKey] = finalPayload[oldKey];
					delete finalPayload[oldKey];
				}
			}

			const typeChanges = healingRule.typeChanges ?? {};
			for (const [key, targetType] of Object.entries(typeChanges)) {
				if (finalPayload[key] === undefined) {
					continue;
				}

				finalPayload[key] = coerceJsonValue(finalPayload[key], targetType);
			}

			const addFields = healingRule.addFields ?? {};
			for (const [key, value] of Object.entries(addFields)) {
				if (finalPayload[key] === undefined) {
					finalPayload[key] = value;
				}
			}

			const healedInit: RequestInit = {
				...init,
				body: JSON.stringify(finalPayload),
			};

			return await baseFetch(input, healedInit);
		} catch (error) {
			logger.warn(
				"[ai-fetch-healer] Auto-healing failed, returning original response.",
				error,
			);
			return ensureReadableResponse(response);
		}
	};
}
