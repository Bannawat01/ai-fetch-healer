import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_MODELS,
	isModelUnavailableError,
	resolveModelChain,
} from "../../src/llm/models";

describe("resolveModelChain", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("prefers an explicit single model over env and fallback", () => {
		vi.stubEnv("AI_HEALER_X_MODEL", "env-a,env-b");
		expect(
			resolveModelChain({
				explicit: "explicit-model",
				envVar: "AI_HEALER_X_MODEL",
				fallback: DEFAULT_MODELS.groq,
			}),
		).toEqual(["explicit-model"]);
	});

	it("prefers an explicit array over env and fallback", () => {
		expect(
			resolveModelChain({
				explicit: ["a", "b"],
				fallback: DEFAULT_MODELS.groq,
			}),
		).toEqual(["a", "b"]);
	});

	it("reads a comma-separated env override when no explicit input", () => {
		vi.stubEnv("AI_HEALER_X_MODEL", " m1 , m2 ,, m3 ");
		expect(
			resolveModelChain({
				envVar: "AI_HEALER_X_MODEL",
				fallback: DEFAULT_MODELS.groq,
			}),
		).toEqual(["m1", "m2", "m3"]);
	});

	it("falls back to the registry when nothing else is provided", () => {
		expect(
			resolveModelChain({
				envVar: "AI_HEALER_UNSET_MODEL",
				fallback: DEFAULT_MODELS.openrouter,
			}),
		).toEqual([...DEFAULT_MODELS.openrouter]);
	});

	it("always returns at least one model", () => {
		const chain = resolveModelChain({
			explicit: "  ",
			fallback: DEFAULT_MODELS.gemini,
		});
		expect(chain.length).toBeGreaterThan(0);
	});
});

describe("isModelUnavailableError", () => {
	it("treats any 404 as a model-availability problem", () => {
		expect(isModelUnavailableError(404, "")).toBe(true);
	});

	it("treats 400/422 as model problems only when the body mentions the model", () => {
		expect(isModelUnavailableError(400, "the model was deprecated")).toBe(true);
		expect(isModelUnavailableError(422, "unknown MODEL id")).toBe(true);
		expect(isModelUnavailableError(400, "invalid field foo")).toBe(false);
	});

	it("never falls back on auth/other errors", () => {
		expect(isModelUnavailableError(401, "model")).toBe(false);
		expect(isModelUnavailableError(500, "model")).toBe(false);
	});
});
