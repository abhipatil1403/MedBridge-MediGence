import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
vi.mock('server-only',()=>({}));
import { CloudflareProvider } from '@/lib/agents/cloudflare-provider';
import { defaultPolicy, executionOutcome, failureCategory, inquiryAttention, operationsCommandSchema, requestEventSchema, retryAllowed, retryDelayMs } from '@/lib/operations/contracts';
import { probeReadiness, ReadinessCache } from '@/lib/operations/health';
const id='11111111-1111-4111-8111-111111111111';
describe('operational reliability',()=>{
 it.each(['Tool call limit reached; some requested work remains incomplete.','Execution safety limit reached; some work remains incomplete.','Planning safety limit reached; further work could not be completed.'])('retains an actual partial execution limit: %s',warning=>{
  expect(executionOutcome({status:'completed',tasks:[],activity:{state:'partially_completed',warnings:[warning],steps:[]}})).toEqual({outcome:'partially_completed',category:'execution_limit'});
 });
 it('retains failed task categories when useful results complete',()=>{
  expect(executionOutcome({status:'completed',tasks:[{errorCode:'TOOL_INPUT_INVALID'}]})).toEqual({outcome:'partially_completed',category:'tool_validation'});
 });
 it('does not infer an execution limit from incomplete catalog evidence or clarification',()=>{
  expect(executionOutcome({status:'completed',tasks:[],activity:{state:'partially_completed',warnings:['The model reported remaining catalog work.'],steps:[]}})).toEqual({outcome:'partially_completed',category:undefined});
  expect(executionOutcome({status:'awaiting_user_input',tasks:[]})).toEqual({outcome:'partially_completed',category:undefined});
 });
 it('only reports readiness from a real successful probe, without external claims',async()=>{
  const r=await probeReadiness(async()=>({storage:true}),true);
  expect(r).toMatchObject({status:'ready',database:'available',storage:'private_bucket_present',ai:'configured_not_probed',externalDelivery:'not_configured',externalMonitoring:'not_configured',attempts:1});
 });
 it('bounds timeouts, actually aborts and does not claim storage availability',async()=>{
  const signals:AbortSignal[]=[];const r=await probeReadiness(signal=>{signals.push(signal);return new Promise(()=>{});},false,5);
  expect(r).toMatchObject({status:'not_ready',database:'timeout',storage:'not_measured',attempts:2});expect(signals.every(s=>s.aborted)).toBe(true);
 });
 it('retries transient database reads only twice, never permission failures',async()=>{
  const transient=vi.fn(async()=>{throw {code:'08006',message:'private host/password'};});
  expect(await probeReadiness(transient,false)).toMatchObject({attempts:2,category:'database_unavailable'});expect(transient).toHaveBeenCalledTimes(2);
  const permanent=vi.fn(async()=>{throw {code:'42501'};});expect(await probeReadiness(permanent,false)).toMatchObject({attempts:1,category:'permission'});
 });
 it('shares concurrent probes and expires the actual result',async()=>{
  let now=0;const cache=new ReadinessCache(()=>now);const probe=vi.fn(()=>probeReadiness(async()=>({storage:false}),false));
  const values=await Promise.all(Array.from({length:20},()=>cache.get(probe)));expect(probe).toHaveBeenCalledTimes(1);expect(new Set(values).size).toBe(1);
  now=29000;await cache.get(probe);expect(probe).toHaveBeenCalledTimes(1);now=30001;await cache.get(probe);expect(probe).toHaveBeenCalledTimes(2);
 });
 it('measures UTC activity and policy boundary without changing state',()=>{
  const row={status:'waiting_provider',assigned_to:id,last_operational_activity_at:'2026-10-01T00:00:00Z'};
  expect(inquiryAttention(row,Date.parse('2026-10-04T00:00:00Z'))).toMatchObject({kind:'provider',thresholdHours:72,overdue:true});expect(row.status).toBe('waiting_provider');
  expect(inquiryAttention({...row,status:'closed'},Date.now())).toBeNull();expect(inquiryAttention({...row,last_operational_activity_at:'invalid'},Date.now())).toBeNull();
 });
 it('requires explicit confirmation and limits operational policy',()=>{
  expect(operationsCommandSchema.safeParse({action:'operations_policy',input:{operationId:id,confirmed:true,...defaultPolicy,patientHours:1441}}).success).toBe(false);
  expect(operationsCommandSchema.safeParse({action:'operations_reconcile',input:{operationId:id,eventId:id,confirmed:false}}).success).toBe(false);
 });
 it('bounds reconciliation and categorizes permanent denials',()=>{
  expect(retryAllowed('timeout',2,1000,999)).toBe(false);expect(retryAllowed('timeout',2,1000,1000)).toBe(true);expect(retryAllowed('timeout',3,0,1000)).toBe(false);
  for(const c of ['permission','consent','validation','configuration'] as const)expect(retryAllowed(c,0,0,1)).toBe(false);
  expect([1,2,3,20].map(retryDelayMs)).toEqual([30000,60000,120000,120000]);
 });
 it.each([['MODEL_RATE_LIMIT','rate_limit'],['MODEL_TIMEOUT','timeout'],['BUDGET_EXCEEDED','execution_limit'],['TOOL_INPUT_INVALID','tool_validation'],['TOOL_SCOPE_DENIED','permission'],['CONSENT_REQUIRED','consent'],['DATABASE_FAILURE','database_unavailable']])('classifies %s safely',(code,category)=>expect(failureCategory(code)).toBe(category));
 it('rejects PHI, stacks, raw payloads and out-of-range telemetry',()=>{
  const e={correlationId:id,kind:'ai',action:'execute',outcome:'failed',category:'timeout',durationMs:1,retryCount:0,modelFailures:[],recovered:false};
  for(const field of ['prompt','body','document','token','stack','patientName'])expect(requestEventSchema.safeParse({...e,[field]:'secret'}).success).toBe(false);
  expect(requestEventSchema.safeParse({...e,retryCount:33}).success).toBe(false);
 });
 it('observes actual malformed-output retry without copying prompts or model content',async()=>{
  const observer=vi.fn();const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({success:true,result:{response:'patient private invalid'}}))).mockResolvedValueOnce(new Response(JSON.stringify({success:true,result:{response:'{"ok":true}'}})));
  const p=new CloudflareProvider('0123456789abcdef0123456789abcdef','secret',undefined,fetcher,observer);
  await p.generateStructured({purpose:'plan',system:'private',input:'patient document',schema:z.object({ok:z.boolean()}),maxOutputTokens:200,timeoutMs:1000});
  expect(observer.mock.calls.map(([e])=>e.attempt)).toEqual([0,1]);expect(observer.mock.calls[0][0].category).toBe('validation');expect(JSON.stringify(observer.mock.calls)).not.toMatch(/patient|document|secret|private/);
 });
});
