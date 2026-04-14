import type {
	HealingRule,
	JsonPayload,
	JsonValue,
	LLMResponse,
} from "../types";
import { BaseLLMProvider } from "./provider";

export class GeminiProvider extends BaseLLMProvider {
	name = "Gemini (Google)";
	private model = "gemini-2.5-flash";

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

		const systemInstruction = `
      You are an expert API auto-healing system.
      The user tried to send a payload to an API, but it failed with an error.
      Your task is to map the incorrect payload schema to the required format based on the error.
      
      Original Schema: ${JSON.stringify(schema)}
      Error Details: ${errorDetails}
      
      Respond strictly in JSON format matching this structure:
      {
        "action": "MAP_FIELDS" | "CHANGE_TYPE" | "ADD_REQUIRED",
        "mapping": { "old_key_name": "new_key_name" },
        "suggestion": "Brief explanation of what was fixed"
      }
    `;

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

			const data = await response.json();
			const aiResponseText = data.candidates[0].content.parts[0].text;

			const rule: HealingRule = JSON.parse(aiResponseText);

			const healedPayload: JsonPayload = {};
			const mapping = rule.mapping ?? {};
			for (const [, newKey] of Object.entries(mapping)) {
				healedPayload[newKey] = "mapped_value";
			}

			return { healedPayload, rule };
		} catch (error: any) {
			if (error?.name === "AbortError") {
				throw new Error("Gemini request timed out");
			}
			throw new Error(`Failed to heal via Gemini: ${error.message}`);
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
