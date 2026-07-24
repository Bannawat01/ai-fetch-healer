#!/usr/bin/env node
import { createProviderFromEnv } from "./core/from-env";

/**
 * `npx ai-fetch-healer doctor` - preflight check for a healing setup.
 * Reports which provider credentials are present (never printing a key value),
 * which provider would be auto-selected, and - unless --offline is passed -
 * fires one real heal() call so a bad key or a dead model chain shows up here
 * instead of the first time a request fails in production.
 */

interface NodeProcess {
	argv?: string[];
	env?: Record<string, string | undefined>;
	exit?: (code?: number) => never;
	exitCode?: number;
}

function getProcess(): NodeProcess | undefined {
	return (globalThis as { process?: NodeProcess }).process;
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function ok(msg: string): void {
	console.log(`  ${GREEN}✓${RESET} ${msg}`);
}
function bad(msg: string): void {
	console.log(`  ${RED}✗${RESET} ${msg}`);
}
function warn(msg: string): void {
	console.log(`  ${YELLOW}!${RESET} ${msg}`);
}

/** Env var groups that select each provider, in the same priority order as from-env. */
const CREDENTIAL_GROUPS: Array<{ provider: string; vars: string[] }> = [
	{
		provider: "OpenRouter",
		vars: ["AI_HEALER_OPENROUTER_KEY", "OPENROUTER_API_KEY"],
	},
	{ provider: "OpenAI", vars: ["AI_HEALER_OPENAI_KEY", "OPENAI_API_KEY"] },
	{
		provider: "Anthropic",
		vars: ["AI_HEALER_ANTHROPIC_KEY", "ANTHROPIC_API_KEY"],
	},
	{ provider: "Groq", vars: ["AI_HEALER_GROQ_KEY", "GROQ_API_KEY"] },
	{ provider: "Gemini", vars: ["GEMINI_API_KEY"] },
	{
		provider: "Ollama",
		vars: ["AI_HEALER_OLLAMA_URL", "AI_HEALER_OLLAMA_KEY", "OLLAMA_API_KEY"],
	},
];

function reportCredentials(env: Record<string, string | undefined>): boolean {
	console.log("\nCredentials in environment:");
	let anySet = false;

	for (const group of CREDENTIAL_GROUPS) {
		const present = group.vars.filter((v) => env[v]);
		if (present.length > 0) {
			anySet = true;
			ok(`${group.provider} ${DIM}(${present.join(", ")})${RESET}`);
		} else {
			console.log(
				`  ${DIM}· ${group.provider} (${group.vars.join(" / ")}) - not set${RESET}`,
			);
		}
	}

	return anySet;
}

async function liveCheck(offline: boolean): Promise<boolean> {
	console.log("\nProvider selection:");

	let provider: ReturnType<typeof createProviderFromEnv>;
	try {
		provider = createProviderFromEnv();
	} catch (error) {
		bad(error instanceof Error ? error.message : String(error));
		return false;
	}

	ok(`Auto-selected ${provider.name}`);

	if (offline) {
		warn("Skipping live connectivity check (--offline).");
		return true;
	}

	console.log("\nLive connectivity check:");
	try {
		const result = await provider.heal(
			{ example: "string" },
			"400 Bad Request: ai-fetch-healer doctor connectivity check",
		);
		if (result?.rule && typeof result.rule.action === "string") {
			ok(`${provider.name} responded with a valid healing rule.`);
			return true;
		}
		warn(
			`${provider.name} responded, but the reply was not a recognizable healing rule.`,
		);
		return true;
	} catch (error) {
		bad(error instanceof Error ? error.message : String(error));
		console.log(
			`\n  ${DIM}The credential is present but the call failed - check the key value, the model id, and network access.${RESET}`,
		);
		return false;
	}
}

async function runDoctor(offline: boolean): Promise<number> {
	const proc = getProcess();
	const env = proc?.env ?? {};

	console.log("ai-fetch-healer doctor");

	const anySet = reportCredentials(env);
	if (!anySet) {
		console.log(
			`\n${RED}No provider credentials found.${RESET} Set one of the variables above - ` +
				"see https://github.com/Bannawat01/ai-fetch-healer#quick-start.",
		);
		return 1;
	}

	const healthy = await liveCheck(offline);

	console.log("");
	if (healthy) {
		console.log(`${GREEN}Setup looks healthy.${RESET}`);
		return 0;
	}
	console.log(`${RED}Setup has problems - see above.${RESET}`);
	return 1;
}

function printUsage(): void {
	console.log(
		[
			"ai-fetch-healer <command>",
			"",
			"Commands:",
			"  doctor            Check provider credentials and connectivity",
			"",
			"Options (doctor):",
			"  --offline         Skip the live heal() call; only inspect env vars",
			"  -h, --help        Show this help",
		].join("\n"),
	);
}

async function main(): Promise<void> {
	const proc = getProcess();
	const args = proc?.argv?.slice(2) ?? [];
	const command = args[0];

	if (!command || command === "-h" || command === "--help") {
		printUsage();
		return;
	}

	if (command === "doctor") {
		const offline = args.includes("--offline");
		const code = await runDoctor(offline);
		if (proc?.exit) {
			proc.exit(code);
		} else if (proc) {
			proc.exitCode = code;
		}
		return;
	}

	console.log(`Unknown command: ${command}\n`);
	printUsage();
	const p = getProcess();
	if (p?.exit) p.exit(1);
}

main().catch((error) => {
	console.error(error);
	const p = getProcess();
	if (p?.exit) p.exit(1);
});
