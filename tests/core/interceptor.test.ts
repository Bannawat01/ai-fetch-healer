import { describe, expect, it, vi } from "vitest";
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
});
