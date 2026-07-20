import type { HealingRule, JsonValue, LLMResponse } from "../types";
import { buildHealedPayloadStub, buildHealPrompt } from "./prompt";
import { BaseLLMProvider } from "./provider";

/** ILLMProvider backed by Google's Gemini API. Reads no env var itself - pass an apiKey via the BaseLLMProvider constructor. */
export class GeminiProvider extends BaseLLMProvider {
	name = "Gemini (Google)";
	private model = "gemini-2.5-flash";

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

		const systemInstruction = buildHealPrompt(schema, errorDetails);

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
				throw new Error(`Gemini API Error: ${response.statusText}`);
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
}
