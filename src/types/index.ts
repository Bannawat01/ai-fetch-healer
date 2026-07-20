export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
	| JsonPrimitive
	| JsonValue[]
	| { [key: string]: JsonValue };

export type JsonScalarType = "string" | "number" | "boolean" | "null";

/** A schema-fix instruction returned by an LLM provider and applied by `createHealedFetch`. */
export interface HealingRule {
	action: "MAP_FIELDS" | "CHANGE_TYPE";
	/** Old key -> new key renames, applied before typeChanges. */
	mapping?: Record<string, string>;
	/** Per-key scalar coercions, applied after mapping. */
	typeChanges?: Record<string, JsonScalarType>;
	/** Optional human-readable explanation, surfaced only for logging/debugging. */
	suggestion?: string;
}

export type JsonPayload = { [key: string]: JsonValue };

export interface LLMResponse {
	/**
	 * Placeholder payload, not the real healed request body - the interceptor
	 * discards this and applies `rule` to the original payload itself.
	 */
	healedPayload: JsonPayload;
	rule: HealingRule;
}

/** Implement this to plug a new LLM backend into `createHealedFetch`. */
export interface ILLMProvider {
	name: string;
	/** schema is the masked (PII-free) request payload; must never receive raw values. */
	heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse>;
}
