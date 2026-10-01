import 'server-only';
import { z } from 'zod';
import type { LLMProvider, ModelRequest } from '@/lib/ai/contracts';
import { AgentError } from './errors';

const DEFAULT_MODEL = '@cf/zai-org/glm-4.7-flash';
const accountPattern = /^[a-f0-9]{32}$/i;
const modelPattern = /^@cf\/[a-z0-9-]+\/[a-z0-9._-]+$/i;
const envelopeSchema = z.object({ success: z.boolean(), result: z.unknown().optional() }).passthrough();

export function cloudflareConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

export function configuredProvider(): LLMProvider {
  if (cloudflareConfigured()) {
    try { return new CloudflareProvider(); }
    catch { console.error(JSON.stringify({ event: 'model_configuration_unavailable' })); }
  }
  return { generateStructured: async () => { throw new AgentError('MODEL_UNAVAILABLE', 'Model assistance is unavailable; catalog search can continue.'); } };
}

function responseContent(result: unknown): unknown {
  if (!result || typeof result !== 'object') return undefined;
  const value = result as Record<string, unknown>;
  if (value.response !== undefined) return value.response;
  const choices = value.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    return first?.message?.content;
  }
  return undefined;
}

function parseJson(content: unknown): unknown {
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string') throw new AgentError('MODEL_OUTPUT_INVALID', 'The assistant returned an invalid response. Please try again.');
  const trimmed = content.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  try { return JSON.parse(match?.[1] ?? trimmed); }
  catch { throw new AgentError('MODEL_OUTPUT_INVALID', 'The assistant returned an invalid response. Please try again.'); }
}

export class CloudflareProvider implements LLMProvider {
  private readonly endpoint: string;
  constructor(
    accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
    private readonly token = process.env.CLOUDFLARE_API_TOKEN,
    readonly model = process.env.CLOUDFLARE_AI_MODEL || DEFAULT_MODEL,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!accountId || !token) throw new AgentError('CONFIGURATION_MISSING', 'The assistant needs server configuration before it can run.');
    if (!accountPattern.test(accountId) || !modelPattern.test(model)) throw new AgentError('CONFIGURATION_INVALID', 'The assistant configuration is invalid.');
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  }

  async generateStructured<T extends z.ZodType>(request: ModelRequest<T>): Promise<z.infer<T>> {
    const instructions = `${request.system}\nReturn exactly one JSON object matching this schema. Do not include markdown or explanatory text.\nSchema: ${JSON.stringify(z.toJSONSchema(request.schema))}`;
    const deadline = AbortSignal.timeout(request.timeoutMs);
    let lastError: AgentError | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: request.input + (attempt ? '\nYour previous answer was invalid. Return a complete JSON object only.' : '') },
          ], max_completion_tokens: Math.max(request.maxOutputTokens, 600), chat_template_kwargs: { enable_thinking: false }, stream: false }),
          signal: deadline,
          cache: 'no-store',
        });
        if (response.status === 401 || response.status === 403) throw new AgentError('MODEL_AUTH_FAILURE', 'AI authentication failed. Please contact the site administrator.');
        if (response.status === 429) throw new AgentError('MODEL_RATE_LIMIT', 'AI assistance has reached its usage limit. Please try again later.');
        if (!response.ok) throw new AgentError('MODEL_UNAVAILABLE', 'AI assistance is temporarily unavailable. You can use standard search.');
        const envelope = envelopeSchema.safeParse(await response.json());
        if (!envelope.success || !envelope.data.success) throw new AgentError('MODEL_UNAVAILABLE', 'AI assistance is temporarily unavailable. You can use standard search.');
        const parsed = request.schema.safeParse(parseJson(responseContent(envelope.data.result)));
        if (parsed.success) return parsed.data;
        throw new AgentError('MODEL_OUTPUT_INVALID', 'The assistant returned an invalid response. Please try again.');
      } catch (error) {
        const failure = error instanceof AgentError ? error
          : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? new AgentError('MODEL_TIMEOUT', 'AI assistance took too long. Please try again.')
            : new AgentError('MODEL_UNAVAILABLE', 'AI assistance is temporarily unavailable. You can use standard search.');
        if (failure.code !== 'MODEL_OUTPUT_INVALID' || attempt === 1) throw failure;
        lastError = failure;
      }
    }
    throw lastError;
  }
}
