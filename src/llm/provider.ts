import type { ILLMProvider, LLMResponse } from "../types";

export abstract class BaseLLMProvider implements ILLMProvider {
	abstract name: string;
	protected apiKey: string;
	protected timeoutMs: number;

	constructor(apiKey: string, timeoutMs: number = 10000) {
		this.apiKey = apiKey;
		this.timeoutMs = timeoutMs;
	}

	protected createTimeoutController(): {
		controller: AbortController;
		timeoutId: ReturnType<typeof setTimeout>;
	} {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
		return { controller, timeoutId };
	}

	abstract heal(schema: unknown, errorDetails: string): Promise<LLMResponse>;
}
