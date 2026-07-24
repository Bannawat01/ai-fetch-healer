import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../../src/llm/openrouter";

describe("OpenRouterProvider", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("uses text fallback when response is not JSON and throws controlled error", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("", {
				status: 200,
				headers: { "content-type": "text/plain; charset=utf-8" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenRouterProvider("test-api-key");

		let thrown: unknown;
		try {
			await provider.heal({ foo: "bar" }, "400 Bad Request");
		} catch (error) {
			thrown = error;
		}

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(thrown).toBeInstanceOf(Error);

		const message = (thrown as Error).message;
		expect(message).toContain("OpenRouter returned non-JSON response body");
		expect(message).not.toContain("Unexpected end of JSON input");
	});

	it("handles empty body with application/json content-type without JSON parse crash", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response("", {
				status: 200,
				headers: { "content-type": "application/json; charset=utf-8" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenRouterProvider("test-api-key");

		let thrown: unknown;
		try {
			await provider.heal({ foo: "bar" }, "400 Bad Request");
		} catch (error) {
			thrown = error;
		}

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(thrown).toBeInstanceOf(Error);

		const message = (thrown as Error).message;
		expect(message).toContain("OpenRouter returned non-JSON response body");
		expect(message).not.toContain("Unexpected end of JSON input");
	});

	it("gives an actionable hint when the model id 404s", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("model not found", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenRouterProvider("test-api-key", {
			model: "some/deprecated-model",
		});

		await expect(
			provider.heal({ foo: "bar" }, "400 Bad Request"),
		).rejects.toThrow(
			/model "some\/deprecated-model" not found \(404\).*openrouter\.ai\/models/s,
		);
	});

	it("gives an actionable hint on 401 auth failure", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("invalid key", { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenRouterProvider("bad-key");

		await expect(
			provider.heal({ foo: "bar" }, "400 Bad Request"),
		).rejects.toThrow(/authentication failed \(401\)/);
	});

	it("falls back to the next model when the first 404s", async () => {
		const okBody = JSON.stringify({
			choices: [
				{
					message: {
						content: JSON.stringify({ action: "MAP_FIELDS", mapping: {} }),
					},
				},
			],
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("model not found", { status: 404 }))
			.mockResolvedValueOnce(
				new Response(okBody, {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenRouterProvider("test-api-key", {
			models: ["vendor/dead", "vendor/live"],
		});
		const result = await provider.heal({ foo: "bar" }, "400 Bad Request");

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe(
			"vendor/live",
		);
		expect(result.rule).toEqual({ action: "MAP_FIELDS", mapping: {} });
	});

	it("still surfaces the actionable 404 hint when the last model 404s", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("gone", { status: 404 }))
			.mockResolvedValueOnce(new Response("gone", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		const provider = new OpenRouterProvider("test-api-key", {
			models: ["vendor/dead-a", "vendor/dead-b"],
		});

		await expect(
			provider.heal({ foo: "bar" }, "400 Bad Request"),
		).rejects.toThrow(/vendor\/dead-b.*openrouter\.ai\/models/s);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("defaults to a currently-active model id", () => {
		// Regression guard: the previous default (google/gemini-2.0-flash-001)
		// was deprecated by OpenRouter and 404s on every request out of the box.
		const provider = new OpenRouterProvider("test-api-key") as unknown as {
			model: string;
		};
		expect(provider.model).not.toBe("google/gemini-2.0-flash-001");
	});
});
