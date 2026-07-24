import { describe, expect, it, vi } from "vitest";
import { FallbackProvider } from "../../src/llm/fallback";
import type { ILLMProvider, LLMResponse } from "../../src/types";

function provider(name: string, impl: ILLMProvider["heal"]): ILLMProvider {
	return { name, heal: vi.fn(impl) };
}

const rule = { action: "MAP_FIELDS", mapping: { a: "b" } } as const;
const ok: LLMResponse = { healedPayload: {}, rule };

describe("FallbackProvider", () => {
	it("throws when constructed with no providers", () => {
		expect(() => new FallbackProvider([])).toThrow(
			/needs at least one provider/,
		);
	});

	it("returns the first provider's result without calling later ones", async () => {
		const first = provider("First", async () => ok);
		const second = provider("Second", async () => ok);

		const fallback = new FallbackProvider([first, second]);
		const result = await fallback.heal({ a: "string" }, "400");

		expect(result).toEqual(ok);
		expect(first.heal).toHaveBeenCalledTimes(1);
		expect(second.heal).not.toHaveBeenCalled();
	});

	it("falls through to the next provider when an earlier one throws", async () => {
		const first = provider("First", async () => {
			throw new Error("no deterministic fix");
		});
		const second = provider("Second", async () => ok);

		const fallback = new FallbackProvider([first, second]);
		const result = await fallback.heal({ a: "string" }, "400");

		expect(result).toEqual(ok);
		expect(first.heal).toHaveBeenCalledTimes(1);
		expect(second.heal).toHaveBeenCalledTimes(1);
	});

	it("propagates the last error (labeled) when every provider fails", async () => {
		const first = provider("First", async () => {
			throw new Error("heuristic miss");
		});
		const second = provider("Second", async () => {
			throw new Error("LLM down");
		});

		const fallback = new FallbackProvider([first, second]);

		await expect(fallback.heal({ a: "string" }, "400")).rejects.toThrow(
			/Failed to heal via Fallback.*LLM down/,
		);
	});

	it("names itself after the chain", () => {
		const fallback = new FallbackProvider([
			provider("Heuristic (no LLM)", async () => ok),
			provider("OpenRouter", async () => ok),
		]);

		expect(fallback.name).toBe("Fallback(Heuristic (no LLM) -> OpenRouter)");
	});
});
