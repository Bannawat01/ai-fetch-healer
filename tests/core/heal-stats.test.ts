import { describe, expect, it, vi } from "vitest";
import { HealStats } from "../../src/core/heal-stats";
import { createHealedFetch } from "../../src/core/interceptor";
import type { HealEvent, ILLMProvider } from "../../src/types";

const mapRule = { action: "MAP_FIELDS", mapping: { a: "b" } } as const;

function heal(overrides: Partial<HealEvent> = {}): HealEvent {
	return {
		rule: mapRule,
		source: "llm",
		method: "POST",
		url: "https://api.example.com/v1/users",
		...overrides,
	};
}

describe("HealStats", () => {
	it("counts totals, sources, and dry-runs", () => {
		const stats = new HealStats();
		stats.onHeal(heal({ source: "llm" }));
		stats.onHeal(heal({ source: "cache" }));
		stats.onHeal(heal({ source: "cache", dryRun: true }));

		const snap = stats.snapshot();
		expect(snap.total).toBe(3);
		expect(snap.llm).toBe(1);
		expect(snap.cache).toBe(2);
		expect(snap.dryRun).toBe(1);
	});

	it("groups by endpoint with the query string stripped and the path only", () => {
		const stats = new HealStats();
		stats.onHeal(heal({ url: "https://api.example.com/v1/users?page=1" }));
		stats.onHeal(heal({ url: "https://api.example.com/v1/users?page=2" }));
		stats.onHeal(
			heal({ method: "PATCH", url: "https://api.example.com/v1/orders" }),
		);

		const snap = stats.snapshot();
		expect(snap.byEndpoint).toEqual({
			"POST /v1/users": 2,
			"PATCH /v1/orders": 1,
		});
	});

	it("keeps relative URLs as-is and defaults a missing method/url", () => {
		const stats = new HealStats();
		stats.onHeal(heal({ url: "/relative/path?x=1" }));
		stats.onHeal(heal({ method: undefined, url: undefined }));

		const snap = stats.snapshot();
		expect(snap.byEndpoint["POST /relative/path"]).toBe(1);
		expect(snap.byEndpoint["GET unknown"]).toBe(1);
	});

	it("counts by rule action", () => {
		const stats = new HealStats();
		stats.onHeal(heal({ rule: { action: "MAP_FIELDS", mapping: {} } }));
		stats.onHeal(
			heal({ rule: { action: "ADD_REQUIRED", addFields: { x: 1 } } }),
		);
		stats.onHeal(heal({ rule: { action: "MAP_FIELDS", mapping: {} } }));

		expect(stats.snapshot().byAction).toEqual({
			MAP_FIELDS: 2,
			ADD_REQUIRED: 1,
		});
	});

	it("counts failures via onHealFail without inspecting the error", () => {
		const stats = new HealStats();
		stats.onHealFail(new Error("boom"));
		stats.onHealFail("string error");

		expect(stats.snapshot().failures).toBe(2);
	});

	it("snapshot() is a copy - mutating it does not affect the collector", () => {
		const stats = new HealStats();
		stats.onHeal(heal());

		const snap = stats.snapshot();
		snap.byEndpoint["POST /v1/users"] = 999;
		snap.total = 999;

		expect(stats.snapshot().total).toBe(1);
		expect(stats.snapshot().byEndpoint["POST /v1/users"]).toBe(1);
	});

	it("reset() zeroes every counter", () => {
		const stats = new HealStats();
		stats.onHeal(heal());
		stats.onHealFail(new Error("x"));
		stats.reset();

		expect(stats.snapshot()).toEqual({
			total: 0,
			llm: 0,
			cache: 0,
			dryRun: 0,
			failures: 0,
			byEndpoint: {},
			byAction: {},
		});
	});

	it("wires end-to-end through createHealedFetch, attributing the real endpoint", async () => {
		const provider: ILLMProvider = {
			name: "MockProvider",
			heal: vi.fn().mockResolvedValue({ healedPayload: {}, rule: mapRule }),
		};

		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response("bad", {
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

		const stats = new HealStats();
		const healedFetch = createHealedFetch(provider, {
			fetchFunction: fetchMock as unknown as typeof fetch,
			onHeal: stats.onHeal,
			onHealFail: stats.onHealFail,
		});

		await healedFetch("https://api.example.com/v1/orders?trace=abc", {
			method: "POST",
			body: JSON.stringify({ a: 1 }),
		});

		const snap = stats.snapshot();
		expect(snap.total).toBe(1);
		expect(snap.llm).toBe(1);
		expect(snap.byEndpoint).toEqual({ "POST /v1/orders": 1 });
		expect(snap.byAction).toEqual({ MAP_FIELDS: 1 });
	});
});
