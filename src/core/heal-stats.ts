import type { HealEvent } from "./interceptor";

/** A point-in-time count of healing activity, safe to log or export as metrics. */
export interface HealStatsSnapshot {
	/** Total heals applied (LLM + cache), dry-run included. */
	total: number;
	/** Heals whose rule came fresh from the provider. */
	llm: number;
	/** Heals whose rule was served from the store/cache. */
	cache: number;
	/** Heals that were only reported (dry-run), not actually retried. */
	dryRun: number;
	/** Times `onHealFail` fired (exhausted retries or an invalid rule). */
	failures: number;
	/** Heal count per `"METHOD /path"` (query string stripped). High counts flag contract drift. */
	byEndpoint: Record<string, number>;
	/** Heal count per rule action (`MAP_FIELDS` / `CHANGE_TYPE` / `ADD_REQUIRED`). */
	byAction: Record<string, number>;
}

/**
 * In-process aggregator for healing activity. Wire its `onHeal`/`onHealFail`
 * into `HealerConfig` and read `snapshot()` on an interval (or a metrics
 * scrape) to see how often, where, and why healing is firing.
 *
 * Persistent, climbing per-endpoint counts are the signal this library is
 * meant to surface, not bury: a route that heals thousands of times means the
 * upstream contract has drifted and the code should be fixed to match, rather
 * than leaning on healing forever.
 *
 * Zero dependencies - `snapshot()` returns plain numbers you can feed to any
 * metrics backend (map `total`/`failures` to counters, `byEndpoint` to a
 * labelled counter, etc.).
 *
 * ```ts
 * const stats = new HealStats();
 * const healedFetch = createHealedFetch(provider, {
 *   onHeal: stats.onHeal,
 *   onHealFail: stats.onHealFail,
 * });
 * setInterval(() => logger.info(stats.snapshot()), 60_000);
 * ```
 */
export class HealStats {
	private total = 0;
	private llm = 0;
	private cache = 0;
	private dryRun = 0;
	private failures = 0;
	private readonly byEndpoint = new Map<string, number>();
	private readonly byAction = new Map<string, number>();

	/** Pass as `HealerConfig.onHeal`. Bound so it can be handed off directly. */
	readonly onHeal = (event: HealEvent): void => {
		this.total++;
		if (event.source === "llm") {
			this.llm++;
		} else {
			this.cache++;
		}
		if (event.dryRun) {
			this.dryRun++;
		}

		bump(this.byEndpoint, endpointKey(event.method, event.url));
		bump(this.byAction, event.rule.action);
	};

	/** Pass as `HealerConfig.onHealFail`. The error is counted, not inspected. */
	readonly onHealFail = (_error: unknown): void => {
		this.failures++;
	};

	/** A copy of the current counts. Mutating the result does not affect the collector. */
	snapshot(): HealStatsSnapshot {
		return {
			total: this.total,
			llm: this.llm,
			cache: this.cache,
			dryRun: this.dryRun,
			failures: this.failures,
			byEndpoint: Object.fromEntries(this.byEndpoint),
			byAction: Object.fromEntries(this.byAction),
		};
	}

	/** Zero every counter - e.g. after exporting a metrics window. */
	reset(): void {
		this.total = 0;
		this.llm = 0;
		this.cache = 0;
		this.dryRun = 0;
		this.failures = 0;
		this.byEndpoint.clear();
		this.byAction.clear();
	}
}

function bump(map: Map<string, number>, key: string): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

/** `"POST /v1/users"` - query string dropped to keep cardinality bounded. */
function endpointKey(method?: string, url?: string): string {
	const m = (method ?? "GET").toUpperCase();
	if (!url) {
		return `${m} unknown`;
	}
	const path = stripToPath(url);
	return `${m} ${path}`;
}

function stripToPath(url: string): string {
	const noQuery = url.split("?", 1)[0];
	// Reduce an absolute URL to its path; leave already-relative URLs as-is.
	const schemeEnd = noQuery.indexOf("://");
	if (schemeEnd === -1) {
		return noQuery;
	}
	const afterScheme = noQuery.slice(schemeEnd + 3);
	const slash = afterScheme.indexOf("/");
	return slash === -1 ? "/" : afterScheme.slice(slash);
}
