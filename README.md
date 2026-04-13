# ai-fetch-healer

<p align="center">
  <img src="./assets/logo.png" alt="ai-fetch-healer logo" width="420" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ai-fetch-healer"><img alt="npm version" src="https://img.shields.io/npm/v/ai-fetch-healer.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
  <a href="https://github.com/bannawat-r/ai-fetch-healer/actions/workflows/ci.yml"><img alt="Build Status" src="https://github.com/bannawat-r/ai-fetch-healer/actions/workflows/ci.yml/badge.svg"></a>
</p>

Production-ready runtime API auto-healing for JavaScript and TypeScript applications.

`ai-fetch-healer` helps your app stay resilient when upstream API contracts change unexpectedly. Instead of shipping an emergency patch immediately, your client can detect schema mismatch patterns, apply healing rules, and keep critical flows alive.

## Why It Matters

Upstream APIs change. Field names drift, required keys move, and error payloads evolve. These changes often surface at the worst possible time, turning into late-night incidents and manual rollbacks.

`ai-fetch-healer` is designed to reduce those 3 AM production calls by:

- intercepting failed requests (for healing-eligible statuses),
- generating a safe schema-based healing rule,
- applying the fix automatically,
- caching the rule for fast follow-up requests.

The result is better uptime, fewer emergency hotfixes, and a smoother on-call experience.

## Supported Providers

- `GeminiProvider`
- `OpenRouterProvider`

## Planned Support / Roadmap

- `GroqProvider`
- `OllamaProvider`

## Quick Start

```bash
pnpm add ai-fetch-healer
```

```ts
import { createHealedFetch, OpenRouterProvider } from 'ai-fetch-healer';

const provider = new OpenRouterProvider();
const healedFetch = createHealedFetch(provider);

const response = await healedFetch('https://api.example.com/data', {
  method: 'POST',
  body: JSON.stringify({ user_name: 'Code' }),
});
```

## Smart Configuration

`OpenRouterProvider` supports smart API key resolution in this priority order:

1. `apiKey` passed to constructor
2. `options.apiKey` in constructor options
3. `AI_HEALER_OPENROUTER_KEY`
4. `OPENROUTER_API_KEY`
5. `GEMINI_API_KEY` (legacy fallback)

```env
AI_HEALER_OPENROUTER_KEY=your_openrouter_key_here
```

Constructor flexibility:

```ts
import { OpenRouterProvider } from 'ai-fetch-healer';

const fromEnv = new OpenRouterProvider();

const withKeyAndOptions = new OpenRouterProvider('YOUR_KEY', {
  model: 'google/gemini-2.0-flash-001',
  timeoutMs: 5000,
});

const optionsOnly = new OpenRouterProvider({
  apiKey: 'YOUR_KEY',
  model: 'google/gemini-2.0-flash-001',
  timeoutMs: 5000,
});
```

## Resilience & Timeouts

`ai-fetch-healer` uses an Abort-based timeout strategy with `AbortController` to prevent hanging provider calls.

- Default timeout: `10000ms` (10 seconds)
- If timeout is reached: healing is aborted and the original API response is returned to preserve availability.

```ts
import { OpenRouterProvider } from 'ai-fetch-healer';

const provider = new OpenRouterProvider('YOUR_KEY', {
  model: 'google/gemini-2.0-flash-001',
  timeoutMs: 5000,
});
```

## Security & Privacy (The Masker)

`ai-fetch-healer` follows Privacy-by-Design principles. Before any healing analysis, payloads are recursively masked so only schema-safe signals are sent to LLM providers.

### Sensitive Key Defaults

| Category | Default Sensitive Keys | Example Mask Output |
| --- | --- | --- |
| Identity | `email`, `phone`, `username` | `masked_email`, `masked_phone`, `masked_identity` |
| Credentials | `password`, `token`, `api_key` | `masked_password`, `masked_token` |
| Financial | `credit_card`, `bank_account` | `masked_credit_card`, `masked_financial` |

### Compliance & Privacy

PDPA & GDPR Ready: ai-fetch-healer ensures no PII is transmitted to LLM providers by using schema-only analysis with recursive masking.

### Custom Masker for Enterprise Fields

```ts
import { createHealedFetch, Masker, OpenRouterProvider } from 'ai-fetch-healer';

const provider = new OpenRouterProvider();

const customMasker = new Masker({
  additionalSensitiveKeys: ['customer_id', 'internal_secret'],
  maskingString: '[PROTECTED_DATA]',
});

const healedFetch = createHealedFetch(provider, { masker: customMasker });
```

## Performance & Memory Safety

`ai-fetch-healer` includes a heuristic cache for healing rules to minimize repeated provider calls.

- Lookup complexity: `O(1)` via map-based key access
- Bounded capacity: 1,000 rules by default
- Safety behavior: oldest entries are evicted when capacity is reached

This design keeps repeated healing fast while preventing unbounded memory growth in long-running services.