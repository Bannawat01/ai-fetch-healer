import { GeminiProvider } from "../llm/gemini";
import { GroqProvider } from "../llm/groq";
import { OllamaProvider } from "../llm/ollama";
import { OpenRouterProvider } from "../llm/openrouter";
import type { ILLMProvider } from "../types";
import { createHealedFetch, type HealerConfig } from "./interceptor";

function readEnv(): Record<string, string | undefined> | undefined {
	return (
		globalThis as { process?: { env?: Record<string, string | undefined> } }
	).process?.env;
}

/**
 * Picks the first LLM provider whose credentials are present in the
 * environment, in priority order: OpenRouter -> Groq -> Gemini (direct) ->
 * Ollama. Ollama is checked last and only via an explicit signal
 * (AI_HEALER_OLLAMA_URL/KEY) - it needs no API key, so without that guard
 * every environment with zero keys set would silently try (and fail against)
 * a local server that may not exist.
 *
 * Throws synchronously - same fail-fast-at-setup contract as each provider's
 * own constructor - listing every env var it checked, if none matched.
 */
export function createProviderFromEnv(): ILLMProvider {
	const env = readEnv();

	if (env?.AI_HEALER_OPENROUTER_KEY || env?.OPENROUTER_API_KEY) {
		return new OpenRouterProvider();
	}
	if (env?.AI_HEALER_GROQ_KEY || env?.GROQ_API_KEY) {
		return new GroqProvider();
	}
	if (env?.GEMINI_API_KEY) {
		return new GeminiProvider(env.GEMINI_API_KEY);
	}
	if (
		env?.AI_HEALER_OLLAMA_URL ||
		env?.AI_HEALER_OLLAMA_KEY ||
		env?.OLLAMA_API_KEY
	) {
		return new OllamaProvider();
	}

	throw new Error(
		"[ai-fetch-healer] No LLM provider credentials found in the environment. " +
			"Set one of: AI_HEALER_OPENROUTER_KEY, AI_HEALER_GROQ_KEY, GEMINI_API_KEY, " +
			"or AI_HEALER_OLLAMA_URL (for a local Ollama server). " +
			"See https://github.com/Bannawat01/ai-fetch-healer#quick-start.",
	);
}

/**
 * Zero-config createHealedFetch: auto-detects which provider to use from
 * environment variables (see createProviderFromEnv) and wraps it, so a
 * consumer needs to import nothing but this one function to get healing
 * working end to end.
 *
 * ```ts
 * import { createHealedFetchFromEnv } from "ai-fetch-healer";
 * const healedFetch = createHealedFetchFromEnv(); // reads whichever key you set
 * ```
 */
export function createHealedFetchFromEnv(config?: HealerConfig) {
	return createHealedFetch(createProviderFromEnv(), config);
}
