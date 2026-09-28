import { expect, it, vi } from 'vitest';
import { z } from 'zod';
vi.mock('server-only', () => ({}));

import { CloudflareProvider } from '@/lib/agents/cloudflare-provider';

it.skipIf(!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)('validates a real Cloudflare model response', async () => {
  const provider = new CloudflareProvider();
  const response = await provider.generateStructured({
    purpose: 'plan', system: 'Reply with the requested JSON object.', input: 'Set answer to ready.',
    schema: z.object({ answer: z.literal('ready') }).strict(), maxOutputTokens: 200, timeoutMs: 45000,
  });
  expect(response).toEqual({ answer: 'ready' });
}, 100000);
