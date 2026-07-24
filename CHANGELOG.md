# [1.6.0](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.5.0...v1.6.0) (2026-07-24)


### Features

* installGlobalHealing() to heal the global fetch process-wide ([e352b77](https://github.com/Bannawat01/ai-fetch-healer/commit/e352b77d4ad1b16db3bf3f50ffcabd9ad60a27bf))

# [1.5.0](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.4.0...v1.5.0) (2026-07-24)


### Features

* wire up code coverage measurement and Codecov upload ([e151143](https://github.com/Bannawat01/ai-fetch-healer/commit/e1511430f7bd05de91b6e0d5600e546e5a0a40c7))

# [1.4.0](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.3.1...v1.4.0) (2026-07-24)


### Features

* add benchmarks for Masker and HeuristicCache hot paths ([41dca67](https://github.com/Bannawat01/ai-fetch-healer/commit/41dca6703a71f57474a950296e2e44498b100962))
* framework adapters for Express and Web-standard runtimes ([7016280](https://github.com/Bannawat01/ai-fetch-healer/commit/701628034372cbe26231cf07ca87874905231734))

## [1.3.1](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.3.0...v1.3.1) (2026-07-24)


### Performance Improvements

* hoist regex + dedupe key normalization in Masker hot path ([9f29614](https://github.com/Bannawat01/ai-fetch-healer/commit/9f296141cbb598eccd9949b4f577f6aeae76c38f))

# [1.3.0](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.2.0...v1.3.0) (2026-07-24)


### Features

* createHealedFetchFromEnv - zero-config provider auto-detection ([93ddb07](https://github.com/Bannawat01/ai-fetch-healer/commit/93ddb07fd8c208c58d6f3bee07dc41fed8516063))

# [1.2.0](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.1.0...v1.2.0) (2026-07-24)


### Features

* model fallback chains + env-var overrides across all providers ([d738cd0](https://github.com/Bannawat01/ai-fetch-healer/commit/d738cd06e9d2588ba86a94687eb237fd674818e3))

# [1.1.0](https://github.com/Bannawat01/ai-fetch-healer/compare/v1.0.2...v1.1.0) (2026-07-20)


### Bug Fixes

* correct biome.json folder-ignore pattern syntax ([6977ea6](https://github.com/Bannawat01/ai-fetch-healer/commit/6977ea66db3cb7380a0c24f215c215d5e708ad7b))
* correct GitHub repo owner in README badge and HTTP-Referer ([474ec70](https://github.com/Bannawat01/ai-fetch-healer/commit/474ec70fa677276e7543572d742ddc5f936ad08b))
* implement ADD_REQUIRED action, was promised by prompt but unhandled ([b3755a2](https://github.com/Bannawat01/ai-fetch-healer/commit/b3755a2762b5d14876d0a80a3e7b52d033db5576))
* OpenRouter default model 404s, error messages give no hint ([6254f1b](https://github.com/Bannawat01/ai-fetch-healer/commit/6254f1ba53c48c493105a2a7c62f6c4edaa777aa))
* populate empty MIT LICENSE, add masker security tests ([a21d5c2](https://github.com/Bannawat01/ai-fetch-healer/commit/a21d5c2dc8c732a049b1b457f547b173e79273f0))
* reject empty-string addFields values, don't apply junk placeholders ([587a6b7](https://github.com/Bannawat01/ai-fetch-healer/commit/587a6b7ce238de5db6a4dc768df3c34372d20b23))
* release workflow never saw existing git tags, republished 1.0.0 ([d9cc02c](https://github.com/Bannawat01/ai-fetch-healer/commit/d9cc02c248c734363dc9a0ae37b52c8a923456e2))
* release workflow npm@latest engine mismatch on Node 20 ([d05582e](https://github.com/Bannawat01/ai-fetch-healer/commit/d05582e9346452a8f6a3e1baa6fc27b5b8fafb7b))
* repair state left by the botched first semantic-release run ([ad6ebfb](https://github.com/Bannawat01/ai-fetch-healer/commit/ad6ebfb6ecd53c3d65ec0a80bd26b675b015d81c))
* replace error: any with unknown in LLM provider catch blocks ([e835a38](https://github.com/Bannawat01/ai-fetch-healer/commit/e835a384382e2068e74a8ae8df4552f8c836d24b))
* sync ILLMProvider and BaseLLMProvider heal() signatures ([6624f30](https://github.com/Bannawat01/ai-fetch-healer/commit/6624f30a62db37dcba5de36e4e68b0f6d6aa670e))


### Features

* add GroqProvider and OllamaProvider ([e3a19ca](https://github.com/Bannawat01/ai-fetch-healer/commit/e3a19ca6f121c692453303edc53ffaa133210718))
* add healableStatuses and allowUnsafeRetry config options ([45188e0](https://github.com/Bannawat01/ai-fetch-healer/commit/45188e062c84c5d49224a58cd94638c7ded4f522))
* add TTL and true LRU eviction to HeuristicCache ([d7232ee](https://github.com/Bannawat01/ai-fetch-healer/commit/d7232eee02b36bc7cade0a503156e3be2d02b8eb))
* injectable logger and onHeal/onHealFail lifecycle hooks ([acdbef3](https://github.com/Bannawat01/ai-fetch-healer/commit/acdbef39c451e4687b80610b6798319c7d5cbc7d))
* retry provider.heal() with exponential backoff ([773ef26](https://github.com/Bannawat01/ai-fetch-healer/commit/773ef26257b65a5ca3ab4dcbf57ae8a653bb9bc2))
