import { z } from 'zod';
import type { VerificationField } from './schemas';

const rule=z.object({agingAfterDays:z.number().nonnegative(),staleAfterDays:z.number().positive()}).strict().refine(r=>r.staleAfterDays>r.agingAfterDays);
export const freshnessPolicySchema=z.record(z.string(),rule);
export type FreshnessPolicy=z.infer<typeof freshnessPolicySchema>;
/** No universal provider-currentness promise. Operators may configure individual fields. */
export function configuredFreshnessPolicy():FreshnessPolicy {
  try{return freshnessPolicySchema.parse(JSON.parse(process.env.PROVIDER_VERIFICATION_FRESHNESS_POLICY??'{}'));}catch{return {};}
}
export function classifyFreshness(timestamp:string|null|undefined,field:VerificationField| 'report',policy:FreshnessPolicy,now=Date.now()){
  const r=policy[field]??policy.default;
  if(!timestamp||!r||!Number.isFinite(Date.parse(timestamp))||Date.parse(timestamp)>now)return 'unknown' as const;
  const days=(now-Date.parse(timestamp))/86400000;
  return days>=r.staleAfterDays?'stale' as const:days>=r.agingAfterDays?'aging' as const:'current' as const;
}
// Transport deduplication is independent of factual currentness; refresh bypasses it.
export const VERIFICATION_CACHE_MS=60000;
