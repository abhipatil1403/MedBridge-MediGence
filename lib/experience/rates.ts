import 'server-only';
import { createAdminClient } from '@/lib/agents/persistence';
import type { Json } from '@/types/database';
import { parseRateProvider, rateSnapshotSchema, type RateSnapshot } from './currency';

let pending: Promise<RateSnapshot | null> | undefined;
let memory: RateSnapshot | null = null;
let retryAfter = 0;
export async function exchangeRates(): Promise<RateSnapshot | null> {
  if (memory && Date.parse(memory.expiresAt) > Date.now()) return memory;
  if (Date.now() < retryAfter) return memory&&Date.now()-Date.parse(memory.updatedAt)<=7*86400_000?memory:null;
  if (pending) return pending;
  pending = refresh();
  try { return await pending; } finally { pending = undefined; }
}
async function refresh(): Promise<RateSnapshot | null> {
  const db = createAdminClient();
  const cached = await db.rpc('experience_rate_cache', { p_snapshot: null });
  const parsed = rateSnapshotSchema.safeParse(cached.data);
  if (parsed.success) memory = parsed.data;
  if (memory && Date.parse(memory.expiresAt) > Date.now()) return memory;
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Rate provider unavailable');
    const snapshot = parseRateProvider(await response.json());
    const saved = await db.rpc('experience_rate_cache', { p_snapshot: snapshot as unknown as Json });
    if (saved.error) throw new Error('Rate cache unavailable');
    memory = snapshot;
    return snapshot;
  } catch {
    retryAfter = Date.now() + 15 * 60_000;
    // Staleness is returned explicitly by convertPrice, never presented as a live rate.
    return memory && Date.now() - Date.parse(memory.updatedAt) <= 7 * 86400_000 ? memory : null;
  }
}
