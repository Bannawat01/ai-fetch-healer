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

Pick exactly one action based on what the error actually says:
- "MAP_FIELDS": a field is misnamed (the API expects a different key for data already present in the schema).
- "CHANGE_TYPE": a field has the wrong scalar type (e.g. string sent where a number is expected).
- "ADD_REQUIRED": the error says a field is missing/required and it does NOT correspond to any key already in the Original Schema (nothing to rename).

Respond strictly in JSON format matching this structure. Only include the object matching your chosen action; omit the others.
{
  "action": "MAP_FIELDS" | "CHANGE_TYPE" | "ADD_REQUIRED",
  "mapping": { "old_key_name": "new_key_name" },
  "typeChanges": { "field_name": "string" | "number" | "boolean" | "null" },
  "addFields": { "missing_field_name": "<a plausible non-empty value of the correct type - never an empty string, null, or placeholder like 'N/A' unless the error/schema genuinely gives no signal>" },
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
	const addFields = rule.addFields ?? {};

	for (const [, newKey] of Object.entries(mapping)) {
		healedPayload[newKey] = "mapped_value";
	}

	for (const [key, value] of Object.entries(addFields)) {
		healedPayload[key] = value;
	}

	return healedPayload;
}
