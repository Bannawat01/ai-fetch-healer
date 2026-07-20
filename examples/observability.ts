import {
	createHealedFetch,
	type HealEvent,
	OpenRouterProvider,
} from "ai-fetch-healer";

// Swap in your structured logger (pino, winston, etc.) instead of console -
// the default logger just forwards to console.log/console.warn.
const structuredLogger = {
	log: (...args: unknown[]) => console.log({ level: "info" }, ...args),
	warn: (...args: unknown[]) => console.warn({ level: "warn" }, ...args),
};

function recordHealMetric(event: HealEvent) {
	// e.g. statsd.increment(`ai_fetch_healer.heal.${event.source}`);
	console.log(`[metrics] healed via ${event.source}: ${event.rule.action}`);
}

function recordHealFailure(error: unknown) {
	// e.g. Sentry.captureException(error);
	console.error("[metrics] heal failed:", error);
}

const provider = new OpenRouterProvider();
const healedFetch = createHealedFetch(provider, {
	logger: structuredLogger,
	onHeal: recordHealMetric,
	onHealFail: recordHealFailure,
});

export { healedFetch };
