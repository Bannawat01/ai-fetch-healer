import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqProvider } from "../../src/llm/groq";

describe("GroqProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("throws synchronously when no API key can be resolved", () => {
		vi.stubEnv("AI_HEALER_GROQ_KEY", "");
		vi.stubEnv("GROQ_API_KEY", "");

		expect(() => new GroqProvider()).toThrow(/Groq API Key is missing/);
	});

	it("resolves API key from AI_HEALER_GROQ_KEY env var", () => {
		vi.stubEnv("AI_HEALER_GROQ_KEY", "env-key");

		expect(() => new GroqProvider()).not.toThrow();
	});

	it("posts to the Groq chat completions endpoint and parses the rule", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									action: "MAP_FIELDS",
									mapping: { old: "new" },
								}),
							},
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GroqProvider("test-api-key");
		const result = await provider.heal({ foo: "string" }, "400 Bad Request");

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.groq.com/openai/v1/chat/completions",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer test-api-key",
				}),
			}),
		);
		expect(result.rule).toEqual({
			action: "MAP_FIELDS",
			mapping: { old: "new" },
		});
	});

	it("wraps a failed response in a Groq-labeled error", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("", {
				status: 200,
				headers: { "content-type": "text/plain" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GroqProvider("test-api-key");

		await expect(
			provider.heal({ foo: "string" }, "400 Bad Request"),
		).rejects.toThrow(/Failed to heal via Groq/);
	});
});
