import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../src/llm/anthropic";

function messagesResponse(text: string): Response {
	return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

describe("AnthropicProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("throws synchronously when no API key can be resolved", () => {
		vi.stubEnv("AI_HEALER_ANTHROPIC_KEY", "");
		vi.stubEnv("ANTHROPIC_API_KEY", "");

		expect(() => new AnthropicProvider()).toThrow(
			/Anthropic API Key is missing/,
		);
	});

	it("resolves API key from ANTHROPIC_API_KEY env var", () => {
		vi.stubEnv("AI_HEALER_ANTHROPIC_KEY", "");
		vi.stubEnv("ANTHROPIC_API_KEY", "env-key");

		expect(() => new AnthropicProvider()).not.toThrow();
	});

	it("posts to the Messages API with x-api-key and version headers", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { old: "new" } };
		const fetchMock = vi
			.fn()
			.mockResolvedValue(messagesResponse(JSON.stringify(rule)));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("secret-key");
		const result = await provider.heal({ foo: "string" }, "400 Bad Request");

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.anthropic.com/v1/messages",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"x-api-key": "secret-key",
					"anthropic-version": "2023-06-01",
				}),
			}),
		);
		expect(result.rule).toEqual(rule);
	});

	it("extracts the rule even when Claude wraps it in prose / a fence", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { a: "b" } };
		const wrapped = `Here is the fix:\n\`\`\`json\n${JSON.stringify(rule)}\n\`\`\`\nHope that helps.`;
		const fetchMock = vi.fn().mockResolvedValue(messagesResponse(wrapped));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("secret-key");
		const result = await provider.heal({ foo: "string" }, "400");

		expect(result.rule).toEqual(rule);
	});

	it("falls back to the next model when the first is unavailable", async () => {
		const rule = { action: "MAP_FIELDS", mapping: {} };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("model not found", { status: 404 }))
			.mockResolvedValueOnce(messagesResponse(JSON.stringify(rule)));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("secret-key", {
			models: ["dead-model", "live-model"],
		});
		const result = await provider.heal({ foo: "string" }, "422");

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe(
			"live-model",
		);
		expect(result.rule).toEqual(rule);
	});

	it("labels a 401 as an authentication failure", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("bad key", { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("secret-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/authentication failed \(401\)/,
		);
	});

	it("throws when the response carries no JSON object", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(messagesResponse("sorry, I cannot help with that"));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("secret-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/Failed to heal via Anthropic/,
		);
	});

	it("maps an AbortError into a timeout message", async () => {
		const abort = new Error("aborted");
		abort.name = "AbortError";
		const fetchMock = vi.fn().mockRejectedValue(abort);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new AnthropicProvider("secret-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/Anthropic request timed out/,
		);
	});
});
