import { createHealedFetch, OpenRouterProvider } from "ai-fetch-healer";

// Reads AI_HEALER_OPENROUTER_KEY / OPENROUTER_API_KEY from process.env.
const provider = new OpenRouterProvider();
const healedFetch = createHealedFetch(provider);

async function main() {
	const response = await healedFetch("https://api.example.com/users", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		// Suppose the upstream API actually expects `full_name`, not `user_name` -
		// the initial request fails 400/422, healedFetch asks the provider for a
		// mapping rule, applies it, and retries once.
		body: JSON.stringify({ user_name: "Ada" }),
	});

	console.log(response.status, await response.text());
}

main();
