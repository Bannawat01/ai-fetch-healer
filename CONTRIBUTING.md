# Contributing

## Setup

```bash
pnpm install
```

## Before opening a PR

```bash
pnpm lint && pnpm test:run && pnpm build
```

All three must pass. `pnpm format` fixes most lint style issues automatically.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/) - semantic-release drives versioning off this. Common types:

- `feat` - new capability (minor bump)
- `fix` - bug fix (patch bump)
- `chore` - tooling/config, no user-facing change
- `docs` - documentation only
- `test` - tests only
- `refactor` - internal restructuring, no behavior change

Breaking changes: add `BREAKING CHANGE:` in the commit body (triggers a major bump).

## Adding an LLM provider

New providers (Groq, Ollama, OpenRouter) share an OpenAI-compatible chat-completions shape via `OpenAICompatProvider` (`src/llm/openai-compat.ts`). If the backend you're adding speaks that same API:

1. `src/llm/<name>.ts` - extend `OpenAICompatProvider`, set `name`, `baseUrl`, `model`. See `src/llm/groq.ts` for the smallest example.
2. Resolve the API key from constructor args first, then provider-specific env vars (`AI_HEALER_<NAME>_KEY` before the provider's own conventional var name).
3. Export the class and its options type from `src/index.ts`.
4. Add `tests/llm/<name>.test.ts` - cover: missing-key throws, successful heal parses the rule, non-JSON/failed response wraps into a labeled error. See `tests/llm/groq.test.ts`.
5. Add the provider to the "Supported Providers" list in `README.md`.

If the backend doesn't speak OpenAI-compat (a different request/response shape entirely), extend `BaseLLMProvider` (`src/llm/provider.ts`) directly instead - see `src/llm/gemini.ts`.

## Non-negotiables

These aren't style preferences - breaking them is a correctness or security bug. See `CLAUDE.md` for the full list, but the two that matter most for a PR:

- **Fail-open always.** Any healing failure must return the original `Response`, never throw to the caller.
- **Schema-only to the LLM.** Never send raw payload values to a provider - only `Masker.mask()` output (types/masked strings).

## Testing

- Framework: vitest. Mock `fetch` and the provider with `vi.fn()` - no real network calls in tests.
- Every new module ships with a test file in the same PR.
