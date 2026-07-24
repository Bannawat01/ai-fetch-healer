import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileRuleStore } from "../../src/stores/file";
import type { HealingRule } from "../../src/types";

const rule = (suffix: string): HealingRule => ({
	action: "MAP_FIELDS",
	mapping: { old: `new_${suffix}` },
});

describe("FileRuleStore", () => {
	let dir: string;
	let filePath: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "ai-fetch-healer-store-"));
		filePath = join(dir, "rules.json");
	});

	afterEach(() => {
		vi.useRealTimers();
		rmSync(dir, { recursive: true, force: true });
	});

	it("persists rules across store instances (survives a restart)", async () => {
		const first = new FileRuleStore({ filePath });
		await first.set("POST:/users:sig", rule("a"));

		const second = new FileRuleStore({ filePath });
		expect(await second.get("POST:/users:sig")).toEqual(rule("a"));
	});

	it("returns null for a key that was never set", async () => {
		const store = new FileRuleStore({ filePath });
		expect(await store.get("missing")).toBeNull();
	});

	it("starts empty on a corrupt file instead of throwing", async () => {
		writeFileSync(filePath, "{ not valid json", "utf8");

		const store = new FileRuleStore({ filePath });
		expect(await store.get("any")).toBeNull();

		await store.set("k", rule("a"));
		expect(await store.get("k")).toEqual(rule("a"));
	});

	it("expires entries after ttlMs, including across restarts", async () => {
		vi.useFakeTimers();
		const store = new FileRuleStore({ filePath, ttlMs: 1000 });
		await store.set("k", rule("a"));

		vi.advanceTimersByTime(1001);
		expect(await store.get("k")).toBeNull();

		const reopened = new FileRuleStore({ filePath, ttlMs: 1000 });
		expect(await reopened.get("k")).toBeNull();
	});

	it("evicts the oldest entry once maxEntries is reached", async () => {
		const store = new FileRuleStore({ filePath, maxEntries: 2 });
		await store.set("first", rule("1"));
		await store.set("second", rule("2"));
		await store.set("third", rule("3"));

		expect(await store.get("first")).toBeNull();
		expect(await store.get("second")).toEqual(rule("2"));
		expect(await store.get("third")).toEqual(rule("3"));
	});

	it("serializes concurrent set() calls into one consistent file", async () => {
		const store = new FileRuleStore({ filePath });
		await Promise.all([
			store.set("a", rule("a")),
			store.set("b", rule("b")),
			store.set("c", rule("c")),
		]);

		const onDisk = JSON.parse(readFileSync(filePath, "utf8"));
		expect(Object.keys(onDisk.entries).sort()).toEqual(["a", "b", "c"]);
	});

	it("clear() empties the store and the file", async () => {
		const store = new FileRuleStore({ filePath });
		await store.set("k", rule("a"));
		await store.clear();

		const reopened = new FileRuleStore({ filePath });
		expect(await reopened.get("k")).toBeNull();
	});
});
