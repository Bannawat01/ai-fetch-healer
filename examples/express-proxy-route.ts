import {
	createHealedFetch,
	createHealedProxyMiddleware,
	GroqProvider,
} from "ai-fetch-healer";

// Create once per process - a fresh healedFetch per request would defeat the
// built-in rule cache, forcing an LLM call on every single request.
const provider = new GroqProvider();
const healedFetch = createHealedFetch(provider);

// createHealedProxyMiddleware works with a real Express Request/Response
// without ai-fetch-healer depending on the express package itself - it's
// typed structurally, so your actual req/res just satisfy the shape.
const proxyCreateUser = createHealedProxyMiddleware({
	target: "https://upstream.example.com/v1/users",
	healedFetch,
});

// In your Express app (assumes express.json() ran earlier so req.body is parsed):
// app.post("/users", proxyCreateUser);

export { proxyCreateUser };
