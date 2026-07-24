import type {
	HealingRule,
	ILLMProvider,
	JsonValue,
	LLMResponse,
} from "../types";
import { buildHealedPayloadStub } from "./prompt";

/**
 * A zero-cost, zero-latency, no-LLM healer for the single most common REST
 * schema mismatch: a field is spelled with the wrong casing/separators
 * (`fullName` vs `full_name`, `userId` vs `user_id`). It reads the field names
 * the API mentions in its error, matches them - separator/case-insensitively -
 * against the keys already in the payload, and emits a `MAP_FIELDS` rename.
 *
 * Deterministic and free, so it makes a great first stage in a
 * `FallbackProvider([new HeuristicHealer(), someLLMProvider])`: the common
 * cases never touch (or pay for) an LLM, and only the genuinely hard failures
 * fall through. It can also be used entirely on its own with no API key at all.
 *
 * When it finds no confident rename it throws, so a fallback chain moves on to
 * the next provider (and, standalone, the interceptor fails open to the
 * original response).
 */
export class HeuristicHealer implements ILLMProvider {
	name = "Heuristic (no LLM)";

	heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		const rule = inferRenameRule(schema, errorDetails);
		if (!rule) {
			return Promise.reject(
				new Error("HeuristicHealer: no deterministic field-casing fix found"),
			);
		}
		return Promise.resolve({
			healedPayload: buildHealedPayloadStub(rule),
			rule,
		});
	}
}

function inferRenameRule(
	schema: JsonValue,
	errorDetails: string,
): HealingRule | null {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		return null;
	}

	const payloadKeys = Object.keys(schema);
	if (payloadKeys.length === 0) {
		return null;
	}

	// normalized form -> the exact spelling the API used in its error message
	const wantedByNorm = new Map<string, string>();
	for (const token of extractIdentifiers(errorDetails)) {
		wantedByNorm.set(normalizeFieldName(token), token);
	}

	const mapping: Record<string, string> = {};
	for (const key of payloadKeys) {
		const wanted = wantedByNorm.get(normalizeFieldName(key));

		// Rename only when the API named the same field with a *different*
		// spelling, and that target isn't already a key in the payload.
		if (wanted && wanted !== key && !Object.hasOwn(schema, wanted)) {
			mapping[key] = wanted;
		}
	}

	if (Object.keys(mapping).length === 0) {
		return null;
	}

	return {
		action: "MAP_FIELDS",
		mapping,
		suggestion:
			"Renamed field(s) to the casing the API used in its error - matched heuristically without an LLM.",
	};
}

/** Collapse casing and separators so `fullName`, `full_name`, `Full-Name` all match. */
function normalizeFieldName(name: string): string {
	return name.toLowerCase().replace(/[_\-\s]/g, "");
}

/**
 * Pull identifier-like tokens (`user_id`, `fullName`, `email`) out of a free-form
 * error string. Length >= 2 to skip noise; deduplicated preserving order.
 */
function extractIdentifiers(text: string): string[] {
	const matches = text.match(/[A-Za-z_][A-Za-z0-9_-]*/g) ?? [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of matches) {
		if (m.length >= 2 && !seen.has(m)) {
			seen.add(m);
			out.push(m);
		}
	}
	return out;
}
