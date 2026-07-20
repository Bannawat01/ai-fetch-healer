import { createHealedFetch, OpenRouterProvider } from "ai-fetch-healer";
import { type NextRequest, NextResponse } from "next/server";

// Module-level singleton, same reasoning as the Express example: keep the
// rule cache alive across requests instead of rebuilding it every time.
const provider = new OpenRouterProvider();
const healedFetch = createHealedFetch(provider);

// app/api/orders/route.ts
export async function POST(req: NextRequest) {
	const payload = await req.json();

	const upstreamResponse = await healedFetch(
		"https://upstream.example.com/v1/orders",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		},
	);

	const body = await upstreamResponse.json();
	return NextResponse.json(body, { status: upstreamResponse.status });
}
