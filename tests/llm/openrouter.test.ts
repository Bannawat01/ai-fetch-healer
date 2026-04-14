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
});
