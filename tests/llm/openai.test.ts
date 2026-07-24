import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../../src/llm/openai";

function chatResponse(rule: unknown): Response {
	return new Response(
		JSON.stringify({
			choices: [{ message: { content: JSON.stringify(rule) } }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

describe("OpenAIProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("throws synchronously when no API key can be resolved", () => {
		vi.stubEnv("AI_HEALER_OPENAI_KEY", "");
		vi.stubEnv("OPENAI_API_KEY", "");

		expect(() => new OpenAIProvider()).toThrow(/OpenAI API Key is missing/);
	});

	it("resolves API key from OPENAI_API_KEY env var", () => {
		vi.stubEnv("AI_HEALER_OPENAI_KEY", "");
		vi.stubEnv("OPENAI_API_KEY", "env-key");

		expect(() => new OpenAIProvider()).not.toThrow();
	});

	it("posts to the OpenAI chat completions endpoint with a bearer token", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(chatResponse({ action: "MAP_FIELDS", mapping: {} }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider("secret-key");
		const result = await provider.heal({ foo: "string" }, "400 Bad Request");

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.openai.com/v1/chat/completions",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer secret-key",
				}),
			}),
		);
		expect(result.rule).toEqual({ action: "MAP_FIELDS", mapping: {} });
	});

	it("honors a custom baseUrl (OpenAI-compatible gateway)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(chatResponse({ action: "MAP_FIELDS", mapping: {} }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider("secret-key", {
			baseUrl: "https://gateway.example.com/v1/chat/completions",
		});
		await provider.heal({ foo: "string" }, "400");

		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://gateway.example.com/v1/chat/completions",
		);
	});

	it("falls back to the next model when the first 404s", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("model not found", { status: 404 }))
			.mockResolvedValueOnce(
				chatResponse({ action: "MAP_FIELDS", mapping: {} }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider("secret-key", {
			models: ["dead-model", "live-model"],
		});
		const result = await provider.heal({ foo: "string" }, "400");

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe(
			"live-model",
		);
		expect(result.rule).toEqual({ action: "MAP_FIELDS", mapping: {} });
	});

	it("wraps a failed response in an OpenAI-labeled error", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("boom", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenAIProvider("secret-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/Failed to heal via OpenAI/,
		);
	});
});
