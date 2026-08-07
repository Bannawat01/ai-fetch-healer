import { describe, expect, it, vi } from "vitest";
import { HeuristicCache } from "../../src/core/cache";
import { createHealedFetch } from "../../src/core/interceptor";
import type { RuleStore } from "../../src/core/store";
import { HeuristicHealer } from "../../src/llm/heuristic";
import type { HealingRule, ILLMProvider } from "../../src/types";

describe("createHealedFetch", () => {
	it("applies CHANGE_TYPE conversions from AI healing rule", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: {
					action: "CHANGE_TYPE",
					mapping: { name: "full_name" },
					typeChanges: {
						age: "number",
						isActive: "boolean",
					},
					suggestion: "Convert age/isActive types and rename name",
				},
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({
				age: "42",
				isActive: "true",
				name: "Alice",
			}),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);

		const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
		const healedBody = JSON.parse(String(secondInit.body));

		expect(healedBody).toEqual({
			age: 42,
			isActive: true,
			full_name: "Alice",
		});
	});

	it("keeps original value when CHANGE_TYPE conversion is not possible", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: {
					action: "CHANGE_TYPE",
					typeChanges: {
						age: "number",
						isActive: "boolean",
					},
				},
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({
				age: "not-a-number",
				isActive: "maybe",
			}),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);

		const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
		const healedBody = JSON.parse(String(secondInit.body));

		expect(healedBody).toEqual({
			age: "not-a-number",
			isActive: "maybe",
		});
	});

	it("skips healed retry for non-idempotent method when allowUnsafeRetry is false", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			}),
		};

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			allowUnsafeRetry: false,
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(provider.heal).not.toHaveBeenCalled();
		expect(result.status).toBe(400);
	});

	it("retries non-idempotent method by default (allowUnsafeRetry defaults true)", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("only heals statuses listed in healableStatuses", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			}),
		};

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 409,
				statusText: "Conflict",
				headers: { "content-type": "text/plain" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(409);
	});

	it("heals a custom status when configured via healableStatuses", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 409,
				statusText: "Conflict",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			healableStatuses: [409],
			cache: new HeuristicCache(),
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("retries provider.heal() on failure with backoff, then succeeds", async () => {
		const heal = vi
			.fn()
			.mockRejectedValueOnce(new Error("network blip"))
			.mockResolvedValueOnce({
				healedPayload: {},
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			});
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			healRetryBaseMs: 1,
			cache: new HeuristicCache(),
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(heal).toHaveBeenCalledTimes(2);
		expect(result.status).toBe(200);
	});

	it("gives up after exhausting healRetries and fails open", async () => {
		const heal = vi.fn().mockRejectedValue(new Error("persistent failure"));
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			healRetries: 1,
			healRetryBaseMs: 1,
			cache: new HeuristicCache(),
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(heal).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(400);
	});

	it("uses a custom logger instead of console and calls onHeal on a fresh LLM heal", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const logger = { log: vi.fn(), warn: vi.fn() };
		const onHeal = vi.fn();
		const consoleLogSpy = vi.spyOn(console, "log");

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
			logger,
			onHeal,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(logger.log).toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalled();
		expect(consoleLogSpy).not.toHaveBeenCalled();
		expect(onHeal).toHaveBeenCalledWith(
			expect.objectContaining({
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
				source: "llm",
			}),
		);

		consoleLogSpy.mockRestore();
	});

	it("calls onHeal with source 'cache' on a cache hit", async () => {
		const heal = vi.fn().mockResolvedValue({
			healedPayload: {},
			rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
		});
		const provider: ILLMProvider = { name: "MockProvider", heal };

		// Each healedFetch does: original send (400) then a healed retry. The
		// retry must return 2xx for the rule to be cached (persist-on-success),
		// so the second call can hit the cache instead of re-consulting the LLM.
		const bad = () =>
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			});
		const good = () =>
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(bad())
			.mockResolvedValueOnce(good())
			.mockResolvedValueOnce(bad())
			.mockResolvedValueOnce(good());

		const cache = new HeuristicCache();
		const onHeal = vi.fn();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache,
			onHeal,
			allowUnsafeRetry: false,
		});

		await healedFetch("https://api.example.com/users", {
			method: "GET",
			body: JSON.stringify({ name: "Alice" }),
		});
		await healedFetch("https://api.example.com/users", {
			method: "GET",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(heal).toHaveBeenCalledTimes(1);
		expect(onHeal).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
				source: "llm",
			}),
		);
		expect(onHeal).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
				source: "cache",
			}),
		);
	});

	it("calls onHealFail when provider.heal() exhausts all retries", async () => {
		const heal = vi.fn().mockRejectedValue(new Error("persistent failure"));
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);

		const onHealFail = vi.fn();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
			healRetries: 0,
			onHealFail,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(onHealFail).toHaveBeenCalledTimes(1);
		expect(onHealFail).toHaveBeenCalledWith(expect.any(Error));
	});

	it("calls onHealFail when the provider returns an invalid healing rule", async () => {
		const heal = vi.fn().mockResolvedValue({
			healedPayload: {},
			rule: { action: 123 },
		});
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal,
		} as unknown as ILLMProvider;

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);

		const onHealFail = vi.fn();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
			onHealFail,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(onHealFail).toHaveBeenCalledTimes(1);
	});

	it("applies ADD_REQUIRED by injecting the missing field, even with no mapping/typeChanges", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: {
					action: "ADD_REQUIRED",
					addFields: { currency: "USD" },
					suggestion: "currency is required by the API but was never sent",
				},
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response('{"error":"currency is required"}', {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "application/json" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
		});

		await healedFetch("https://api.example.com/orders", {
			method: "POST",
			body: JSON.stringify({ amount: 100 }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);

		const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
		const healedBody = JSON.parse(String(secondInit.body));

		expect(healedBody).toEqual({ amount: 100, currency: "USD" });
	});

	it("never overwrites a key that's already present via ADD_REQUIRED", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: {
					action: "ADD_REQUIRED",
					addFields: { amount: 0 },
				},
			}),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("bad request", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
		});

		await healedFetch("https://api.example.com/orders", {
			method: "POST",
			body: JSON.stringify({ amount: 100 }),
		});

		const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
		const healedBody = JSON.parse(String(secondInit.body));

		expect(healedBody.amount).toBe(100);
	});

	it("rejects a rule whose addFields carries an empty-string value and calls onHealFail", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({
				healedPayload: {},
				rule: {
					action: "ADD_REQUIRED",
					addFields: { full_name: "" },
					suggestion: "Added the required field",
				},
			}),
		};

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response('{"error":"full_name is required"}', {
				status: 422,
				statusText: "Unprocessable Entity",
				headers: { "content-type": "application/json" },
			}),
		);

		const onHealFail = vi.fn();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
			onHealFail,
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ email: "a@example.com" }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(422);
		expect(onHealFail).toHaveBeenCalledTimes(1);
		expect(onHealFail).toHaveBeenCalledWith(expect.any(Error));
	});

	it("uses an async RuleStore: miss consults the LLM, hit skips it", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };
		const heal = vi.fn().mockResolvedValue({ healedPayload: {}, rule });
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const backing = new Map<string, HealingRule>();
		const store: RuleStore = {
			get: async (key) => backing.get(key) ?? null,
			set: async (key, value) => {
				backing.set(key, value);
			},
		};

		// Retry must succeed (2xx) for the rule to be persisted, so the second
		// request finds it in the store instead of consulting the LLM again.
		const bad = () =>
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			});
		const good = () =>
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(bad())
			.mockResolvedValueOnce(good())
			.mockResolvedValueOnce(bad())
			.mockResolvedValueOnce(good());

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			store,
			allowUnsafeRetry: false,
		});

		await healedFetch("https://api.example.com/users", {
			method: "GET",
			body: JSON.stringify({ name: "Alice" }),
		});
		await healedFetch("https://api.example.com/users", {
			method: "GET",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(heal).toHaveBeenCalledTimes(1);
		expect(backing.size).toBe(1);
	});

	it("treats a throwing store.get() as a cache miss instead of aborting the heal", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };
		const heal = vi.fn().mockResolvedValue({ healedPayload: {}, rule });
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const store: RuleStore = {
			get: () => {
				throw new Error("store backend down");
			},
			set: () => {
				throw new Error("store backend down");
			},
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			store,
			logger: { log: vi.fn(), warn: vi.fn() },
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(heal).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.status).toBe(200);
	});

	it("dry-run reports the rule via onHeal but never sends the healed retry", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };
		const heal = vi.fn().mockResolvedValue({ healedPayload: {}, rule });
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const fetchMock = vi.fn().mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);

		const onHeal = vi.fn();
		const cache = new HeuristicCache();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache,
			dryRun: true,
			onHeal,
		});

		const result = await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		// Analyzed once, but only the original send happened - no retry.
		expect(heal).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.status).toBe(400);
		expect(onHeal).toHaveBeenCalledWith(
			expect.objectContaining({ rule, source: "llm", dryRun: true }),
		);
	});

	it("omits the dryRun flag from onHeal when dry-run is off", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };
		const heal = vi.fn().mockResolvedValue({ healedPayload: {}, rule });
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const onHeal = vi.fn();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
			onHeal,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(onHeal).toHaveBeenCalledWith(
			expect.objectContaining({ rule, source: "llm" }),
		);
		expect(onHeal).not.toHaveBeenCalledWith(
			expect.objectContaining({ dryRun: true }),
		);
	});

	it("heals a casing mismatch end-to-end with HeuristicHealer and no LLM key", async () => {
		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response('{"error":"field \\"full_name\\" is required"}', {
				status: 422,
				statusText: "Unprocessable Entity",
				headers: { "content-type": "application/json" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(new HeuristicHealer(), {
			fetchFunction: fetchMock as unknown as typeof fetch,
			cache: new HeuristicCache(),
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ fullName: "Alice", age: 30 }),
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
		const healedBody = JSON.parse(String(secondInit.body));
		expect(healedBody).toEqual({ full_name: "Alice", age: 30 });
	});

	it("prefers store over cache when both are configured", async () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };
		const heal = vi.fn().mockResolvedValue({ healedPayload: {}, rule });
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const storeGet = vi.fn().mockResolvedValue(rule);
		const store: RuleStore = { get: storeGet, set: vi.fn() };
		const cache = new HeuristicCache();
		const cacheGet = vi.spyOn(cache, "get");

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			store,
			cache,
		});

		await healedFetch("https://api.example.com/users", {
			method: "POST",
			body: JSON.stringify({ name: "Alice" }),
		});

		expect(storeGet).toHaveBeenCalledTimes(1);
		expect(cacheGet).not.toHaveBeenCalled();
		expect(heal).not.toHaveBeenCalled();
	});

	describe("persists a rule only when the healed retry succeeds", () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };

		function makeProvider(): ILLMProvider {
			return {
				name: "MockProvider",
				heal: vi.fn().mockResolvedValue({ healedPayload: {}, rule }),
			};
		}

		it("persists the rule when the healed retry returns 2xx", async () => {
			const fetchMock = vi.fn();
			fetchMock.mockResolvedValueOnce(
				new Response("invalid payload", {
					status: 400,
					statusText: "Bad Request",
					headers: { "content-type": "text/plain" },
				}),
			);
			fetchMock.mockResolvedValueOnce(
				new Response('{"ok":true}', {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

			const store: RuleStore = {
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn(),
			};

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				store,
			});

			await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(store.set).toHaveBeenCalledTimes(1);
			expect(store.set).toHaveBeenCalledWith(expect.any(String), rule);
		});

		it("does NOT persist the rule when the healed retry still fails (non-2xx)", async () => {
			// Both the original send and the healed retry return 400: the LLM's
			// rule was wrong, so it must not be cached and reused later.
			const fetchMock = vi.fn().mockResolvedValue(
				new Response("still bad", {
					status: 400,
					statusText: "Bad Request",
					headers: { "content-type": "text/plain" },
				}),
			);

			const store: RuleStore = {
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn(),
			};

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				store,
			});

			const result = await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});

			expect(fetchMock).toHaveBeenCalledTimes(2); // original + one healed retry
			expect(store.set).not.toHaveBeenCalled();
			expect(result.status).toBe(400); // fail-open: caller still gets a response
		});

		it("dryRun: reports via onHeal, sends no retry, and persists nothing", async () => {
			const fetchMock = vi.fn().mockResolvedValueOnce(
				new Response("invalid payload", {
					status: 400,
					statusText: "Bad Request",
					headers: { "content-type": "text/plain" },
				}),
			);

			const store: RuleStore = {
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn(),
			};
			const onHeal = vi.fn();

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				store,
				dryRun: true,
				onHeal,
			});

			const result = await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});

			expect(onHeal).toHaveBeenCalledWith(
				expect.objectContaining({
					rule,
					source: "llm",
					dryRun: true,
				}),
			);
			expect(fetchMock).toHaveBeenCalledTimes(1); // no healed retry
			expect(store.set).not.toHaveBeenCalled();
			expect(result.status).toBe(400);
		});
	});

	describe("allowUnsafeRetry default-change deprecation warning", () => {
		const rule = { action: "MAP_FIELDS", mapping: { name: "full_name" } };

		function makeProvider(): ILLMProvider {
			return {
				name: "MockProvider",
				heal: vi.fn().mockResolvedValue({ healedPayload: {}, rule }),
			};
		}

		const bad = () =>
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			});
		const good = () =>
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			});

		function depWarnings(logger: {
			warn: ReturnType<typeof vi.fn>;
		}): unknown[] {
			return logger.warn.mock.calls.filter((c) =>
				String(c[0]).includes("Deprecation"),
			);
		}

		it("warns once (not per request) when riding the default on a non-idempotent method", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(bad())
				.mockResolvedValueOnce(good())
				.mockResolvedValueOnce(bad())
				.mockResolvedValueOnce(good());
			const logger = { log: vi.fn(), warn: vi.fn() };

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				cache: new HeuristicCache(),
				logger,
				// allowUnsafeRetry intentionally omitted - riding the default.
			});

			await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});
			await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});

			const warnings = depWarnings(logger);
			expect(warnings).toHaveLength(1);
			expect(String(warnings[0])).toMatch(/default to false/);
		});

		it("does NOT warn when allowUnsafeRetry is set explicitly to true", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(bad())
				.mockResolvedValueOnce(good());
			const logger = { log: vi.fn(), warn: vi.fn() };

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				cache: new HeuristicCache(),
				logger,
				allowUnsafeRetry: true,
			});

			await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});

			expect(depWarnings(logger)).toHaveLength(0);
		});

		it("does NOT warn when allowUnsafeRetry is false (retry is skipped anyway)", async () => {
			const fetchMock = vi.fn().mockResolvedValueOnce(bad());
			const logger = { log: vi.fn(), warn: vi.fn() };

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				cache: new HeuristicCache(),
				logger,
				allowUnsafeRetry: false,
			});

			await healedFetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Alice" }),
			});

			expect(depWarnings(logger)).toHaveLength(0);
		});

		it("does NOT warn for idempotent methods even on the default", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(bad())
				.mockResolvedValueOnce(good());
			const logger = { log: vi.fn(), warn: vi.fn() };

			const healedFetch = createHealedFetch(makeProvider(), {
				fetchFunction: fetchMock as unknown as typeof fetch,
				cache: new HeuristicCache(),
				logger,
			});

			await healedFetch("https://api.example.com/users", {
				method: "PUT",
				body: JSON.stringify({ name: "Alice" }),
			});

			expect(depWarnings(logger)).toHaveLength(0);
		});
	});
});
