import { OpenAICompatProvider, resolveEnv } from "./openai-compat";

export interface GroqProviderOptions {
	apiKey?: string;
	/** Any Groq-hosted model id. Default "llama-3.3-70b-versatile". */
	model?: string;
	timeoutMs?: number;
}

/**
 * ILLMProvider backed by Groq's OpenAI-compatible chat completions API.
 * Resolves the API key in order: constructor arg -> options.apiKey ->
 * AI_HEALER_GROQ_KEY -> GROQ_API_KEY. Throws synchronously in the
 * constructor if no key can be resolved.
 */
export class GroqProvider extends OpenAICompatProvider {
	name = "Groq";
	protected baseUrl = "https://api.groq.com/openai/v1/chat/completions";
	protected model: string;

	constructor();
	constructor(options: GroqProviderOptions);
	constructor(apiKey: string, options?: GroqProviderOptions);
	constructor(
		apiKeyOrOptions?: string | GroqProviderOptions,
		options: GroqProviderOptions = {},
	) {
		const resolvedOptions: GroqProviderOptions =
			typeof apiKeyOrOptions === "string"
				? { ...options, apiKey: apiKeyOrOptions }
				: (apiKeyOrOptions ?? {});

		const env = resolveEnv();
		const resolvedKey =
			resolvedOptions.apiKey || env?.AI_HEALER_GROQ_KEY || env?.GROQ_API_KEY;
		const model = resolvedOptions.model ?? "llama-3.3-70b-versatile";
		const timeoutMs = resolvedOptions.timeoutMs ?? 10000;

		if (!resolvedKey) {
			throw new Error(
				"[ai-fetch-healer] Groq API Key is missing. " +
					"Please provide it in the constructor or set AI_HEALER_GROQ_KEY in your .env file.",
			);
		}

		super(resolvedKey, timeoutMs);
		this.model = model;
	}
}
