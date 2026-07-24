import { describe, expect, it, vi } from "vitest";
import {
	createHealedProxyMiddleware,
	type ExpressLikeRequest,
	type ExpressLikeResponse,
} from "../../src/adapters/express";

function mockRes() {
	return {
		status: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
	} satisfies ExpressLikeResponse;
}

describe("createHealedProxyMiddleware", () => {
	it("proxies JSON body to healedFetch and mirrors status/body/content-type onto res", async () => {
		const healedFetch = vi.fn().mockResolvedValue(
			new Response('{"ok":true}', {
				status: 201,
				headers: { "content-type": "application/json" },
			}),
		);

		const middleware = createHealedProxyMiddleware({
			target: "https://upstream.example.com/v1/users",
			healedFetch: healedFetch as unknown as typeof fetch,
		});

		const req: ExpressLikeRequest = {
			method: "POST",
			body: { user_name: "Ada" },
			headers: {},
		};
		const res = mockRes();

		await middleware(req, res);

		expect(healedFetch).toHaveBeenCalledWith(
			"https://upstream.example.com/v1/users",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ user_name: "Ada" }),
			}),
		);
		expect(res.status).toHaveBeenCalledWith(201);
		expect(res.send).toHaveBeenCalledWith('{"ok":true}');
		expect(res.set).toHaveBeenCalledWith("content-type", "application/json");
	});

	it("sends no body for GET requests", async () => {
		const healedFetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));

		const middleware = createHealedProxyMiddleware({
			target: "https://upstream.example.com/v1/users",
			healedFetch: healedFetch as unknown as typeof fetch,
		});

		await middleware({ method: "GET", headers: {} }, mockRes());

		const init = healedFetch.mock.calls[0][1];
		expect(init.body).toBeUndefined();
	});

	it("derives the target per-request when target is a function", async () => {
		const healedFetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));

		const middleware = createHealedProxyMiddleware({
			target: (req) => `https://upstream.example.com/v1/${req.method}`,
			healedFetch: healedFetch as unknown as typeof fetch,
		});

		await middleware({ method: "PATCH", body: {}, headers: {} }, mockRes());

		expect(healedFetch.mock.calls[0][0]).toBe(
			"https://upstream.example.com/v1/PATCH",
		);
	});
});
