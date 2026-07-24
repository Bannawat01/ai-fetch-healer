import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createHealedFetchFromEnv,
	createProviderFromEnv,
} from "../../src/core/from-env";

describe("createProviderFromEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("picks OpenRouterProvider when AI_HEALER_OPENROUTER_KEY is set", () => {
		vi.stubEnv("AI_HEALER_OPENROUTER_KEY", "or-key");

		expect(createProviderFromEnv().name).toBe("OpenRouter");
	});

	it("picks OpenRouterProvider when only OPENROUTER_API_KEY is set", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "or-key");

		expect(createProviderFromEnv().name).toBe("OpenRouter");
	});

	it("prefers OpenRouter over Groq when both keys are present", () => {
		vi.stubEnv("AI_HEALER_OPENROUTER_KEY", "or-key");
		vi.stubEnv("AI_HEALER_GROQ_KEY", "groq-key");

		expect(createProviderFromEnv().name).toBe("OpenRouter");
	});

	it("picks GroqProvider when only a Groq key is set", () => {
		vi.stubEnv("AI_HEALER_GROQ_KEY", "groq-key");

		expect(createProviderFromEnv().name).toBe("Groq");
	});

	it("picks GeminiProvider directly when only GEMINI_API_KEY is set", () => {
		vi.stubEnv("GEMINI_API_KEY", "gemini-key");

		expect(createProviderFromEnv().name).toBe("Gemini (Google)");
	});

	it("picks OllamaProvider only when explicitly signaled via AI_HEALER_OLLAMA_URL", () => {
		vi.stubEnv(
			"AI_HEALER_OLLAMA_URL",
			"http://localhost:11434/v1/chat/completions",
		);

		expect(createProviderFromEnv().name).toBe("Ollama");
	});

	it("does not fall back to Ollama when no env vars are set at all", () => {
		expect(() => createProviderFromEnv()).toThrow(
			/No LLM provider credentials found/,
		);
	});

	it("throws an actionable error listing the env vars it checked", () => {
		expect(() => createProviderFromEnv()).toThrow(
			/AI_HEALER_OPENROUTER_KEY.*AI_HEALER_GROQ_KEY.*GEMINI_API_KEY.*AI_HEALER_OLLAMA_URL/s,
		);
	});
});

describe("createHealedFetchFromEnv", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("returns a working healedFetch wired to the auto-detected provider", async () => {
		vi.stubEnv("AI_HEALER_GROQ_KEY", "groq-key");

		const fetchMock = vi.fn().mockResolvedValue(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const healedFetch = createHealedFetchFromEnv({
			fetchFunction: fetchMock as unknown as typeof fetch,
		});
		const response = await healedFetch("https://api.example.com/data");

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("propagates the actionable error when no credentials are configured", () => {
		expect(() => createHealedFetchFromEnv()).toThrow(
			/No LLM provider credentials found/,
		);
	});
});
