import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../../src/llm/gemini";

function geminiJsonResponse(rule: unknown): Response {
	return new Response(
		JSON.stringify({
			candidates: [{ content: { parts: [{ text: JSON.stringify(rule) }] } }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

describe("GeminiProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("parses a healing rule out of the Gemini candidates shape", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { old: "new" } };
		const fetchMock = vi.fn().mockResolvedValue(geminiJsonResponse(rule));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("test-key");
		const result = await provider.heal({ foo: "string" }, "400 Bad Request");

		expect(result.rule).toEqual(rule);
	});

	it("targets the model id and passes the api key in the request URL", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				geminiJsonResponse({ action: "MAP_FIELDS", mapping: {} }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("secret-key");
		await provider.heal({ foo: "string" }, "400 Bad Request");

		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain("gemini-2.5-flash:generateContent");
		expect(calledUrl).toContain("key=secret-key");
	});

	it("falls through to the next model when an earlier one is unavailable", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("model gone", { status: 404 }))
			.mockResolvedValueOnce(
				geminiJsonResponse({ action: "MAP_FIELDS", mapping: {} }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("test-key");
		// GeminiProvider has no ctor option for a model chain; set it directly.
		// biome-ignore lint/suspicious/noExplicitAny: reach past private for a focused test
		(provider as any).models = ["dead-model", "live-model"];

		const result = await provider.heal({ foo: "string" }, "422");

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0] as string).toContain("dead-model");
		expect(fetchMock.mock.calls[1][0] as string).toContain("live-model");
		expect(result.rule).toEqual({ action: "MAP_FIELDS", mapping: {} });
	});

	it("throws a labeled error on a non-OK response with no fallback left", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("boom", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("test-key");

		await expect(provider.heal({ foo: "string" }, "500")).rejects.toThrow(
			/Failed to heal via Gemini/,
		);
	});

	it("throws when the response body is not a JSON object", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("plain text", {
				status: 200,
				headers: { "content-type": "text/plain" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("test-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/Failed to heal via Gemini/,
		);
	});

	it("throws when the candidates shape has no text content", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ candidates: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("test-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/missing JSON content|Failed to heal via Gemini/,
		);
	});

	it("maps an AbortError into a timeout message", async () => {
		const abort = new Error("aborted");
		abort.name = "AbortError";
		const fetchMock = vi.fn().mockRejectedValue(abort);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new GeminiProvider("test-key");

		await expect(provider.heal({ foo: "string" }, "400")).rejects.toThrow(
			/Gemini request timed out/,
		);
	});
});
