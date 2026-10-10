import {randomUUID} from 'node:crypto';
import {z} from 'zod';
export const signals=['application','dependency_probe','storage','ai_configuration','request_failures','workflow_failed','workflow_stalled','documents_blocked','scanner_configuration','incident_unowned','alert_delivery'];
const measurement=z.object({failures:z.number().int().min(0).max(3),successes:z.number().int().min(0).max(2),episode:z.uuid().nullable(),lastNotice:z.number().nonnegative()}).strict();
const alert=z.object({id:z.uuid(),signal:z.enum(signals),event:z.enum(['signal_detected','signal_persists','signal_cleared']),observedAt:z.string().datetime(),state:z.enum(['pending','unknown','accepted','failed','not_configured']),attempts:z.number().int().min(0).max(3),nextAt:z.number().nonnegative(),category:z.enum(['none','timeout_or_network','rate_limit','provider_unavailable','provider_rejected','not_configured']).default('none')}).strict();
export const stateSchema=z.object({version:z.literal(1),target:z.string().regex(/^[a-f0-9]{64}$/),samples:z.partialRecord(z.enum(signals),measurement),alerts:z.array(alert).max(100)}).strict();
export function emptyState(target){return stateSchema.parse({version:1,target,samples:{},alerts:[]});}
/** Three consecutive observations open a signal; two clear it. No automatic incident resolution. */
export function observe(state,observations,now=Date.now()) {
 for(const signal of signals){
  if(typeof observations[signal]!=='boolean'){
   if(state.samples[signal]){state.samples[signal].failures=0;state.samples[signal].successes=0;}
   continue; // unmeasured breaks a streak and is never recovered
  }
  const sample=state.samples[signal]??={failures:0,successes:0,episode:null,lastNotice:0};
  sample.failures=observations[signal]?Math.min(3,sample.failures+1):0;
  sample.successes=observations[signal]?0:Math.min(2,sample.successes+1);
  let event;
  if(sample.failures===3&&!sample.episode){sample.episode=randomUUID();event='signal_detected';}
  else if(sample.failures===3&&sample.episode&&now-sample.lastNotice>=1800000)event='signal_persists';
  else if(sample.successes===2&&sample.episode){sample.episode=null;event='signal_cleared';}
  if(event){
   // Terminal accepted entries can be removed; failed evidence is retained for operator action.
   if(state.alerts.length>=100)state.alerts=state.alerts.filter(a=>a.state!=='accepted');
   if(state.alerts.length>=100)throw new Error('monitor_ledger_full');
   state.alerts.push({id:randomUUID(),signal,event,observedAt:new Date(now).toISOString(),state:'pending',attempts:0,nextAt:now,category:'none'});sample.lastNotice=now;
  }
 }
 return stateSchema.parse(state);
}
export async function deliver(state,config,persist,fetcher=fetch,now=Date.now()) {
 for(const entry of state.alerts){
  if(['accepted','failed'].includes(entry.state)||entry.nextAt>now)continue;
  if(!config.url||!config.token){entry.state='not_configured';entry.category='not_configured';await persist(state);continue;}
  if(entry.attempts>=3){entry.state='failed';await persist(state);continue;}
  entry.attempts++;entry.state='unknown';entry.category='timeout_or_network';entry.nextAt=now+Math.min(120000,30000*2**(entry.attempts-1));
  await persist(state); // write ahead: interrupted requests retain their ID and bounded attempt
  try{
   const response=await fetcher(config.url,{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json','Idempotency-Key':entry.id},body:JSON.stringify({id:entry.id,signal:entry.signal,event:entry.event,observedAt:entry.observedAt,severity:entry.signal==='application'||entry.signal==='dependency_probe'?'high':'medium',action:'Review Admin Operations; assign an authorized owner. Signal clearance does not resolve an incident.'}),signal:AbortSignal.timeout(config.timeoutMs??5000),redirect:'error'});
   await response.body?.cancel(); // never store provider body, URLs or raw diagnostics
   if(response.ok){entry.state='accepted';entry.category='none';} // acceptance is not recipient delivery
   else {entry.category=response.status===429?'rate_limit':response.status>=500?'provider_unavailable':'provider_rejected';if(entry.category==='provider_rejected')entry.state='failed';}
  }catch{entry.category='timeout_or_network';}
  if(entry.state!=='accepted'&&entry.attempts>=3)entry.state='failed';
  await persist(state);
 }
 return state;
}
const probe=z.object({checkedAt:z.string().datetime({offset:true}),storagePrivate:z.boolean(),requestFailures:z.number().int().nonnegative(),failedWorkflows:z.number().int().nonnegative(),stalledWorkflows:z.number().int().nonnegative(),blockedDocuments:z.number().int().nonnegative(),unownedIncidents:z.number().int().nonnegative(),ai:z.enum(['configured_not_probed','not_configured']),scanner:z.enum(['configured_not_verified','not_configured'])}).strict();
export async function collect(origin,token,fetcher=fetch,timeoutMs=5000,now=Date.now()) {
 const request=async(path,headers={})=>fetcher(new URL(path,origin),{headers,signal:AbortSignal.timeout(timeoutMs),redirect:'error',cache:'no-store'});
 const checks=await Promise.allSettled(['/', '/api/health'].map(async path=>{const r=await request(path);await r.body?.cancel();return r.status===200;}));
 const result={application:checks.some(r=>r.status==='rejected'||!r.value),dependency_probe:true};
 if(!token)return result;
 try{
  const r=await request('/api/internal/operations-monitor',{Authorization:`Bearer ${token}`});
  if(!r.ok){await r.body?.cancel();return result;}
  // Bound body size even for an accidental HTML/error response.
  const reader=r.body?.getReader();if(!reader)return result;
  const parts=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096)throw new Error('size');parts.push(value);}}finally{await reader.cancel();}
  const p=probe.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
  if(Math.abs(now-Date.parse(p.checkedAt))>60000)return result;
  Object.assign(result,{dependency_probe:false,storage:!p.storagePrivate,ai_configuration:p.ai==='not_configured',request_failures:p.requestFailures>=3,workflow_failed:p.failedWorkflows>0,workflow_stalled:p.stalledWorkflows>0,documents_blocked:p.blockedDocuments>0,scanner_configuration:p.scanner==='not_configured',incident_unowned:p.unownedIncidents>0});
 }catch{ /* a failed/unparseable probe never fabricates dependent measurements */ }
 return result;
}
