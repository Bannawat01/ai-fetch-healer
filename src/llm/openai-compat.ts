import type { HealingRule, JsonValue, LLMResponse } from "../types";
import { isModelUnavailableError } from "./models";
import { buildHealedPayloadStub, buildHealPrompt } from "./prompt";
import { BaseLLMProvider } from "./provider";

/**
 * Shared heal() implementation for any backend exposing an OpenAI-compatible
 * `/chat/completions` endpoint (Groq, Ollama, and OpenRouter all qualify).
 * Subclasses set `name`, `baseUrl`, and `models` (an ordered fallback chain);
 * override `extraHeaders()` only if the backend needs attribution headers
 * beyond the Authorization one.
 */
export abstract class OpenAICompatProvider extends BaseLLMProvider {
	protected abstract baseUrl: string;
	/** Ordered model fallback chain; the first available one wins. */
	protected abstract models: string[];

	/** Primary model id (first in the chain). Kept for logging/back-compat. */
	protected get model(): string {
		return this.models[0];
	}

	protected extraHeaders(): Record<string, string> {
		return {};
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const systemInstruction = buildHealPrompt(schema, errorDetails);
		let lastError: Error | undefined;

		for (let i = 0; i < this.models.length; i++) {
			const model = this.models[i];
			const hasNext = i < this.models.length - 1;
			const { controller, timeoutId } = this.createTimeoutController();
			try {
				const response = await fetch(this.baseUrl, {
					method: "POST",
					signal: controller.signal,
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
						...this.extraHeaders(),
					},
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: systemInstruction }],
						response_format: { type: "json_object" },
					}),
				});

				if (!response.ok) {
					const err = await response.text();
					// Deprecated/unknown model + another model to try -> fall through.
					if (hasNext && isModelUnavailableError(response.status, err)) {
						lastError = new Error(
							`${this.name} model "${model}" unavailable (${response.status}); trying next.`,
						);
						continue;
					}
					throw new Error(`${this.name} Error: ${err}`);
				}

				const body = await this.readResponseBodySafe(response);
				if (!body || typeof body !== "object") {
					throw new Error(`${this.name} returned non-JSON response body`);
				}

				const data = body as {
					choices?: Array<{ message?: { content?: string } }>;
				};
				const aiContent = data.choices?.[0]?.message?.content;
				if (!aiContent || typeof aiContent !== "string") {
					throw new Error(`${this.name} response is missing JSON content`);
				}

				const rule: HealingRule = JSON.parse(aiContent);

				return { healedPayload: buildHealedPayloadStub(rule), rule };
			} catch (error: unknown) {
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error(`${this.name} request timed out`);
				}
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to heal via ${this.name}: ${message}`);
			} finally {
				clearTimeout(timeoutId);
			}
		}

		// Exhausted the chain: every model was unavailable.
		throw new Error(
			`Failed to heal via ${this.name}: ${lastError?.message ?? "no models configured"}`,
		);
	}
}

export function resolveEnv(): Record<string, string | undefined> | undefined {
	return (
		globalThis as { process?: { env?: Record<string, string | undefined> } }
	).process?.env;
}
