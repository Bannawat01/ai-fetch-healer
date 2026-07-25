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

/** Provider choices for `init`: env var to write and where to get the key. */
const INIT_PROVIDERS: Record<
	string,
	{ label: string; envVar: string; value?: string; keyUrl?: string }
> = {
	openrouter: {
		label: "OpenRouter",
		envVar: "AI_HEALER_OPENROUTER_KEY",
		keyUrl: "https://openrouter.ai/keys",
	},
	openai: {
		label: "OpenAI",
		envVar: "AI_HEALER_OPENAI_KEY",
		keyUrl: "https://platform.openai.com/api-keys",
	},
	anthropic: {
		label: "Anthropic",
		envVar: "AI_HEALER_ANTHROPIC_KEY",
		keyUrl: "https://console.anthropic.com/settings/keys",
	},
	groq: {
		label: "Groq",
		envVar: "AI_HEALER_GROQ_KEY",
		keyUrl: "https://console.groq.com/keys",
	},
	gemini: {
		label: "Gemini",
		envVar: "GEMINI_API_KEY",
		keyUrl: "https://aistudio.google.com/apikey",
	},
	ollama: {
		label: "Ollama (local, no key)",
		envVar: "AI_HEALER_OLLAMA_URL",
		value: "http://localhost:11434",
	},
};

/** Append the provider's env line to .env if that var isn't already defined. */
async function writeEnvLine(
	envPath: string,
	envVar: string,
	value: string,
	force: boolean,
): Promise<"written" | "exists"> {
	const fs = await import("node:fs/promises");

	let existing = "";
	try {
		existing = await fs.readFile(envPath, "utf8");
	} catch {
		// No .env yet - we'll create it.
	}

	const isDefinition = (line: string) => line.trim().startsWith(`${envVar}=`);
	const alreadyDefined = existing.split("\n").some(isDefinition);

	if (alreadyDefined && !force) {
		return "exists";
	}

	if (alreadyDefined) {
		// --force: replace the existing definition in place, keep the rest.
		const replaced = existing
			.split("\n")
			.map((line) => (isDefinition(line) ? `${envVar}=${value}` : line))
			.join("\n");
		await fs.writeFile(envPath, replaced, "utf8");
		return "written";
	}

	const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
	const block = `${prefix}# added by \`ai-fetch-healer init\`\n${envVar}=${value}\n`;
	await fs.writeFile(envPath, existing + block, "utf8");
	return "written";
}

function printSnippet(): void {
	console.log("\nAdd this to your code:");
	console.log(
		`${DIM}  import { createHealedFetchFromEnv } from "ai-fetch-healer";\n` +
			`  const healedFetch = createHealedFetchFromEnv(); // reads the key you just set\n` +
			`  // ...then use healedFetch exactly like fetch()${RESET}`,
	);
	console.log(
		`\n${DIM}  No key yet? HeuristicHealer heals field-casing mismatches for free:\n` +
			`  import { createHealedFetch, HeuristicHealer } from "ai-fetch-healer";\n` +
			`  const healedFetch = createHealedFetch(new HeuristicHealer());${RESET}`,
	);
}

async function runInit(
	provider: string | undefined,
	force: boolean,
): Promise<number> {
	console.log("ai-fetch-healer init");

	const key = provider?.toLowerCase();
	const choice = key ? INIT_PROVIDERS[key] : undefined;

	if (!choice) {
		console.log(
			`\n${RED}Pick a provider:${RESET} ai-fetch-healer init --provider <name>\n` +
				`  Available: ${Object.keys(INIT_PROVIDERS).join(", ")}`,
		);
		return 1;
	}

	const proc = getProcess();
	const cwd =
		(globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ??
		".";
	const envPath = `${cwd}/.env`;

	const value = choice.value ?? "";
	let result: "written" | "exists";
	try {
		result = await writeEnvLine(envPath, choice.envVar, value, force);
	} catch (error) {
		bad(error instanceof Error ? error.message : String(error));
		return 1;
	}

	if (result === "exists") {
		warn(
			`${choice.envVar} is already set in .env - left untouched.` +
				(force ? "" : " (use --force to overwrite intentionally)"),
		);
	} else {
		ok(`Wrote ${choice.envVar} to .env`);
		if (!choice.value) {
			console.log(
				`  ${DIM}Now paste your ${choice.label} key after the "=" (get one at ${choice.keyUrl}).${RESET}`,
			);
		}
	}

	if (proc?.env && !proc.env[choice.envVar] && !choice.value) {
		warn(".env is gitignored by convention - make sure yours is too.");
	}

	printSnippet();
	console.log(
		`\nNext: ${DIM}npx ai-fetch-healer doctor${RESET} to verify the setup.`,
	);
	return 0;
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
			"  init              Scaffold a .env for a provider and print a snippet",
			"  doctor            Check provider credentials and connectivity",
			"",
			"Options (init):",
			"  --provider <name> openrouter | openai | anthropic | groq | gemini | ollama",
			"  --force           Overwrite the env var if it's already in .env",
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

	function finish(code: number): void {
		if (proc?.exit) {
			proc.exit(code);
		} else if (proc) {
			proc.exitCode = code;
		}
	}

	if (command === "init") {
		const flagIdx = args.indexOf("--provider");
		const provider =
			flagIdx >= 0
				? args[flagIdx + 1]
				: args[1] && !args[1].startsWith("-")
					? args[1]
					: undefined;
		const force = args.includes("--force");
		finish(await runInit(provider, force));
		return;
	}

	if (command === "doctor") {
		const offline = args.includes("--offline");
		finish(await runDoctor(offline));
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
