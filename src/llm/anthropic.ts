import type { HealingRule, JsonValue, LLMResponse } from "../types";
import {
	DEFAULT_MODELS,
	isModelUnavailableError,
	resolveModelChain,
} from "./models";
import { resolveEnv } from "./openai-compat";
import { buildHealedPayloadStub, buildHealPrompt } from "./prompt";
import { BaseLLMProvider } from "./provider";

export interface AnthropicProviderOptions {
	apiKey?: string;
	/** Any Anthropic model id. Default from the registry ("claude-3-5-haiku-latest"). */
	model?: string;
	/** Ordered fallback chain of Anthropic model ids; the first available one wins. Overrides `model`. */
	models?: string[];
	timeoutMs?: number;
	/** Max tokens for the completion. Default 1024 - a healing rule is tiny. */
	maxTokens?: number;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Anthropic returns free-form text, not a guaranteed JSON body, so the model
 * may wrap the rule in prose or a markdown fence. Pull out the first balanced
 * JSON object rather than trusting the whole string to `JSON.parse`.
 */
function extractJsonObject(text: string): string {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end === -1 || end < start) {
		throw new Error("no JSON object found in response");
	}
	return text.slice(start, end + 1);
}

/**
 * ILLMProvider backed by Anthropic's Messages API (Claude).
 * Resolves the API key in order: constructor arg -> options.apiKey ->
 * AI_HEALER_ANTHROPIC_KEY -> ANTHROPIC_API_KEY. Throws synchronously in the
 * constructor if no key can be resolved.
 *
 * Model resolution: options.models/model -> AI_HEALER_ANTHROPIC_MODEL
 * (comma-separated) -> registry default. Deprecated models auto-fall back to
 * the next in the chain.
 */
export class AnthropicProvider extends BaseLLMProvider {
	name = "Anthropic (Claude)";
	private models: string[];
	private maxTokens: number;

	/** Primary model id (first in the chain). Kept for logging/back-compat. */
	protected get model(): string {
		return this.models[0];
	}

	constructor();
	constructor(options: AnthropicProviderOptions);
	constructor(apiKey: string, options?: AnthropicProviderOptions);
	constructor(
		apiKeyOrOptions?: string | AnthropicProviderOptions,
		options: AnthropicProviderOptions = {},
	) {
		const resolvedOptions: AnthropicProviderOptions =
			typeof apiKeyOrOptions === "string"
				? { ...options, apiKey: apiKeyOrOptions }
				: (apiKeyOrOptions ?? {});

		const env = resolveEnv();
		const resolvedKey =
			resolvedOptions.apiKey ||
			env?.AI_HEALER_ANTHROPIC_KEY ||
			env?.ANTHROPIC_API_KEY;
		const timeoutMs = resolvedOptions.timeoutMs ?? 10000;

		if (!resolvedKey) {
			throw new Error(
				"[ai-fetch-healer] Anthropic API Key is missing. " +
					"Please provide it in the constructor or set AI_HEALER_ANTHROPIC_KEY in your .env file.",
			);
		}

		super(resolvedKey, timeoutMs);
		this.maxTokens = resolvedOptions.maxTokens ?? 1024;
		this.models = resolveModelChain({
			explicit: resolvedOptions.models ?? resolvedOptions.model,
			envVar: "AI_HEALER_ANTHROPIC_MODEL",
			fallback: DEFAULT_MODELS.anthropic,
		});
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const systemInstruction = buildHealPrompt(schema, errorDetails);
		let lastError: Error | undefined;

		for (let i = 0; i < this.models.length; i++) {
			const model = this.models[i];
			const hasNext = i < this.models.length - 1;
			const { controller, timeoutId } = this.createTimeoutController();
			try {
				const response = await fetch(ANTHROPIC_URL, {
					method: "POST",
					signal: controller.signal,
					headers: {
						"x-api-key": this.apiKey,
						"anthropic-version": ANTHROPIC_VERSION,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model,
						max_tokens: this.maxTokens,
						messages: [{ role: "user", content: systemInstruction }],
					}),
				});

				if (!response.ok) {
					const err = await response.text();
					if (hasNext && isModelUnavailableError(response.status, err)) {
						lastError = new Error(
							`Anthropic model "${model}" unavailable (${response.status}); trying next.`,
						);
						continue;
					}
					if (response.status === 401) {
						throw new Error(
							`Anthropic Error: authentication failed (401). Check your API key. ${err}`,
						);
					}
					throw new Error(`Anthropic Error: ${err}`);
				}

				const body = await this.readResponseBodySafe(response);
				if (!body || typeof body !== "object") {
					throw new Error("Anthropic returned non-JSON response body");
				}

				const data = body as {
					content?: Array<{ type?: string; text?: string }>;
				};
				const aiContent = data.content?.find(
					(block) => typeof block.text === "string",
				)?.text;
				if (!aiContent || typeof aiContent !== "string") {
					throw new Error("Anthropic response is missing text content");
				}

				const rule: HealingRule = JSON.parse(extractJsonObject(aiContent));

				return { healedPayload: buildHealedPayloadStub(rule), rule };
			} catch (error: unknown) {
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error("Anthropic request timed out");
				}
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to heal via Anthropic: ${message}`);
			} finally {
				clearTimeout(timeoutId);
			}
		}

		throw new Error(
			`Failed to heal via Anthropic: ${lastError?.message ?? "no models configured"}`,
		);
	}
}
