import { DEFAULT_MODELS, resolveModelChain } from "./models";
import { OpenAICompatProvider, resolveEnv } from "./openai-compat";

export interface OpenAIProviderOptions {
	apiKey?: string;
	/** Any OpenAI model id. Default from the registry ("gpt-4o-mini"). */
	model?: string;
	/** Ordered fallback chain of OpenAI model ids; the first available one wins. Overrides `model`. */
	models?: string[];
	timeoutMs?: number;
	/** Override the API base URL (e.g. an Azure/OpenAI-compatible gateway). */
	baseUrl?: string;
}

/**
 * ILLMProvider backed by OpenAI's chat completions API.
 * Resolves the API key in order: constructor arg -> options.apiKey ->
 * AI_HEALER_OPENAI_KEY -> OPENAI_API_KEY. Throws synchronously in the
 * constructor if no key can be resolved.
 *
 * Model resolution: options.models/model -> AI_HEALER_OPENAI_MODEL (comma-separated)
 * -> registry default. Deprecated models auto-fall back to the next in the chain.
 */
export class OpenAIProvider extends OpenAICompatProvider {
	name = "OpenAI";
	protected baseUrl: string;
	protected models: string[];

	constructor();
	constructor(options: OpenAIProviderOptions);
	constructor(apiKey: string, options?: OpenAIProviderOptions);
	constructor(
		apiKeyOrOptions?: string | OpenAIProviderOptions,
		options: OpenAIProviderOptions = {},
	) {
		const resolvedOptions: OpenAIProviderOptions =
			typeof apiKeyOrOptions === "string"
				? { ...options, apiKey: apiKeyOrOptions }
				: (apiKeyOrOptions ?? {});

		const env = resolveEnv();
		const resolvedKey =
			resolvedOptions.apiKey ||
			env?.AI_HEALER_OPENAI_KEY ||
			env?.OPENAI_API_KEY;
		const timeoutMs = resolvedOptions.timeoutMs ?? 10000;

		if (!resolvedKey) {
			throw new Error(
				"[ai-fetch-healer] OpenAI API Key is missing. " +
					"Please provide it in the constructor or set AI_HEALER_OPENAI_KEY in your .env file.",
			);
		}

		super(resolvedKey, timeoutMs);
		this.baseUrl =
			resolvedOptions.baseUrl ?? "https://api.openai.com/v1/chat/completions";
		this.models = resolveModelChain({
			explicit: resolvedOptions.models ?? resolvedOptions.model,
			envVar: "AI_HEALER_OPENAI_MODEL",
			fallback: DEFAULT_MODELS.openai,
		});
	}
}
