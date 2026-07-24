# ai-fetch-healer

<p align="center">
  <img src="./assets/logo.png" alt="ai-fetch-healer logo" width="420" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ai-fetch-healer"><img alt="npm version" src="https://img.shields.io/npm/v/ai-fetch-healer.svg"></a>
  <a href="https://www.npmjs.com/package/ai-fetch-healer"><img alt="npm downloads" src="https://img.shields.io/npm/dm/ai-fetch-healer.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
  <a href="https://github.com/Bannawat01/ai-fetch-healer/actions/workflows/ci.yml"><img alt="Build Status" src="https://github.com/Bannawat01/ai-fetch-healer/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://codecov.io/gh/Bannawat01/ai-fetch-healer"><img alt="Coverage" src="https://codecov.io/gh/Bannawat01/ai-fetch-healer/branch/main/graph/badge.svg"></a>
  <img alt="Zero runtime dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen.svg">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-blue.svg">
</p>

<p align="center"><strong>Your `fetch` calls, self-healing.</strong></p>

`ai-fetch-healer` is a zero-dependency `fetch` wrapper that catches schema-mismatch failures (400/422), asks an LLM for a one-line fix, applies it, and retries - automatically. Field renamed upstream? Type changed from string to number? A newly-required field? It heals the request instead of paging you.

```ts
import { createHealedFetchFromEnv } from 'ai-fetch-healer';

// Reads whichever provider key you've set (OpenRouter/Groq/Gemini/Ollama) - no provider import needed.
const healedFetch = createHealedFetchFromEnv();

// Upstream now expects `full_name`, not `user_name` - this still works.
await healedFetch('https://api.example.com/users', {
  method: 'POST',
  body: JSON.stringify({ user_name: 'Ada' }),
});
```

## Table of Contents

