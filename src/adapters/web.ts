/**
 * Adapter for any runtime speaking the standard Web `Request`/`Response`
 * API - Next.js App Router route handlers, Bun, Deno, Cloudflare Workers,
 * Remix loaders/actions, SvelteKit endpoints. No framework import needed:
 * these are global runtime objects, not framework-specific types.
 */

export interface HealedRouteHandlerOptions {
	/** Upstream URL to proxy to. Static string, or derived per-request (e.g. from the incoming URL's path/query). */
	target: string | ((req: Request) => string | Promise<string>);
	/** The healedFetch instance from createHealedFetch/createHealedFetchFromEnv. Build it once at module scope - see the note in the main README. */
	healedFetch: typeof fetch;
	/** Request header names to forward upstream. Default: ["content-type"]. */
	forwardHeaders?: string[];
}

/**
 * Turns a healedFetch call into a ready-to-export route handler:
 *
 * ```ts
 * const healedFetch = createHealedFetchFromEnv();
 * export const POST = createHealedRouteHandler({
 *   target: "https://upstream.example.com/v1/orders",
 *   healedFetch,
 * });
 * ```
 */
export function createHealedRouteHandler(
	options: HealedRouteHandlerOptions,
): (req: Request) => Promise<Response> {
	const forwardHeaders = options.forwardHeaders ?? ["content-type"];

	return async function handler(req: Request): Promise<Response> {
		const target =
			typeof options.target === "function"
				? await options.target(req)
				: options.target;

		const headers = new Headers();
		for (const name of forwardHeaders) {
			const value = req.headers.get(name);
			if (value !== null) {
				headers.set(name, value);
			}
		}

		const hasBody = req.method !== "GET" && req.method !== "HEAD";

		return options.healedFetch(target, {
			method: req.method,
			headers,
			body: hasBody ? await req.text() : undefined,
		});
	};
}
