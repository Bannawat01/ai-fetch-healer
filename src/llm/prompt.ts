import type { HealingRule, JsonPayload, JsonValue } from "../types";

export function buildHealPrompt(
	schema: JsonValue,
	errorDetails: string,
): string {
	return `
You are an expert API auto-healing system.
The user tried to send a payload to an API, but it failed with an error.
Your task is to map the incorrect payload schema to the required format based on the error.

Original Schema: ${JSON.stringify(schema)}
Error Details: ${errorDetails}

Respond strictly in JSON format matching this structure:
{
  "action": "MAP_FIELDS" | "CHANGE_TYPE" | "ADD_REQUIRED",
  "mapping": { "old_key_name": "new_key_name" },
  "typeChanges": { "field_name": "string" | "number" | "boolean" | "null" },
  "suggestion": "Brief explanation of what was fixed"
}
`;
}

/**
 * Providers don't call the healed endpoint themselves - they only produce a
 * rule. This placeholder payload exists solely to satisfy LLMResponse.healedPayload;
 * the interceptor discards it and applies the rule to the real payload instead.
 */
export function buildHealedPayloadStub(rule: HealingRule): JsonPayload {
	const healedPayload: JsonPayload = {};
	const mapping = rule.mapping ?? {};

	for (const [, newKey] of Object.entries(mapping)) {
		healedPayload[newKey] = "mapped_value";
	}

	return healedPayload;
}
