import type { ILLMProvider } from "../types";
import { createHealedFetchFromEnv } from "./from-env";
import { createHealedFetch, type HealerConfig } from "./interceptor";

/** Returned by installGlobalHealing - call it to restore the original global fetch. */
export type UninstallGlobalHealing = () => void;

interface InstallState {
	original: typeof fetch;
}

// Tracks a single active installation so a second install() is a no-op instead
// of wrapping an already-wrapped fetch (which would double every request).
let activeInstall: InstallState | null = null;

export interface InstallGlobalHealingOptions extends HealerConfig {
	/** Use this provider instead of auto-detecting one from the environment. */
	provider?: ILLMProvider;
}

/**
 * Monkey-patches `globalThis.fetch` so every fetch in the process is healed,
 * with no call-site changes. This is deliberately opt-in and explicit - it is
 * never triggered by importing the package - because replacing the global
 * fetch is a process-wide side effect.
 *
 * Returns an `uninstall()` that restores the original fetch; always call it in
 * tests and hot-reload paths. Calling install twice without uninstalling is a
 * no-op (returns an uninstaller for the existing installation) - it never
 * stacks wrappers.
 *
 * ```ts
 * import { installGlobalHealing } from "ai-fetch-healer";
 * const uninstall = installGlobalHealing(); // reads whichever provider key is set
 * // ... every fetch() is now healed ...
 * uninstall();
 * ```
 */
export function installGlobalHealing(
	options: InstallGlobalHealingOptions = {},
): UninstallGlobalHealing {
	const { provider, ...config } = options;

	if (activeInstall) {
		const state = activeInstall;
		return () => uninstall(state);
	}

	const original = globalThis.fetch;

	const healedFetch = provider
		? createHealedFetch(provider, { ...config, fetchFunction: original })
		: createHealedFetchFromEnv({ ...config, fetchFunction: original });

	globalThis.fetch = healedFetch as typeof fetch;

	const state: InstallState = { original };
	activeInstall = state;

	return () => uninstall(state);
}

function uninstall(state: InstallState): void {
	// Only restore if this installation is still the active one and nothing
	// else replaced fetch in the meantime - avoids clobbering a later install.
	if (activeInstall === state) {
		globalThis.fetch = state.original;
		activeInstall = null;
	}
}
