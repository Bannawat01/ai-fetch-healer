import { Masker, type PayloadMasker } from "../security/masker";
import type { HealingRule, ILLMProvider, JsonPayload } from "../types";
import { HeuristicCache } from "./cache";

export interface HealerConfig {
	fetchFunction?: typeof fetch;
	cache?: HeuristicCache;
	masker?: PayloadMasker;
	maxErrorDetailsChars?: number;
}

const globalCache = new HeuristicCache();
const globalMasker = new Masker();

function isStringMap(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== "object") {
		return false;
	}

	return Object.values(value).every((v) => typeof v === "string");
}

function isHealingRule(value: unknown): value is HealingRule {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as HealingRule;
	const validAction = typeof candidate.action === "string";
	const validMapping =
		candidate.mapping === undefined || isStringMap(candidate.mapping);

	return validAction && validMapping;
}

function ensureReadableResponse(response: Response): Response {
	if (response.bodyUsed && typeof response.clone === "function") {
		return response.clone();
	}

	return response;
}

export function createHealedFetch(
	provider: ILLMProvider,
	config: HealerConfig = {},
) {
	const baseFetch = config.fetchFunction || globalThis.fetch;
	const cache = config.cache || globalCache;
	const masker = config.masker || globalMasker;
	const maxErrorDetailsChars = config.maxErrorDetailsChars ?? 4000;

	return async function healedFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const response = await baseFetch(input, init);

		if (response.ok || ![400, 422].includes(response.status)) {
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

			const method = init.method || "GET";
			const urlStr =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			const cacheKey = cache.generateKey(method, urlStr, maskedSchema);

			let healingRule = cache.get(cacheKey);

			if (!healingRule) {
				console.log(
					`[ai-fetch-healer] Cache miss. Consulting AI (${provider.name})...`,
				);
				const healResult = await provider.heal(maskedSchema, errorDetails);
				healingRule = healResult.rule;

				if (!isHealingRule(healingRule)) {
					console.warn(
						"[ai-fetch-healer] Invalid healing rule from provider. Returning original response.",
					);
					return ensureReadableResponse(response);
				}

				cache.set(cacheKey, healingRule);
			} else {
				console.log(
					"[ai-fetch-healer] Cache hit! Applying healing rule locally.",
				);
			}

			if (!healingRule.mapping) {
				return ensureReadableResponse(response);
			}

			if (healingRule.action !== "MAP_FIELDS") {
				console.warn(
					`[ai-fetch-healer] Unsupported action "${healingRule.action}". Applying mapping fallback.`,
				);
			}

			const finalPayload: JsonPayload = { ...originalPayload };

			for (const [oldKey, newKey] of Object.entries(healingRule.mapping)) {
				if (finalPayload[oldKey] !== undefined) {
					finalPayload[newKey] = finalPayload[oldKey];
					delete finalPayload[oldKey];
				}
			}

			const healedInit: RequestInit = {
				...init,
				body: JSON.stringify(finalPayload),
			};

			return await baseFetch(input, healedInit);
		} catch (error) {
			console.warn(
				"[ai-fetch-healer] Auto-healing failed, returning original response.",
				error,
			);
			return ensureReadableResponse(response);
		}
	};
}
