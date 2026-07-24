import type { HealingRule, JsonValue } from "../types";
import { generateRuleKey, type RuleStore } from "./store";

interface CacheEntry {
	rule: HealingRule;
	expiresAt: number | null;
}

export interface HeuristicCacheOptions {
	/** Max entries before the least-recently-used one is evicted. Default 1000. */
	maxEntries?: number;
	/** Entry lifetime in ms. Omit (or leave undefined) to never expire entries. */
	ttlMs?: number;
}

/**
 * LRU cache of healing rules, keyed by method+url+masked-payload-shape.
 * `get()` bumps an entry's recency; eviction at capacity removes the entry
 * that has gone longest without a `get()` hit, not the oldest-inserted one.
 */
export class HeuristicCache implements RuleStore {
	private cache: Map<string, CacheEntry>;
	private readonly maxEntries: number;
	private readonly ttlMs: number | null;

	constructor(maxEntries?: number, ttlMs?: number);
	constructor(options: HeuristicCacheOptions);
	constructor(
		maxEntriesOrOptions: number | HeuristicCacheOptions = 1000,
		ttlMs?: number,
	) {
		this.cache = new Map();

		if (typeof maxEntriesOrOptions === "object") {
			this.maxEntries = maxEntriesOrOptions.maxEntries ?? 1000;
			this.ttlMs = maxEntriesOrOptions.ttlMs ?? null;
		} else {
			this.maxEntries = maxEntriesOrOptions;
			this.ttlMs = ttlMs ?? null;
		}
	}

	generateKey(method: string, url: string, maskedPayload: JsonValue): string {
		return generateRuleKey(method, url, maskedPayload);
	}

	set(key: string, rule: HealingRule): void {
		this.cache.delete(key);

		if (this.cache.size >= this.maxEntries) {
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		const expiresAt = this.ttlMs !== null ? Date.now() + this.ttlMs : null;
		this.cache.set(key, { rule, expiresAt });
	}

	get(key: string): HealingRule | null {
		const entry = this.cache.get(key);
		if (!entry) {
			return null;
		}

		if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
			this.cache.delete(key);
			return null;
		}

		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.rule;
	}

	has(key: string): boolean {
		return this.get(key) !== null;
	}

	clear(): void {
		this.cache.clear();
	}
}
