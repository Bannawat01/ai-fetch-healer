import { createHealedFetchFromEnv } from "ai-fetch-healer";

// Auto-detects your provider from whichever key is set (OpenRouter/Groq/
// Gemini/Ollama) - no provider import needed. Want to pick one explicitly
// instead? `import { createHealedFetch, OpenRouterProvider } from "ai-fetch-healer"`
// and call `createHealedFetch(new OpenRouterProvider())`.
const healedFetch = createHealedFetchFromEnv();

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
