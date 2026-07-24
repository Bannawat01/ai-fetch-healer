import { describe, expect, it, vi } from "vitest";
import { createHealedRouteHandler } from "../../src/adapters/web";

describe("createHealedRouteHandler", () => {
	it("proxies method/body/forwarded headers to healedFetch and returns its Response", async () => {
		const healedFetch = vi
			.fn()
			.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

		const handler = createHealedRouteHandler({
			target: "https://upstream.example.com/v1/orders",
			healedFetch: healedFetch as unknown as typeof fetch,
		});

		const req = new Request("https://my-app.example.com/api/orders", {
			method: "POST",
			headers: { "content-type": "application/json", "x-ignored": "nope" },
			body: JSON.stringify({ amount: 100 }),
		});

		const response = await handler(req);

		expect(healedFetch).toHaveBeenCalledTimes(1);
		const [target, init] = healedFetch.mock.calls[0];
		expect(target).toBe("https://upstream.example.com/v1/orders");
		expect(init.method).toBe("POST");
		expect(init.headers.get("content-type")).toBe("application/json");
		expect(init.headers.get("x-ignored")).toBeNull();
		expect(await new Request("http://x", init).text()).toBe(
			JSON.stringify({ amount: 100 }),
		);
		expect(response.status).toBe(200);
	});

	it("sends no body for GET/HEAD requests", async () => {
		const healedFetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));

		const handler = createHealedRouteHandler({
			target: "https://upstream.example.com/v1/orders",
			healedFetch: healedFetch as unknown as typeof fetch,
		});

		await handler(new Request("https://my-app.example.com/api/orders"));

		const init = healedFetch.mock.calls[0][1];
		expect(init.body).toBeUndefined();
	});

	it("derives the target per-request when target is a function", async () => {
		const healedFetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));

		const handler = createHealedRouteHandler({
			target: (req) =>
				`https://upstream.example.com${new URL(req.url).pathname}`,
			healedFetch: healedFetch as unknown as typeof fetch,
		});

		await handler(new Request("https://my-app.example.com/api/orders/42"));

		expect(healedFetch.mock.calls[0][0]).toBe(
			"https://upstream.example.com/api/orders/42",
		);
	});
});
