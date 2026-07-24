import type { HealingRule, JsonValue } from "../types";

/**
 * Pluggable persistence for healing rules. `get`/`set` may be sync or async,
 * so both the in-memory `HeuristicCache` and external backends (file, Redis,
 * KV, ...) satisfy it. Store failures are swallowed by the interceptor and
 * degrade to a cache miss - a broken store never breaks healing.
 */
export interface RuleStore {
	get(key: string): HealingRule | null | Promise<HealingRule | null>;
	set(key: string, rule: HealingRule): void | Promise<void>;
}

/**
 * Deterministic store key for a request: method + url + masked payload shape.
 * Contains no raw payload values - the signature comes from the masked schema.
 */
export function generateRuleKey(
	method: string,
	url: string,
	maskedPayload: JsonValue,
): string {
	const payloadSignature = JSON.stringify(maskedPayload);

	return `${method.toUpperCase()}:${url}:${payloadSignature}`;
}
