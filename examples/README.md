# Examples

Standalone snippets showing `createHealedFetch` wired into real request paths. None of these are runnable as-is (no `package.json`/deps of their own) - copy the relevant parts into your project.

- [`basic-node.ts`](./basic-node.ts) - the smallest possible healed request, plain Node.
- [`express-proxy-route.ts`](./express-proxy-route.ts) - an Express route using `createHealedProxyMiddleware`, ai-fetch-healer's built-in Express adapter.
- [`nextjs-route-handler.ts`](./nextjs-route-handler.ts) - a Next.js App Router route using `createHealedRouteHandler`, the built-in adapter for any Web-standard `Request`/`Response` runtime (Next.js, Bun, Deno, Cloudflare Workers, Remix, SvelteKit).
- [`observability.ts`](./observability.ts) - wiring `logger`, `onHeal`, and `onHealFail` into structured logging/metrics instead of raw console output.

All examples assume an environment variable holds the LLM provider key (see the main [README](../README.md#smart-configuration) for resolution order).
