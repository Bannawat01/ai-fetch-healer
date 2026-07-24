import type { ILLMProvider, JsonValue, LLMResponse } from "../types";

/**
 * Tries each provider in order and returns the first successful heal. A
 * provider that throws (or, for the LLM ones, exhausts its own model chain)
 * is skipped and the next is tried; if all fail, the last error propagates.
 *
 * The canonical use is putting the free, deterministic {@link HeuristicHealer}
 * first and an LLM provider second:
 *
 * ```ts
 * const provider = new FallbackProvider([
 *   new HeuristicHealer(),      // free: fixes fullName <-> full_name, etc.
 *   new OpenRouterProvider(),   // paid: everything the heuristic can't
 * ]);
 * ```
 *
 * so common casing mismatches never touch (or pay for) an LLM, and only the
 * genuinely hard failures fall through.
 */
export class FallbackProvider implements ILLMProvider {
	name: string;
	private readonly providers: ILLMProvider[];

	constructor(providers: ILLMProvider[]) {
		if (!providers || providers.length === 0) {
			throw new Error(
				"[ai-fetch-healer] FallbackProvider needs at least one provider.",
			);
		}
		this.providers = providers;
		this.name = `Fallback(${providers.map((p) => p.name).join(" -> ")})`;
	}

	async heal(schema: JsonValue, errorDetails: string): Promise<LLMResponse> {
		let lastError: unknown;

		for (const provider of this.providers) {
			try {
				return await provider.heal(schema, errorDetails);
			} catch (error) {
				lastError = error;
			}
		}

		const message =
			lastError instanceof Error ? lastError.message : String(lastError);
		throw new Error(`Failed to heal via ${this.name}: ${message}`);
	}
}
