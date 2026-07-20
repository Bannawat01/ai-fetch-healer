import type { HealingRule, JsonValue } from "../types";

interface CacheEntry {
	rule: HealingRule;
	expiresAt: number | null;
}

export interface HeuristicCacheOptions {
	maxEntries?: number;
	ttlMs?: number;
}

export class HeuristicCache {
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
		const payloadSignature = JSON.stringify(maskedPayload);

		return `${method.toUpperCase()}:${url}:${payloadSignature}`;
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
