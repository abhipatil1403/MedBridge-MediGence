import type { z } from 'zod';

export interface ModelRequest<T extends z.ZodType> {
  purpose: 'plan' | 'observe' | 'synthesis';
  system: string;
  input: string;
  schema: T;
  maxOutputTokens: number;
  timeoutMs: number;
}

/** Provider-neutral, validated structured output. A provider can add streaming later. */
export interface LLMProvider {
  generateStructured<T extends z.ZodType>(request: ModelRequest<T>): Promise<z.infer<T>>;
}
