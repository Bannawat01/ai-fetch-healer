import type { HealingRule, JsonValue, LLMResponse } from "../types";
import {
	DEFAULT_MODELS,
	isModelUnavailableError,
	resolveModelChain,
} from "./models";
import { buildHealedPayloadStub, buildHealPrompt } from "./prompt";
import { BaseLLMProvider } from "./provider";

/**
 * ILLMProvider backed by Google's Gemini API. Reads no env var for the key -
 * pass an apiKey via the BaseLLMProvider constructor.
 *
 * Model resolution: AI_HEALER_GEMINI_MODEL (comma-separated) -> registry default
 * ("gemini-2.5-flash"). Deprecated models auto-fall back to the next in the chain.
 */
export class GeminiProvider extends BaseLLMProvider {
	name = "Gemini (Google)";
	private models: string[] = resolveModelChain({
		envVar: "AI_HEALER_GEMINI_MODEL",
		fallback: DEFAULT_MODELS.gemini,
	});

	/** Primary model id (first in the chain). Kept for logging/back-compat. */
	protected get model(): string {
		return this.models[0];
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const systemInstruction = buildHealPrompt(schema, errorDetails);
		let lastError: Error | undefined;

		for (let i = 0; i < this.models.length; i++) {
			const model = this.models[i];
			const hasNext = i < this.models.length - 1;
			const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

			const { controller, timeoutId } = this.createTimeoutController();
			try {
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					signal: controller.signal,
					body: JSON.stringify({
						contents: [{ parts: [{ text: systemInstruction }] }],
						generationConfig: { responseMimeType: "application/json" },
					}),
				});

				if (!response.ok) {
					const err = await response.text();
					if (hasNext && isModelUnavailableError(response.status, err)) {
						lastError = new Error(
							`Gemini model "${model}" unavailable (${response.status}); trying next.`,
						);
						continue;
					}
					throw new Error(
						`Gemini API Error: ${response.statusText || response.status}`,
					);
				}

				const body = await this.readResponseBodySafe(response);
				if (!body || typeof body !== "object") {
					throw new Error("Gemini returned non-JSON response body");
				}

				const data = body as {
					candidates?: Array<{
						content?: { parts?: Array<{ text?: string }> };
					}>;
				};
				const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
				if (!aiResponseText || typeof aiResponseText !== "string") {
					throw new Error("Gemini response is missing JSON content");
				}

				const rule: HealingRule = JSON.parse(aiResponseText);

				return { healedPayload: buildHealedPayloadStub(rule), rule };
			} catch (error: unknown) {
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error("Gemini request timed out");
				}
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to heal via Gemini: ${message}`);
			} finally {
				clearTimeout(timeoutId);
			}
		}

		throw new Error(
			`Failed to heal via Gemini: ${lastError?.message ?? "no models configured"}`,
		);
	}
}
