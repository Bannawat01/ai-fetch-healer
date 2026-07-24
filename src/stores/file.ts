import type { RuleStore } from "../core/store";
import type { HealingRule } from "../types";

interface StoredEntry {
	rule: HealingRule;
	expiresAt: number | null;
}

interface StoreFileShape {
	version: 1;
	entries: Record<string, StoredEntry>;
}

export interface FileRuleStoreOptions {
	/** JSON file the rules are persisted to. Created on first `set()`. */
	filePath: string;
	/** Entry lifetime in ms. Omit to never expire entries. */
	ttlMs?: number;
	/** Max entries before the oldest-written one is evicted. Default 1000. */
	maxEntries?: number;
}

type FsPromises = typeof import("node:fs/promises");

/**
 * Node-only `RuleStore` that persists healing rules to a JSON file, so rules
 * learned from the LLM survive process restarts and deploys.
 *
 * - Loads the file lazily on first use; a missing or corrupt file starts empty
 *   (fail-open) instead of throwing.
 * - Writes are serialized and atomic (temp file + rename), safe under
 *   concurrent `set()` calls within one process. Multiple processes sharing
 *   one file are last-writer-wins.
 * - `node:fs` is imported lazily inside the methods, so bundling this module
 *   for edge runtimes only fails if a `FileRuleStore` is actually used there.
 */
export class FileRuleStore implements RuleStore {
	private readonly filePath: string;
	private readonly ttlMs: number | null;
	private readonly maxEntries: number;
	private entries: Map<string, StoredEntry> | null = null;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(options: FileRuleStoreOptions) {
		this.filePath = options.filePath;
		this.ttlMs = options.ttlMs ?? null;
		this.maxEntries = options.maxEntries ?? 1000;
	}

	private fs(): Promise<FsPromises> {
		return import("node:fs/promises");
	}

	private async load(): Promise<Map<string, StoredEntry>> {
		if (this.entries) {
			return this.entries;
		}

		this.entries = new Map();

		try {
			const fs = await this.fs();
			const raw = await fs.readFile(this.filePath, "utf8");
			const parsed = JSON.parse(raw) as StoreFileShape;

			if (parsed && parsed.version === 1 && parsed.entries) {
				const now = Date.now();
				for (const [key, entry] of Object.entries(parsed.entries)) {
					if (entry.expiresAt !== null && entry.expiresAt <= now) {
						continue;
					}
					this.entries.set(key, entry);
				}
			}
		} catch {
			// Missing or corrupt file: start empty rather than break healing.
		}

		return this.entries;
	}

	private persist(): Promise<void> {
		this.writeQueue = this.writeQueue.then(async () => {
			const entries = this.entries;
			if (!entries) {
				return;
			}

			const shape: StoreFileShape = {
				version: 1,
				entries: Object.fromEntries(entries),
			};

			const fs = await this.fs();
			const tmpPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
			await fs.writeFile(tmpPath, JSON.stringify(shape), "utf8");
			await fs.rename(tmpPath, this.filePath);
		});

		return this.writeQueue;
	}

	async get(key: string): Promise<HealingRule | null> {
		const entries = await this.load();
		const entry = entries.get(key);

		if (!entry) {
			return null;
		}

		if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
			entries.delete(key);
			return null;
		}

		return entry.rule;
	}

	async set(key: string, rule: HealingRule): Promise<void> {
		const entries = await this.load();

		entries.delete(key);

		if (entries.size >= this.maxEntries) {
			const oldestKey = entries.keys().next().value;
			if (oldestKey) {
				entries.delete(oldestKey);
			}
		}

		const expiresAt = this.ttlMs !== null ? Date.now() + this.ttlMs : null;
		entries.set(key, { rule, expiresAt });

		await this.persist();
	}

	/** Drop all entries and persist the empty store. */
	async clear(): Promise<void> {
		const entries = await this.load();
		entries.clear();
		await this.persist();
	}
}
