/**
 * Central model registry + resolution helpers (Phase A: kill model-staleness).
 *
 * Why this file exists: model ids get deprecated frequently. Instead of
 * hardcoding a single default inside each provider (and hunting across the repo
 * every time a model rots), all defaults live here in ONE place, providers read
 * an env override first, and heal() can fall back down a chain of models when
 * one 404s. Zero runtime deps - stays within the project's constraints.
 */

/** Known provider keys used to look up default model chains. */
export type ProviderKey = "openrouter" | "gemini" | "groq" | "ollama";

/**
 * Default model chain per provider. The first entry is the primary; later
 * entries (if any) are automatic fallbacks tried in order when an earlier one
 * is unavailable. Bump these in ONE place when a model is deprecated.
 */
export const DEFAULT_MODELS = {
	openrouter: ["openai/gpt-4o-mini"],
	gemini: ["gemini-2.5-flash"],
	groq: ["llama-3.3-70b-versatile"],
	ollama: ["llama3.1"],
} as const satisfies Record<ProviderKey, readonly string[]>;

function readEnv(): Record<string, string | undefined> | undefined {
	return (
		globalThis as { process?: { env?: Record<string, string | undefined> } }
	).process?.env;
}

/** Split a comma-separated string (or pass through an array) into trimmed, non-empty ids. */
function toModelList(input: string | string[] | undefined): string[] {
	if (!input) return [];
	const parts = Array.isArray(input) ? input : input.split(",");
	return parts.map((m) => m.trim()).filter((m) => m.length > 0);
}

/**
 * Resolve the ordered model chain a provider should try.
 * Priority: explicit constructor input -> `<envVar>` (comma-separated) -> registry fallback.
 * Always returns at least one model id.
 */
export function resolveModelChain(params: {
	/** From constructor: `models` array or single `model` string. */
	explicit?: string | string[];
	/** Env var name to read a comma-separated override from, e.g. "AI_HEALER_GROQ_MODEL". */
	envVar?: string;
	/** Registry fallback used when nothing else is provided. */
	fallback: readonly string[];
}): string[] {
	const explicit = toModelList(params.explicit);
	if (explicit.length > 0) return explicit;

	const envRaw = params.envVar ? readEnv()?.[params.envVar] : undefined;
	const fromEnv = toModelList(envRaw);
	if (fromEnv.length > 0) return fromEnv;

	return [...params.fallback];
}

/**
 * Whether an error response indicates the *model* is unavailable (deprecated /
 * renamed / not pulled) rather than a genuine schema/auth problem - i.e. whether
 * it is safe to fall back to the next model in the chain.
 * 404 always qualifies; 400/422 only when the body mentions the model.
 */
export function isModelUnavailableError(status: number, body: string): boolean {
	if (status === 404) return true;
	if (status === 400 || status === 422) return /model/i.test(body);
	return false;
}
