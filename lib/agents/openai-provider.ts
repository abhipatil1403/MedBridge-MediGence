import 'server-only';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { LLMProvider, ModelRequest } from '@/lib/ai/contracts';
import { AgentError } from './errors';

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  constructor(private readonly model: string, apiKey: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 1 });
  }

  async generateStructured<T extends z.ZodType>(request: ModelRequest<T>): Promise<z.infer<T>> {
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: request.system,
        input: request.input,
        max_output_tokens: request.maxOutputTokens,
        text: { format: zodTextFormat(request.schema, request.purpose) },
      }, { timeout: request.timeoutMs });
      if (!response.output_parsed) throw new AgentError('MODEL_OUTPUT_INVALID', 'I could not prepare a reliable plan. Please try again.');
      return request.schema.parse(response.output_parsed);
    } catch (error) {
      if (error instanceof AgentError) throw error;
      if (error instanceof z.ZodError) throw new AgentError('MODEL_OUTPUT_INVALID', 'The assistant returned an invalid response. Please try again.', error);
      const timeout = error instanceof Error && /timeout|abort/i.test(error.message);
      throw new AgentError(timeout ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE',
        timeout ? 'The assistant took too long. Please try again.' : 'The assistant is temporarily unavailable.', error);
    }
  }
}
