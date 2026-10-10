import 'server-only';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/agents/persistence';
import {cloudflareConfigured} from '@/lib/agents/cloudflare-provider';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const monitorProbeSchema=z.object({checkedAt:z.string().datetime({offset:true}),storagePrivate:z.boolean(),requestFailures:count,failedWorkflows:count,stalledWorkflows:count,blockedDocuments:count,unownedIncidents:count}).strict();
export function monitorAuthorized(received:string|null) {
 const token=process.env.MEDBRIDGE_MONITOR_TOKEN;
 if(process.env.MEDBRIDGE_MONITOR_ENABLED!=='true'||!token||token.length<32||!received)return false;
 const expected=Buffer.from(`Bearer ${token}`),actual=Buffer.from(received);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function monitoringConfiguration() {
 return {dependencyProbe:process.env.MEDBRIDGE_MONITOR_ENABLED==='true'&&Boolean(process.env.MEDBRIDGE_MONITOR_TOKEN?.length&&process.env.MEDBRIDGE_MONITOR_TOKEN.length>=32)?'configured_not_verified':'not_configured',externalMonitoring:'not_verified',externalAlertDelivery:'not_verified',scanner:process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED==='true'&&Boolean(process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN?.length&&process.env.MEDBRIDGE_DOCUMENT_SCANNER_TOKEN.length>=32)?'configured_not_verified':'not_configured'};
}
export async function monitorSnapshot() {
 const db=createAdminClient();
 const {data,error}=await db.rpc('operations_monitor_probe',{}).abortSignal(AbortSignal.timeout(4000));
 if(error)throw new Error('Monitor probe unavailable');
 return {...monitorProbeSchema.parse(data),ai:cloudflareConfigured()?'configured_not_probed':'not_configured',scanner:monitoringConfiguration().scanner};
}
