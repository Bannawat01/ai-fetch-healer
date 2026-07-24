import type { HealingRule, JsonValue, LLMResponse } from "../types";
import { DEFAULT_MODELS, resolveModelChain } from "./models";
import { buildHealedPayloadStub, buildHealPrompt } from "./prompt";
import { BaseLLMProvider } from "./provider";

export interface OpenRouterProviderOptions {
	apiKey?: string;
	/** Any OpenRouter-routed model id. Default from the registry ("openai/gpt-4o-mini"). */
	model?: string;
	/** Ordered fallback chain of OpenRouter model ids; the first available one wins. Overrides `model`. */
	models?: string[];
	timeoutMs?: number;
}

/**
 * ILLMProvider backed by OpenRouter (OpenAI-compatible chat completions).
 * Resolves the API key in order: constructor arg -> options.apiKey ->
 * AI_HEALER_OPENROUTER_KEY -> OPENROUTER_API_KEY -> GEMINI_API_KEY (legacy fallback).
 * Throws synchronously in the constructor if no key can be resolved.
 */
export class OpenRouterProvider extends BaseLLMProvider {
	name = "OpenRouter";
	private models: string[];

	/** Primary model id (first in the chain). Kept for logging/back-compat. */
	protected get model(): string {
		return this.models[0];
	}

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

		const timeoutMs = options.timeoutMs ?? 10000;

		if (!resolvedKey) {
			throw new Error(
				"[ai-fetch-healer] OpenRouter API Key is missing. " +
					"Please provide it in the constructor or set AI_HEALER_OPENROUTER_KEY in your .env file.",
			);
		}

		super(resolvedKey, timeoutMs);
		this.models = resolveModelChain({
			explicit: options.models ?? options.model,
			envVar: "AI_HEALER_OPENROUTER_MODEL",
			fallback: DEFAULT_MODELS.openrouter,
		});
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const url = "https://openrouter.ai/api/v1/chat/completions";

		const systemInstruction = buildHealPrompt(schema, errorDetails);
		let lastError: Error | undefined;

		for (let i = 0; i < this.models.length; i++) {
			const model = this.models[i];
			const hasNext = i < this.models.length - 1;
			const { controller, timeoutId } = this.createTimeoutController();
			try {
				const response = await fetch(url, {
					method: "POST",
					signal: controller.signal,
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://github.com/Bannawat01/ai-fetch-healer",
						"X-Title": "AI Fetch Healer",
					},
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: systemInstruction }],
						response_format: { type: "json_object" },
					}),
				});

				if (!response.ok) {
					const err = await response.text();

					if (response.status === 404) {
						// Deprecated/renamed model + another to try -> fall through.
						if (hasNext) {
							lastError = new Error(
								`OpenRouter model "${model}" not found (404); trying next.`,
							);
							continue;
						}
						throw new Error(
							`OpenRouter Error: model "${model}" not found (404). ` +
								`It may have been deprecated or renamed - check https://openrouter.ai/models for a valid model id. ${err}`,
						);
					}

					if (response.status === 401) {
						throw new Error(
							`OpenRouter Error: authentication failed (401). Check your API key. ${err}`,
						);
					}

					throw new Error(`OpenRouter Error: ${err}`);
				}

				const body = await this.readResponseBodySafe(response);
				if (!body || typeof body !== "object") {
					throw new Error("OpenRouter returned non-JSON response body");
				}

				const data = body as {
					choices?: Array<{ message?: { content?: string } }>;
				};
				const aiContent = data.choices?.[0]?.message?.content;
				if (!aiContent || typeof aiContent !== "string") {
					throw new Error("OpenRouter response is missing JSON content");
				}

				const rule: HealingRule = JSON.parse(aiContent);

				return { healedPayload: buildHealedPayloadStub(rule), rule };
			} catch (error: unknown) {
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error("OpenRouter request timed out");
				}
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to heal via OpenRouter: ${message}`);
			} finally {
				clearTimeout(timeoutId);
			}
		}

		// Exhausted the chain: every model 404'd.
		throw new Error(
			`Failed to heal via OpenRouter: ${lastError?.message ?? "no models configured"}`,
		);
	}
}
