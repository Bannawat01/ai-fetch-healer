import type {
	HealingRule,
	JsonPayload,
	JsonValue,
	LLMResponse,
} from "../types";
import { BaseLLMProvider } from "./provider";

export interface OpenRouterProviderOptions {
	apiKey?: string;
	model?: string;
	timeoutMs?: number;
}

export class OpenRouterProvider extends BaseLLMProvider {
	name = "OpenRouter";
	private model: string;

	constructor();
	constructor(options: OpenRouterProviderOptions);
	constructor(apiKey: string);
	constructor(apiKey: string, options: OpenRouterProviderOptions);
	constructor(apiKey: string, model: string, timeoutMs?: number);
	constructor(
		apiKeyOrOptions?: string | OpenRouterProviderOptions,
		modelOrOptions: string | OpenRouterProviderOptions = {},
		timeoutMsArg?: number,
	) {
		let explicitApiKey: string | undefined;
		let options: OpenRouterProviderOptions = {};

		if (typeof apiKeyOrOptions === "string") {
			explicitApiKey = apiKeyOrOptions;

			if (typeof modelOrOptions === "string") {
				options = {
					model: modelOrOptions,
					timeoutMs: timeoutMsArg,
				};
			} else {
				options = modelOrOptions;
			}
		} else if (typeof apiKeyOrOptions === "object" && apiKeyOrOptions) {
			options = apiKeyOrOptions;
		}

		const env = (
			globalThis as { process?: { env?: Record<string, string | undefined> } }
		).process?.env;
		const resolvedKey =
			explicitApiKey ||
			options.apiKey ||
			env?.AI_HEALER_OPENROUTER_KEY ||
			env?.OPENROUTER_API_KEY ||
			env?.GEMINI_API_KEY;

		const model = options.model ?? "google/gemini-2.0-flash-001";
		const timeoutMs = options.timeoutMs ?? 10000;

		if (!resolvedKey) {
			throw new Error(
				"[ai-fetch-healer] OpenRouter API Key is missing. " +
					"Please provide it in the constructor or set AI_HEALER_OPENROUTER_KEY in your .env file.",
			);
		}

		super(resolvedKey, timeoutMs);
		this.model = model;
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const url = "https://openrouter.ai/api/v1/chat/completions";

		const systemInstruction = `
      You are an expert API auto-healing system. 
      Analyze the failed payload schema and error message to provide a fix.
      Original Schema: ${JSON.stringify(schema)}
      Error: ${errorDetails}
      
      Respond strictly in JSON:
      {
        "action": "MAP_FIELDS" | "CHANGE_TYPE",
        "mapping": { "old_key": "new_key" },
        "suggestion": "string"
      }
    `;

		const { controller, timeoutId } = this.createTimeoutController();
		try {
			const response = await fetch(url, {
				method: "POST",
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://github.com/bannawat-r/ai-fetch-healer",
					"X-Title": "AI Fetch Healer",
				},
				body: JSON.stringify({
					model: this.model,
					messages: [{ role: "user", content: systemInstruction }],
					response_format: { type: "json_object" },
				}),
			});

			if (!response.ok) {
				const err = await response.text();
				throw new Error(`OpenRouter Error: ${err}`);
			}

			const data = await response.json();
			const rule: HealingRule = JSON.parse(data.choices[0].message.content);

			const healedPayload: JsonPayload = {};
			const mapping = rule.mapping ?? {};
			for (const [, newKey] of Object.entries(mapping)) {
				healedPayload[newKey] = "mapped_value";
			}

			return { healedPayload, rule };
		} catch (error: any) {
			if (error?.name === "AbortError") {
				throw new Error("OpenRouter request timed out");
			}
			throw new Error(`Failed to heal via OpenRouter: ${error.message}`);
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
