import { bench, describe } from "vitest";
import { HeuristicCache } from "../src/core/cache";
import type { HealingRule } from "../src/types";

const rule: HealingRule = {
	action: "MAP_FIELDS",
	mapping: { old_key: "new_key" },
	suggestion: "renamed field",
};

describe("HeuristicCache - hit/miss lookup cost", () => {
	const warmCache = new HeuristicCache(1000);
	for (let i = 0; i < 1000; i++) {
		warmCache.set(`key-${i}`, rule);
	}

	bench("get() - hit, cache at capacity (1000 entries)", () => {
		warmCache.get("key-500");
	});

	bench("get() - miss, cache at capacity (1000 entries)", () => {
		warmCache.get("key-does-not-exist");
	});

	bench("generateKey() - typical small payload", () => {
		warmCache.generateKey("POST", "https://api.example.com/users", {
			name: "string",
			age: "number",
		});
	});
});
