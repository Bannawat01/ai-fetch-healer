import { OpenAICompatProvider, resolveEnv } from "./openai-compat";

export interface OllamaProviderOptions {
	/** Ollama doesn't authenticate by default; only needed for proxied/secured setups. */
	apiKey?: string;
	/** Must already be pulled locally (`ollama pull <model>`). Default "llama3.1". */
	model?: string;
	/** Ollama's OpenAI-compatible endpoint. Default "http://localhost:11434/v1/chat/completions". */
	baseUrl?: string;
	timeoutMs?: number;
}

/**
 * ILLMProvider backed by a local (or remote) Ollama server's OpenAI-compatible
 * chat completions endpoint. No API key is required for a default local
 * install - `apiKey` exists for proxied/secured Ollama deployments.
 */
export class OllamaProvider extends OpenAICompatProvider {
	name = "Ollama";
	protected baseUrl: string;
	protected model: string;

	constructor(options: OllamaProviderOptions = {}) {
		const env = resolveEnv();
		const resolvedKey =
			options.apiKey ||
			env?.AI_HEALER_OLLAMA_KEY ||
			env?.OLLAMA_API_KEY ||
			"ollama";
		const timeoutMs = options.timeoutMs ?? 10000;

		super(resolvedKey, timeoutMs);
		this.model = options.model ?? "llama3.1";
		this.baseUrl =
			options.baseUrl ??
			env?.AI_HEALER_OLLAMA_URL ??
			"http://localhost:11434/v1/chat/completions";
	}
}
