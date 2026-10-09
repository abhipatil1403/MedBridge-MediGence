import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { createAdminClient } from '@/lib/agents/persistence';
import { cloudflareConfigured } from '@/lib/agents/cloudflare-provider';
import { checked } from '@/lib/portals/server';
import { healthResultSchema, requestEventSchema, type RequestEvent } from './contracts';
import { probeReadiness, ReadinessCache } from './health';

const cache = new ReadinessCache();
export function readiness(db: SupabaseClient<Database>, fresh = false) {
  return cache.get(() => probeReadiness(async signal => {
    const { data, error } = await db.rpc('operations_probe', {}).abortSignal(signal);
    if (error) throw { code: error.code === 'P0001' ? 'PERMISSION_DENIED' : error.code || 'DATABASE_FAILURE' };
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.database !== true) throw { code: 'DATABASE_FAILURE' };
    return { storage: data.storage === true };
  }, cloudflareConfigured()), fresh);
}
export async function recordHealth(db: SupabaseClient<Database>, actor: string, operation: string) {
  const result = healthResultSchema.parse(await readiness(db, true));
  return checked(await createAdminClient().rpc('operations_record_health', {p_actor: actor, p_operation: operation, p_result: result as Json}).abortSignal(AbortSignal.timeout(3000)));
}
/** Telemetry never changes an already committed product outcome. No payload/error prose. */
export async function recordRequest(actor: string, event: RequestEvent) {
  try {
    const metadata = requestEventSchema.parse(event);
    const { error } = await createAdminClient().rpc('operations_record_request', {p_actor: actor, p_metadata: metadata as Json}).abortSignal(AbortSignal.timeout(2000));
    if (error) throw new Error('Telemetry unavailable');
  } catch { console.error(JSON.stringify({event: 'operations_telemetry_unavailable'})); }
}
