# 1.0.0 (2026-07-20)


### Bug Fixes

* correct biome.json folder-ignore pattern syntax ([6977ea6](https://github.com/Bannawat01/ai-fetch-healer/commit/6977ea66db3cb7380a0c24f215c215d5e708ad7b))
* correct GitHub repo owner in README badge and HTTP-Referer ([474ec70](https://github.com/Bannawat01/ai-fetch-healer/commit/474ec70fa677276e7543572d742ddc5f936ad08b))
* implement ADD_REQUIRED action, was promised by prompt but unhandled ([b3755a2](https://github.com/Bannawat01/ai-fetch-healer/commit/b3755a2762b5d14876d0a80a3e7b52d033db5576))
* OpenRouter default model 404s, error messages give no hint ([6254f1b](https://github.com/Bannawat01/ai-fetch-healer/commit/6254f1ba53c48c493105a2a7c62f6c4edaa777aa))
* populate empty MIT LICENSE, add masker security tests ([a21d5c2](https://github.com/Bannawat01/ai-fetch-healer/commit/a21d5c2dc8c732a049b1b457f547b173e79273f0))
* reject empty-string addFields values, don't apply junk placeholders ([587a6b7](https://github.com/Bannawat01/ai-fetch-healer/commit/587a6b7ce238de5db6a4dc768df3c34372d20b23))
* release workflow npm@latest engine mismatch on Node 20 ([d05582e](https://github.com/Bannawat01/ai-fetch-healer/commit/d05582e9346452a8f6a3e1baa6fc27b5b8fafb7b))
* replace any with unknown in error handlers to pass lint ([f85f16a](https://github.com/Bannawat01/ai-fetch-healer/commit/f85f16affb26e69907ed1bfc2d9914d4d1553eb6))
* replace error: any with unknown in LLM provider catch blocks ([e835a38](https://github.com/Bannawat01/ai-fetch-healer/commit/e835a384382e2068e74a8ae8df4552f8c836d24b))
* sync ILLMProvider and BaseLLMProvider heal() signatures ([6624f30](https://github.com/Bannawat01/ai-fetch-healer/commit/6624f30a62db37dcba5de36e4e68b0f6d6aa670e))


### Features

* add GroqProvider and OllamaProvider ([e3a19ca](https://github.com/Bannawat01/ai-fetch-healer/commit/e3a19ca6f121c692453303edc53ffaa133210718))
* add healableStatuses and allowUnsafeRetry config options ([45188e0](https://github.com/Bannawat01/ai-fetch-healer/commit/45188e062c84c5d49224a58cd94638c7ded4f522))
* add TTL and true LRU eviction to HeuristicCache ([d7232ee](https://github.com/Bannawat01/ai-fetch-healer/commit/d7232eee02b36bc7cade0a503156e3be2d02b8eb))
* add vitest suite and update package files ([120404d](https://github.com/Bannawat01/ai-fetch-healer/commit/120404d00abde92c7698b03afd72447b6cb58a2d))
* enhance healing rules with type changes and improve response handling ([c4e2b5f](https://github.com/Bannawat01/ai-fetch-healer/commit/c4e2b5f4a0d8fb4a97001bafdfba87008f4d7737))
* initial release ai-fetch-healer v1.0.0 ([345ba36](https://github.com/Bannawat01/ai-fetch-healer/commit/345ba366941b6ed4745c79a356932d3d3e8d9515))
* injectable logger and onHeal/onHealFail lifecycle hooks ([acdbef3](https://github.com/Bannawat01/ai-fetch-healer/commit/acdbef39c451e4687b80610b6798319c7d5cbc7d))
* retry provider.heal() with exponential backoff ([773ef26](https://github.com/Bannawat01/ai-fetch-healer/commit/773ef26257b65a5ca3ab4dcbf57ae8a653bb9bc2))
