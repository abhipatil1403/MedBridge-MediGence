import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
vi.mock('server-only', () => ({}));

import { CloudflareProvider } from '@/lib/agents/cloudflare-provider';

const account = '0123456789abcdef0123456789abcdef';
const schema = z.object({ answer: z.string() }).strict();
const request = { purpose: 'plan' as const, system: 'Return an answer.', input: 'Hello', schema, maxOutputTokens: 200, timeoutMs: 1000 };
const envelope = (result: unknown, status = 200) => new Response(JSON.stringify({ success: true, result }), { status });

describe('Cloudflare Workers AI provider', () => {
  it('calls the server-side REST endpoint and validates structured output', async () => {
    const fetcher = vi.fn(async () => envelope({ response: '{"answer":"Hello"}' }));
    const provider = new CloudflareProvider(account, 'private-token', '@cf/zai-org/glm-4.7-flash', fetcher as typeof fetch);
    await expect(provider.generateStructured(request)).resolves.toEqual({ answer: 'Hello' });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/zai-org/glm-4.7-flash`);
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer private-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(options.body)).messages).toHaveLength(2);
  });

  it('requires account and token before making a request', () => {
    expect(() => new CloudflareProvider('', '', undefined, vi.fn() as typeof fetch)).toThrow();
    expect(() => new CloudflareProvider('wrong', 'token', undefined, vi.fn() as typeof fetch)).toThrow();
  });

  it('retries malformed output once, then fails safely', async () => {
    const fetcher = vi.fn(async () => envelope({ response: 'not json' }));
    const provider = new CloudflareProvider(account, 'private-token', undefined, fetcher as typeof fetch);
    await expect(provider.generateStructured(request)).rejects.toMatchObject({ code: 'MODEL_OUTPUT_INVALID' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps rate limits, authentication, and timeout without exposing credentials', async () => {
    for (const [status, code] of [[429, 'MODEL_RATE_LIMIT'], [401, 'MODEL_AUTH_FAILURE']] as const) {
      const fetcher = vi.fn(async () => new Response('{}', { status }));
      await expect(new CloudflareProvider(account, 'private-token', undefined, fetcher as typeof fetch).generateStructured(request))
        .rejects.toMatchObject({ code });
    }
    const timeout = vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    await expect(new CloudflareProvider(account, 'private-token', undefined, timeout as typeof fetch).generateStructured(request))
      .rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
  });
});
