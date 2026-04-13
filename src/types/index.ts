export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface HealingRule {
  action: 'MAP_FIELDS' | 'CHANGE_TYPE';
  mapping?: Record<string, string>;
  suggestion?: string;
}

export type JsonPayload = { [key: string]: JsonValue };

export interface LLMResponse {
  healedPayload: JsonPayload;
  rule: HealingRule;
}

export interface ILLMProvider {
  name: string;
  heal(
    schema: JsonValue,
    errorDetails: string, 
    targetSchema?: JsonValue
  ): Promise<LLMResponse>;
}