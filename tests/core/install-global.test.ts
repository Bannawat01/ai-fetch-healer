import { afterEach, describe, expect, it, vi } from "vitest";
import { installGlobalHealing } from "../../src/core/install-global";
import type { ILLMProvider } from "../../src/types";

const stubProvider: ILLMProvider = {
	name: "Stub",
	heal: vi.fn().mockResolvedValue({
		healedPayload: {},
		rule: { action: "MAP_FIELDS", mapping: {} },
	}),
};

describe("installGlobalHealing", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("replaces globalThis.fetch and restores it on uninstall", () => {
		const original = vi.fn();
		vi.stubGlobal("fetch", original);

		const uninstall = installGlobalHealing({ provider: stubProvider });
		expect(globalThis.fetch).not.toBe(original);

		uninstall();
		expect(globalThis.fetch).toBe(original);
	});

	it("heals a failing request made through the patched global fetch", async () => {
		const upstream = vi.fn();
		upstream.mockResolvedValueOnce(
			new Response("bad", {
				status: 400,
				statusText: "Bad Request",
				headers: { "content-type": "text/plain" },
			}),
		);
		upstream.mockResolvedValueOnce(
			new Response('{"ok":true}', {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", upstream);

		const heal = vi.fn().mockResolvedValue({
			healedPayload: {},
			rule: { action: "MAP_FIELDS", mapping: { name: "full_name" } },
		});
		const uninstall = installGlobalHealing({
			provider: { name: "Stub", heal },
		});

		try {
			const res = await fetch("https://api.example.com/users", {
				method: "POST",
				body: JSON.stringify({ name: "Ada" }),
			});
			expect(res.status).toBe(200);
			expect(upstream).toHaveBeenCalledTimes(2);
			expect(heal).toHaveBeenCalledTimes(1);
		} finally {
			uninstall();
		}
	});

	it("is a no-op on double install - never stacks wrappers", () => {
		const original = vi.fn();
		vi.stubGlobal("fetch", original);

		const uninstall1 = installGlobalHealing({ provider: stubProvider });
		const wrapped = globalThis.fetch;

		const uninstall2 = installGlobalHealing({ provider: stubProvider });
		expect(globalThis.fetch).toBe(wrapped);

		// Either returned uninstaller restores the single original.
		uninstall2();
		expect(globalThis.fetch).toBe(original);

		// The first uninstaller is now a no-op, not a re-clobber.
		uninstall1();
		expect(globalThis.fetch).toBe(original);
	});

	it("auto-detects the provider from env when none is passed", () => {
		const original = vi.fn();
		vi.stubGlobal("fetch", original);
		vi.stubEnv("AI_HEALER_OPENROUTER_KEY", "or-key");

		const uninstall = installGlobalHealing();
		expect(globalThis.fetch).not.toBe(original);
		uninstall();
	});

	it("propagates the actionable error when no credentials are configured", () => {
		const original = vi.fn();
		vi.stubGlobal("fetch", original);
		// Explicitly clear every key createProviderFromEnv checks, so a dev
		// machine with a real key set doesn't make this test pass spuriously.
		for (const key of [
			"AI_HEALER_OPENROUTER_KEY",
			"OPENROUTER_API_KEY",
			"AI_HEALER_GROQ_KEY",
			"GROQ_API_KEY",
			"GEMINI_API_KEY",
			"AI_HEALER_OLLAMA_URL",
			"AI_HEALER_OLLAMA_KEY",
			"OLLAMA_API_KEY",
		]) {
			vi.stubEnv(key, "");
		}

		expect(() => installGlobalHealing()).toThrow(
			/No LLM provider credentials found/,
		);
		// A failed install must not have replaced fetch.
		expect(globalThis.fetch).toBe(original);
	});
});
