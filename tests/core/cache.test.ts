import { describe, expect, it, vi } from "vitest";
import { HeuristicCache } from "../../src/core/cache";
import type { HealingRule } from "../../src/types";

const rule = (suggestion: string): HealingRule => ({
	action: "MAP_FIELDS",
	mapping: { old: "new" },
	suggestion,
});

describe("HeuristicCache", () => {
	it("stores and retrieves a rule by key", () => {
		const cache = new HeuristicCache();
		cache.set("k1", rule("a"));

		expect(cache.get("k1")).toEqual(rule("a"));
		expect(cache.has("k1")).toBe(true);
	});

	it("returns null for a missing key", () => {
		const cache = new HeuristicCache();

		expect(cache.get("missing")).toBeNull();
		expect(cache.has("missing")).toBe(false);
	});

	it("evicts the least-recently-used entry at capacity, not just the oldest inserted", () => {
		const cache = new HeuristicCache(2);
		cache.set("a", rule("a"));
		cache.set("b", rule("b"));

		cache.get("a");

		cache.set("c", rule("c"));

		expect(cache.get("a")).toEqual(rule("a"));
		expect(cache.get("b")).toBeNull();
		expect(cache.get("c")).toEqual(rule("c"));
	});

	it("expires entries after ttlMs elapses", () => {
		vi.useFakeTimers();
		try {
			const cache = new HeuristicCache({ maxEntries: 10, ttlMs: 1000 });
			cache.set("k1", rule("a"));

			expect(cache.get("k1")).toEqual(rule("a"));

			vi.advanceTimersByTime(1001);

			expect(cache.get("k1")).toBeNull();
			expect(cache.has("k1")).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps entries forever when ttlMs is not set", () => {
		vi.useFakeTimers();
		try {
			const cache = new HeuristicCache();
			cache.set("k1", rule("a"));

			vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365);

			expect(cache.get("k1")).toEqual(rule("a"));
		} finally {
			vi.useRealTimers();
		}
	});

	it("clear() empties all entries", () => {
		const cache = new HeuristicCache();
		cache.set("k1", rule("a"));
		cache.clear();

		expect(cache.get("k1")).toBeNull();
	});

	it("generateKey is stable for identical inputs and differs by method/url/payload", () => {
		const cache = new HeuristicCache();
		const payload = { foo: "string" };

		const k1 = cache.generateKey("post", "/a", payload);
		const k2 = cache.generateKey("POST", "/a", payload);
		const k3 = cache.generateKey("POST", "/b", payload);
		const k4 = cache.generateKey("POST", "/a", { foo: "number" });

		expect(k1).toBe(k2);
		expect(k1).not.toBe(k3);
		expect(k1).not.toBe(k4);
	});
});
