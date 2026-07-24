import {
	createHealedFetch,
	createHealedRouteHandler,
	OpenRouterProvider,
} from "ai-fetch-healer";

// Module-level singleton, same reasoning as the Express example: keep the
// rule cache alive across requests instead of rebuilding it every time.
const provider = new OpenRouterProvider();
const healedFetch = createHealedFetch(provider);

// app/api/orders/route.ts
// createHealedRouteHandler targets the standard Web Request/Response API
// (what Next.js App Router, Bun, Deno, and Cloudflare Workers all speak),
// so no next.js import is needed here at all.
export const POST = createHealedRouteHandler({
	target: "https://upstream.example.com/v1/orders",
	healedFetch,
});
