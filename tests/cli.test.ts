import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
): { status: number | null; stdout: string } {
	const result = spawnSync(process.execPath, [cliPath, ...args], {
		// Clean env: only what we pass, so the developer's real keys never leak in.
		env: { PATH: process.env.PATH ?? "", ...env },
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
	});
});
