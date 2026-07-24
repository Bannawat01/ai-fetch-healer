import { DEFAULT_MODELS, resolveModelChain } from "./models";
import { OpenAICompatProvider, resolveEnv } from "./openai-compat";

export interface OllamaProviderOptions {
	/** Ollama doesn't authenticate by default; only needed for proxied/secured setups. */
	apiKey?: string;
	/** Must already be pulled locally (`ollama pull <model>`). Default from the registry ("llama3.1"). */
	model?: string;
	/** Ordered fallback chain of locally-pulled model ids; the first available one wins. Overrides `model`. */
	models?: string[];
	/** Ollama's OpenAI-compatible endpoint. Default "http://localhost:11434/v1/chat/completions". */
	baseUrl?: string;
	timeoutMs?: number;
}

/**
 * ILLMProvider backed by a local (or remote) Ollama server's OpenAI-compatible
 * chat completions endpoint. No API key is required for a default local
 * install - `apiKey` exists for proxied/secured Ollama deployments.
 *
 * Model resolution: options.models/model -> AI_HEALER_OLLAMA_MODEL (comma-separated)
 * -> registry default. Unpulled models auto-fall back to the next in the chain.
 */
export class OllamaProvider extends OpenAICompatProvider {
	name = "Ollama";
	protected baseUrl: string;
	protected models: string[];

	constructor(options: OllamaProviderOptions = {}) {
		const env = resolveEnv();
		const resolvedKey =
			options.apiKey ||
			env?.AI_HEALER_OLLAMA_KEY ||
			env?.OLLAMA_API_KEY ||
			"ollama";
		const timeoutMs = options.timeoutMs ?? 10000;

		super(resolvedKey, timeoutMs);
		this.models = resolveModelChain({
			explicit: options.models ?? options.model,
			envVar: "AI_HEALER_OLLAMA_MODEL",
			fallback: DEFAULT_MODELS.ollama,
		});
		this.baseUrl =
			options.baseUrl ??
			env?.AI_HEALER_OLLAMA_URL ??
			"http://localhost:11434/v1/chat/completions";
	}
}
