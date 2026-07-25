import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(here, "../dist/cli.js");

/**
 * Exercises the built CLI as a real child process. Requires `pnpm build` to
 * have produced dist/cli.js; skipped otherwise so a bare `vitest run` on a
 * clean checkout doesn't fail on a missing artifact.
 */
const maybe = existsSync(cliPath) ? describe : describe.skip;

function runCli(
	args: string[],
	env: Record<string, string>,
	cwd?: string,
): { status: number | null; stdout: string } {
	const result = spawnSync(process.execPath, [cliPath, ...args], {
		// Clean env: only what we pass, so the developer's real keys never leak in.
		env: { PATH: process.env.PATH ?? "", ...env },
		cwd,
		encoding: "utf8",
	});
	// Strip ANSI color codes for stable assertions.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes
	const stdout = (result.stdout ?? "").replace(/\x1b\[[0-9;]*m/g, "");
	return { status: result.status, stdout };
}

maybe("ai-fetch-healer CLI", () => {
	it("exits 1 and lists variables when no credentials are set", () => {
		const { status, stdout } = runCli(["doctor"], {});

		expect(status).toBe(1);
		expect(stdout).toContain("No provider credentials found");
		expect(stdout).toContain("AI_HEALER_OPENROUTER_KEY");
	});

	it("auto-selects a provider and passes with --offline given a key", () => {
		const { status, stdout } = runCli(["doctor", "--offline"], {
			OPENAI_API_KEY: "sk-fake",
		});

		expect(status).toBe(0);
		expect(stdout).toContain("Auto-selected OpenAI");
		expect(stdout).toContain("Setup looks healthy");
	});

	it("never prints the key value", () => {
		const { stdout } = runCli(["doctor", "--offline"], {
			OPENAI_API_KEY: "sk-super-secret-123",
		});

		expect(stdout).not.toContain("sk-super-secret-123");
	});

	it("prints usage on --help", () => {
		const { stdout } = runCli(["--help"], {});

		expect(stdout).toContain("ai-fetch-healer <command>");
		expect(stdout).toContain("doctor");
		expect(stdout).toContain("init");
	});

	describe("init", () => {
		let dir: string;

		beforeEach(() => {
			dir = mkdtempSync(join(tmpdir(), "ai-fetch-healer-init-"));
		});

		afterEach(() => {
			rmSync(dir, { recursive: true, force: true });
		});

		it("writes the provider env var to .env in the cwd", () => {
			const { status, stdout } = runCli(
				["init", "--provider", "openrouter"],
				{},
				dir,
			);

			expect(status).toBe(0);
			expect(stdout).toContain("Wrote AI_HEALER_OPENROUTER_KEY to .env");
			const env = readFileSync(join(dir, ".env"), "utf8");
			expect(env).toContain("AI_HEALER_OPENROUTER_KEY=");
		});

		it("writes a concrete default for ollama (no key needed)", () => {
			runCli(["init", "--provider", "ollama"], {}, dir);

			const env = readFileSync(join(dir, ".env"), "utf8");
			expect(env).toContain("AI_HEALER_OLLAMA_URL=http://localhost:11434");
		});

		it("leaves an existing env var untouched without --force", () => {
			writeFileSync(
				join(dir, ".env"),
				"AI_HEALER_OPENAI_KEY=sk-mine\n",
				"utf8",
			);

			const { stdout } = runCli(["init", "--provider", "openai"], {}, dir);

			expect(stdout).toContain("already set in .env");
			const env = readFileSync(join(dir, ".env"), "utf8");
			expect(env).toContain("AI_HEALER_OPENAI_KEY=sk-mine");
		});

		it("rejects an unknown provider and lists the valid ones", () => {
			const { status, stdout } = runCli(
				["init", "--provider", "nope"],
				{},
				dir,
			);

			expect(status).toBe(1);
			expect(stdout).toContain("Available:");
			expect(existsSync(join(dir, ".env"))).toBe(false);
		});
	});
});
