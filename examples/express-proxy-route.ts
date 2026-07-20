import { createHealedFetch, GroqProvider } from "ai-fetch-healer";
import type { Request, Response } from "express";

// Create once per process - a fresh healedFetch per request would defeat the
// built-in rule cache, forcing an LLM call on every single request.
const provider = new GroqProvider();
const healedFetch = createHealedFetch(provider);

export async function proxyCreateUser(req: Request, res: Response) {
	const upstreamResponse = await healedFetch(
		"https://upstream.example.com/v1/users",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(req.body),
		},
	);

	const body = await upstreamResponse.text();
	res.status(upstreamResponse.status).send(body);
}

// In your Express app:
// app.post("/users", proxyCreateUser);