- [Why It Matters](#why-it-matters)
- [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [Zero-Config Global Install](#zero-config-global-install)
- [Supported Providers](#supported-providers)
- [Framework Adapters](#framework-adapters)
- [Configuration](#configuration)
- [Persistent Rule Store](#persistent-rule-store)
- [Observability](#observability)
- [Security & Privacy (The Masker)](#security--privacy-the-masker)
- [Resilience & Timeouts](#resilience--timeouts)
- [Performance & Memory Safety](#performance--memory-safety)
- [Examples](#examples)
- [Contributing](#contributing)

## Why It Matters

Upstream APIs change. Field names drift, required keys move, and error payloads evolve. These changes often surface at the worst possible time, turning into late-night incidents and manual rollbacks.

`ai-fetch-healer` reduces those 3 AM production calls by:

- intercepting failed requests (for healing-eligible statuses, default `400`/`422`),
- generating a safe, schema-only healing rule from an LLM,
- applying the fix and retrying automatically,
- caching the rule so every later hit is a fast local lookup, not another LLM call.

The result: better uptime, fewer emergency hotfixes, and a request path that degrades gracefully instead of throwing.

## How It Works

```
  fetch() fails (400/422)
          │
          ▼
  mask payload (PII stripped, schema only)
          │
          ▼
  cache hit? ──yes──► apply cached rule ──► retry
          │no
          ▼
  ask LLM provider for a healing rule
          │
          ▼
  validate rule (untrusted output) ──invalid──► return original response
          │valid
          ▼
  cache rule + apply it + retry
```

Any failure anywhere in this path - masking, the provider call, an invalid rule - falls back to returning the **original, untouched response**. Healing is additive; it never makes a broken request more broken, and it never throws to the caller.

A healing rule is one of three actions, chosen by the LLM from the error and the masked schema:

| Action | When | Example |
| --- | --- | --- |
| `MAP_FIELDS` | A field is misnamed | `user_name` → `full_name` |
| `CHANGE_TYPE` | A field has the wrong scalar type | `age: "42"` → `age: 42` |
| `ADD_REQUIRED` | A required field is missing entirely | inject `currency: "USD"` |

## Quick Start

```bash
pnpm add ai-fetch-healer
```

Set **any one** provider key and go - no provider class to pick or import:

```env
AI_HEALER_OPENROUTER_KEY=your_key_here
```

```ts
import { createHealedFetchFromEnv } from 'ai-fetch-healer';

const healedFetch = createHealedFetchFromEnv();

const response = await healedFetch('https://api.example.com/data', {
  method: 'POST',
  body: JSON.stringify({ user_name: 'Code' }),
});
```

`createHealedFetchFromEnv()` auto-detects your provider from whichever env var is set (priority: OpenRouter → Groq → Gemini → Ollama) and throws an actionable error at startup - listing exactly which env vars it checked - if none are found. Prefer picking the provider explicitly? Use `createHealedFetch(provider)` instead:

```ts
import { createHealedFetch, OpenRouterProvider } from 'ai-fetch-healer';

const healedFetch = createHealedFetch(new OpenRouterProvider());
```

Create `healedFetch` **once** per provider (module scope, not per-request) - a fresh instance every call defeats the built-in rule cache and forces an LLM round-trip on every single request. Building an Express or Next.js route around it? See [Framework Adapters](#framework-adapters) below.

## Zero-Config Global Install

Want every `fetch` in your process healed without touching a single call site? Install healing onto the global `fetch` once, at startup:

```ts
import { installGlobalHealing } from 'ai-fetch-healer';

const uninstall = installGlobalHealing(); // reads whichever provider key is set

// From here on, every plain `fetch(...)` in the process is self-healing.
await fetch('https://api.example.com/data', { method: 'POST', body: '...' });

uninstall(); // restore the original global fetch
```

This is **opt-in and explicit** - importing the package never patches anything on its own, since replacing the global `fetch` is a process-wide side effect. Notes:

- Always call the returned `uninstall()` in tests and hot-reload paths to restore the original `fetch`.
- Calling `installGlobalHealing()` twice without uninstalling is a safe no-op - it never stacks wrappers (which would double every request).
- Accepts the same options as [`createHealedFetch`](#configuration), plus an optional `provider` to skip env auto-detection: `installGlobalHealing({ provider: new OpenRouterProvider() })`.
- Prefer an explicit `healedFetch` you pass around (`createHealedFetchFromEnv()`) when you can - global patching is the escape hatch for code you don't control the fetch calls of, not the default.

## Supported Providers

| Provider | Backend | Notes |
| --- | --- | --- |
| `OpenRouterProvider` | [OpenRouter](https://openrouter.ai) | Multi-model gateway, default `openai/gpt-4o-mini` |
| `GeminiProvider` | Google Gemini | Direct Gemini API |
| `GroqProvider` | [Groq](https://groq.com) | Fast inference, OpenAI-compatible |
| `OllamaProvider` | [Ollama](https://ollama.com) | Local/self-hosted, no API key needed by default |

All providers throw a typed `Error` synchronously in the constructor if no API key can be resolved (except `OllamaProvider`, which doesn't require one for a default local install).

### API key resolution

Each provider resolves its key in priority order: constructor arg → `options.apiKey` → provider-specific env var(s). For `OpenRouterProvider`:

1. `apiKey` passed to constructor
2. `options.apiKey` in constructor options
3. `AI_HEALER_OPENROUTER_KEY`
4. `OPENROUTER_API_KEY`
5. `GEMINI_API_KEY` (legacy fallback)

```env
AI_HEALER_OPENROUTER_KEY=your_openrouter_key_here
```

```ts
import { OpenRouterProvider } from 'ai-fetch-healer';

const fromEnv = new OpenRouterProvider();

const withKeyAndOptions = new OpenRouterProvider('YOUR_KEY', {
  model: 'openai/gpt-4o-mini',
  timeoutMs: 5000,
});
```

`GroqProvider` follows the same pattern (`AI_HEALER_GROQ_KEY` / `GROQ_API_KEY`). `OllamaProvider` additionally accepts a configurable `baseUrl` and `model`, since there's no universal default that matches what you've pulled locally:

```ts
import { OllamaProvider } from 'ai-fetch-healer';

const provider = new OllamaProvider({
  baseUrl: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3.1',
});
```

## Framework Adapters

Turn a `healedFetch` call into a ready-to-mount route handler - built in, no extra install:

```ts
// Any Web-standard Request/Response runtime: Next.js App Router, Bun, Deno, Cloudflare Workers, Remix, SvelteKit
import { createHealedFetchFromEnv, createHealedRouteHandler } from 'ai-fetch-healer';

const healedFetch = createHealedFetchFromEnv();

// app/api/orders/route.ts
export const POST = createHealedRouteHandler({
  target: 'https://upstream.example.com/v1/orders',
  healedFetch,
});
```

```ts
// Express
import { createHealedFetchFromEnv, createHealedProxyMiddleware } from 'ai-fetch-healer';

const healedFetch = createHealedFetchFromEnv();

app.post('/users', createHealedProxyMiddleware({
  target: 'https://upstream.example.com/v1/users',
  healedFetch,
}));
```

Neither adapter imports `next`/`express` - the Web adapter targets the standard global `Request`/`Response` objects, and the Express adapter is typed structurally (`ExpressLikeRequest`/`ExpressLikeResponse`), so a real Express `req`/`res` satisfies it without ai-fetch-healer ever depending on the `express` package. Zero runtime dependencies stays true even here. `target` can also be a function of the incoming request, for per-request upstream URLs.

## Configuration

`createHealedFetch(provider, config?)` accepts:

| Option | Default | Purpose |
| --- | --- | --- |
| `fetchFunction` | `globalThis.fetch` | Swap in a custom `fetch` implementation |
| `cache` | shared `HeuristicCache` | Bring your own cache instance/config |
| `store` | - | Persistent [rule store](#persistent-rule-store) (file, Redis, KV, ...). Takes precedence over `cache`. Store errors degrade to a cache miss - a broken store never breaks healing |
| `masker` | shared `Masker` | Bring your own PII-masking rules |
| `healableStatuses` | `[400, 422]` | Which response statuses trigger healing |
| `allowUnsafeRetry` | `true` | Retry non-idempotent methods (`POST`/`PATCH`/...) with the healed payload. The original request already failed, so under normal conditions the retry is the only send that succeeds - set `false` only if your upstream API is known to apply partial writes even on rejected requests |
| `healRetries` | `2` | Retry attempts for `provider.heal()` on network/timeout failure |
| `healRetryBaseMs` | `250` | Base delay for exponential backoff between heal attempts |
| `maxErrorDetailsChars` | `4000` | Truncates the error body sent to the LLM |
| `logger` | `console` | Injectable logger, see [Observability](#observability) |
| `onHeal` | - | Callback fired when a rule is about to be applied |
| `onHealFail` | - | Callback fired when healing fails (invalid rule, exhausted retries) |

```ts
const healedFetch = createHealedFetch(provider, {
  healableStatuses: [400, 404, 422],
  healRetries: 3,
  allowUnsafeRetry: false,
});
```

## Persistent Rule Store

By default, healed rules live in an in-memory LRU cache - a restart or redeploy forgets everything and the next failing request pays the LLM round-trip again. Plug in a `RuleStore` to persist rules across restarts:

```ts
import { createHealedFetch, FileRuleStore, OpenRouterProvider } from 'ai-fetch-healer';

const healedFetch = createHealedFetch(new OpenRouterProvider(), {
  store: new FileRuleStore({ filePath: './.ai-fetch-healer-rules.json', ttlMs: 7 * 24 * 60 * 60 * 1000 }),
});
```

`FileRuleStore` (Node only) persists rules to a JSON file with atomic writes; a missing or corrupt file starts empty instead of throwing. Rules learned once keep working after every deploy.

Backing it with Redis, a database, or an edge KV takes ~10 lines - `RuleStore` is just async `get`/`set`:

```ts
import type { RuleStore } from 'ai-fetch-healer';

const redisStore: RuleStore = {
  get: async (key) => {
    const raw = await redis.get(`heal:${key}`);
    return raw ? JSON.parse(raw) : null;
  },
  set: async (key, rule) => {
    await redis.set(`heal:${key}`, JSON.stringify(rule), { EX: 60 * 60 * 24 * 7 });
  },
};
```

Only rule *shapes* are stored (keyed by method + URL + masked payload schema) - never raw payload values, so the store contains no PII by construction.

## Observability

Bring your own structured logger and hook into the healing lifecycle instead of parsing console output:

```ts
import { createHealedFetch, type HealEvent, OpenRouterProvider } from 'ai-fetch-healer';

const healedFetch = createHealedFetch(new OpenRouterProvider(), {
  logger: {
    log: (...args) => myLogger.info(args),
    warn: (...args) => myLogger.warn(args),
  },
  onHeal: (event: HealEvent) => {
    metrics.increment(`ai_fetch_healer.heal.${event.source}`); // "llm" | "cache"
  },
  onHealFail: (error) => {
    Sentry.captureException(error);
  },
});
```

See [`examples/observability.ts`](./examples/observability.ts) for a full example.

## Security & Privacy (The Masker)

`ai-fetch-healer` follows privacy-by-design: before any healing analysis, payloads are recursively masked so only schema-safe signals - types and masked strings, never real values - are ever sent to an LLM provider.

### Sensitive key defaults

| Category | Default Sensitive Keys | Example Mask Output |
| --- | --- | --- |
| Identity | `email`, `phone`, `username` | `masked_email`, `masked_phone`, `masked_identity` |
| Credentials | `password`, `token`, `api_key` | `masked_password`, `masked_token` |
| Financial | `credit_card`, `bank_account` | `masked_credit_card`, `masked_financial` |

Key matching is case-insensitive and separator-agnostic (`User-Email`, `USER_PASSWORD`, etc. are all caught).

### Compliance

PDPA & GDPR friendly by construction: no PII is ever transmitted to LLM providers, because the payload never leaves masking with real values still attached.

### Custom masker for enterprise fields

```ts
import { createHealedFetch, Masker, OpenRouterProvider } from 'ai-fetch-healer';

const customMasker = new Masker({
  additionalSensitiveKeys: ['customer_id', 'internal_secret'],
  maskingString: '[PROTECTED_DATA]',
});

const healedFetch = createHealedFetch(new OpenRouterProvider(), { masker: customMasker });
```

## Resilience & Timeouts

`ai-fetch-healer` uses an `AbortController`-based timeout strategy to prevent hanging provider calls.

- Default timeout: `10000ms` (10 seconds), configurable per provider via `timeoutMs`
- On timeout: healing is aborted and the original API response is returned - availability over completeness
- `provider.heal()` failures (network blips, timeouts) get retried with exponential backoff (`healRetries`/`healRetryBaseMs`) before falling back

```ts
const provider = new OpenRouterProvider('YOUR_KEY', { timeoutMs: 5000 });
```

## Performance & Memory Safety

`HeuristicCache` avoids repeated LLM calls for requests that fail the same way:

- Lookup: `O(1)` map-based key access
- Bounded capacity: 1,000 entries by default, true LRU eviction (`get()` bumps recency, not just insertion order)
- Optional TTL per entry, so stale rules don't outlive an upstream fix

```ts
import { HeuristicCache } from 'ai-fetch-healer';

const cache = new HeuristicCache({ maxEntries: 500, ttlMs: 1000 * 60 * 60 }); // 1 hour
const healedFetch = createHealedFetch(provider, { cache });
```

The `Masker` and `HeuristicCache` code paths run on every healable-status response - including cache hits, since masking has to happen before a cache key can even be generated - so both are kept allocation-light. Run `pnpm bench` to benchmark them on your own machine (`benchmarks/`, via vitest's built-in bench runner); numbers aren't published here since they're hardware-dependent and this repo doesn't want to make a claim it can't keep current. What actually dominates request latency in practice is the upstream API + LLM provider round-trip, not this library's own overhead.

## Examples

The [`examples/`](./examples) directory has standalone snippets for real integration paths: a minimal Node script, an Express proxy route, a Next.js App Router handler, and the observability wiring shown above.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Bannawat01/ai-fetch-healer)

That opens this repo in an editable in-browser IDE - useful for browsing/tweaking the source and the `examples/` snippets without cloning locally. It's not a hosted one-click demo: every example still needs your own LLM provider key (see [Quick Start](#quick-start)) to actually call `healedFetch`, since there's no shared API key to hand out.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup, PR checklist, and a guide to adding a new LLM provider.
