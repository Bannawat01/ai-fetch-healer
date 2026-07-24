/**
 * Adapter for Express-shaped middleware, via structural typing - no
 * dependency on the `express` package itself. A real Express `Request`/
 * `Response` satisfies these interfaces without any import; this keeps
 * ai-fetch-healer's zero-runtime-dependency guarantee intact (and skips a
 * devDependency on express/@types/express just for adapter types).
 */

/** Minimal structural subset of Express's Request that this adapter needs. */
export interface ExpressLikeRequest {
	method: string;
	body?: unknown;
	headers: Record<string, string | string[] | undefined>;
}

/** Minimal structural subset of Express's Response that this adapter needs. */
export interface ExpressLikeResponse {
	status(code: number): unknown;
	send(body?: unknown): unknown;
	set?(field: string, value: string): unknown;
}

export interface HealedProxyMiddlewareOptions {
	/** Upstream URL to proxy to. Static string, or derived per-request. */
	target: string | ((req: ExpressLikeRequest) => string | Promise<string>);
	/** The healedFetch instance from createHealedFetch/createHealedFetchFromEnv. Build it once at module scope - see the note in the main README. */
	healedFetch: typeof fetch;
}

/**
 * Turns a healedFetch call into a ready-to-mount Express route handler.
 * Assumes `req.body` is already parsed (e.g. via `express.json()`).
 *
 * ```ts
 * const healedFetch = createHealedFetchFromEnv();
 * app.post("/users", createHealedProxyMiddleware({
 *   target: "https://upstream.example.com/v1/users",
 *   healedFetch,
 * }));
 * ```
 */
export function createHealedProxyMiddleware(
	options: HealedProxyMiddlewareOptions,
): (req: ExpressLikeRequest, res: ExpressLikeResponse) => Promise<void> {
	return async function middleware(
		req: ExpressLikeRequest,
		res: ExpressLikeResponse,
	): Promise<void> {
		const target =
			typeof options.target === "function"
				? await options.target(req)
				: options.target;

		const hasBody = req.method !== "GET" && req.method !== "HEAD";

		const upstreamResponse = await options.healedFetch(target, {
			method: req.method,
			headers: { "Content-Type": "application/json" },
			body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
		});

		const text = await upstreamResponse.text();
		const contentType =
			upstreamResponse.headers.get("content-type") ?? "application/json";

		res.set?.("content-type", contentType);
		res.status(upstreamResponse.status);
		res.send(text);
	};
}
