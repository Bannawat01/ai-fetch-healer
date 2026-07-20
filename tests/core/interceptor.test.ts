import { describe, expect, it, vi } from "vitest";
import { HeuristicCache } from "../../src/core/cache";
import { createHealedFetch } from "../../src/core/interceptor";
import type { ILLMProvider } from "../../src/types";

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
		expect(onHeal).toHaveBeenCalledWith({
			rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			source: "llm",
		});

		consoleLogSpy.mockRestore();
	});

	it("calls onHeal with source 'cache' on a cache hit", async () => {
		const heal = vi.fn().mockResolvedValue({
			healedPayload: {},
			rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
		});
		const provider: ILLMProvider = { name: "MockProvider", heal };

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValue(
			new Response("invalid payload", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);

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
		expect(onHeal).toHaveBeenNthCalledWith(1, {
			rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			source: "llm",
		});
		expect(onHeal).toHaveBeenNthCalledWith(2, {
			rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
			source: "cache",
		});
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
});
