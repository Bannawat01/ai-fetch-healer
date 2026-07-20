# Examples

Standalone snippets showing `createHealedFetch` wired into real request paths. None of these are runnable as-is (no `package.json`/deps of their own) - copy the relevant parts into your project.

- [`basic-node.ts`](./basic-node.ts) - the smallest possible healed request, plain Node.
- [`express-proxy-route.ts`](./express-proxy-route.ts) - an Express route that proxies to an upstream API through `healedFetch`.
- [`nextjs-route-handler.ts`](./nextjs-route-handler.ts) - a Next.js App Router route handler doing the same.
- [`observability.ts`](./observability.ts) - wiring `logger`, `onHeal`, and `onHealFail` into structured logging/metrics instead of raw console output.

All examples assume an environment variable holds the LLM provider key (see the main [README](../README.md#smart-configuration) for resolution order).
