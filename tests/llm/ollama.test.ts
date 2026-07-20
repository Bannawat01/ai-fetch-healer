import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../../src/llm/ollama";

describe("OllamaProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("never throws for a missing API key (not required for local Ollama)", () => {
		expect(() => new OllamaProvider()).not.toThrow();
	});

	it("defaults to the local Ollama OpenAI-compatible endpoint and model", async () => {
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

		const provider = new OllamaProvider();
		await provider.heal({ foo: "string" }, "400 Bad Request");

		expect(fetchMock).toHaveBeenCalledWith(
			"http://localhost:11434/v1/chat/completions",
			expect.objectContaining({ method: "POST" }),
		);

		const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(requestBody.model).toBe("llama3.1");
	});

	it("uses a custom baseUrl and model when provided", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({ action: "MAP_FIELDS", mapping: {} }),
							},
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OllamaProvider({
			baseUrl: "http://my-ollama-host:11434/v1/chat/completions",
			model: "mistral",
		});
		await provider.heal({ foo: "string" }, "400 Bad Request");

		expect(fetchMock).toHaveBeenCalledWith(
			"http://my-ollama-host:11434/v1/chat/completions",
			expect.anything(),
		);

		const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(requestBody.model).toBe("mistral");
	});

	it("wraps a failed response in an Ollama-labeled error", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("", {
				status: 200,
				headers: { "content-type": "text/plain" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OllamaProvider();

		await expect(
			provider.heal({ foo: "string" }, "400 Bad Request"),
		).rejects.toThrow(/Failed to heal via Ollama/);
	});
});
