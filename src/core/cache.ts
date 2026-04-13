import type { HealingRule, JsonValue } from '../types';

export class HeuristicCache {
  private cache: Map<string, HealingRule>;
  private readonly maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }


  generateKey(method: string, url: string, maskedPayload: JsonValue): string {
    const payloadSignature = JSON.stringify(maskedPayload);
    
    return `${method.toUpperCase()}:${url}:${payloadSignature}`;
  }

  set(key: string, rule: HealingRule): void {
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, rule);
  }

  get(key: string): HealingRule | null {
    return this.cache.get(key) || null;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}