import type { HealingRule, JsonValue, LLMResponse } from "../types";
import { buildHealedPayloadStub, buildHealPrompt } from "./prompt";
import { BaseLLMProvider } from "./provider";

/**
 * Shared heal() implementation for any backend exposing an OpenAI-compatible
 * `/chat/completions` endpoint (Groq, Ollama, and OpenRouter all qualify).
 * Subclasses set `name`, `baseUrl`, and `model`; override `extraHeaders()`
 * only if the backend needs attribution headers beyond the Authorization one.
 */
export abstract class OpenAICompatProvider extends BaseLLMProvider {
	protected abstract baseUrl: string;
	protected abstract model: string;

	protected extraHeaders(): Record<string, string> {
		return {};
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const systemInstruction = buildHealPrompt(schema, errorDetails);

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
					model: this.model,
					messages: [{ role: "user", content: systemInstruction }],
					response_format: { type: "json_object" },
				}),
			});

			if (!response.ok) {
				const err = await response.text();
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
}

export function resolveEnv(): Record<string, string | undefined> | undefined {
	return (
		globalThis as { process?: { env?: Record<string, string | undefined> } }
	).process?.env;
}
