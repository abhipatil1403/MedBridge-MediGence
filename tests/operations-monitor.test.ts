import {describe,it,expect,vi,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
vi.mock('server-only',()=>({}));
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/agents/persistence',()=>({createAdminClient:()=>({rpc})}));
vi.mock('@/lib/agents/cloudflare-provider',()=>({cloudflareConfigured:()=>false}));
import {GET} from '@/app/api/internal/operations-monitor/route';
import {monitorAuthorized,monitorProbeSchema,monitoringConfiguration} from '@/lib/operations/monitor';
import {collect,deliver,emptyState,observe,stateSchema,type State} from '../scripts/operations-monitor/engine.mjs';
const target='a'.repeat(64),token='x'.repeat(40),now=Date.now();
const snapshot={checkedAt:new Date(now).toISOString(),storagePrivate:true,requestFailures:0,failedWorkflows:0,stalledWorkflows:0,blockedDocuments:0,unownedIncidents:0};
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function firing(){let s=emptyState(target);for(let i=0;i<3;i++)s=observe(s,{application:true},now+i);return s;}
describe('read-only operational monitor boundary',()=>{
 it('is disabled by default and rejects ordinary sessions without invoking any service RPC',async()=>{
  vi.stubEnv('MEDBRIDGE_MONITOR_ENABLED','false');vi.stubEnv('MEDBRIDGE_MONITOR_TOKEN',token);
  expect((await GET(new NextRequest('https://example.test/api/internal/operations-monitor',{headers:{Authorization:`Bearer ${token}`}}))).status).toBe(401);
  vi.stubEnv('MEDBRIDGE_MONITOR_ENABLED','true');
  for(const input of [null,'Bearer ordinary-user','Bearer '+token+'extra'])expect(monitorAuthorized(input)).toBe(false);
  expect(rpc).not.toHaveBeenCalled();expect(monitoringConfiguration().externalMonitoring).toBe('not_verified');
 });
 it('returns only strict aggregate metadata with private no-store caching',async()=>{
  vi.stubEnv('MEDBRIDGE_MONITOR_ENABLED','true');vi.stubEnv('MEDBRIDGE_MONITOR_TOKEN',token);
  rpc.mockReturnValue({abortSignal:async()=>({data:snapshot,error:null})});
  const r=await GET(new NextRequest('https://example.test/api/internal/operations-monitor',{headers:{Authorization:`Bearer ${token}`}}));
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(await r.json()).toMatchObject({ai:'not_configured',scanner:'not_configured',storagePrivate:true});
  expect(monitorProbeSchema.safeParse({...snapshot,documentPath:'private/path'}).success).toBe(false);
 });
 it('fails closed without leaking raw database error contents',async()=>{
  vi.stubEnv('MEDBRIDGE_MONITOR_ENABLED','true');vi.stubEnv('MEDBRIDGE_MONITOR_TOKEN',token);
  rpc.mockReturnValue({abortSignal:async()=>({error:{message:'patient private token signed-url host'}})});
  const r=await GET(new NextRequest('https://example.test/api/internal/operations-monitor',{headers:{Authorization:`Bearer ${token}`}}));
  expect(r.status).toBe(503);expect(await r.text()).toBe('{"error":"Monitor probe unavailable."}');
 });
});
describe('persistent signal and alert processing',()=>{
 it('ignores transient failures, deduplicates repeated failures and detects prolonged signals',()=>{
  let s=emptyState(target);s=observe(s,{application:true},now);s=observe(s,{application:false},now+1);s=observe(s,{application:true},now+2);expect(s.alerts).toHaveLength(0);
  s=firing();s=observe(s,{application:true},now+1000);expect(s.alerts).toHaveLength(1);
  s=observe(s,{application:true},now+1800002);expect(s.alerts.map(a=>a.event)).toEqual(['signal_detected','signal_persists']);
 });
 it('requires two observed healthy samples and never interprets unmeasured dependencies as recovery',()=>{
  let s=firing();s=observe(s,{},now+10);s=observe(s,{application:false},now+11);expect(s.alerts).toHaveLength(1);
  s=observe(s,{application:false},now+12);expect(s.alerts[1].event).toBe('signal_cleared');
  s=observe(s,{application:false},now+13);expect(s.alerts).toHaveLength(2);
 });
 it('records an absent transport without an invented delivery attempt',async()=>{
  const s=firing(),fetcher=vi.fn(),persist=vi.fn();await deliver(s,{},persist,fetcher,now+3);
  expect(fetcher).not.toHaveBeenCalled();expect(s.alerts[0]).toMatchObject({state:'not_configured',attempts:0});
 });
 it('bounds retries, persists before sending, retains one idempotency key and redacts provider errors',async()=>{
  const s=firing(),persist=vi.fn(),fetcher=vi.fn().mockRejectedValue(new Error('patient secret signed URL'));
  const config={url:'https://approved.example/alerts',token};
  await deliver(s,config,persist,fetcher,now+3);expect(persist.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
  await deliver(s,config,persist,fetcher,now+4);expect(fetcher).toHaveBeenCalledTimes(1);
  await deliver(s,config,persist,fetcher,now+30003);await deliver(s,config,persist,fetcher,now+90003);await deliver(s,config,persist,fetcher,now+300000);
  expect(fetcher).toHaveBeenCalledTimes(3);expect(s.alerts[0]).toMatchObject({state:'failed',attempts:3,category:'timeout_or_network'});
  expect(new Set(fetcher.mock.calls.map(c=>c[1].headers['Idempotency-Key'])).size).toBe(1);
  expect(JSON.stringify(s)).not.toMatch(/patient|secret|URL/);
 });
 it.each([401,403,400])('does not retry a permanent receiver rejection %s',async status=>{
  const s=firing(),fetcher=vi.fn<typeof fetch>(async()=>new Response('sensitive receipt',{status}));await deliver(s,{url:'https://approved.example',token},async()=>{},fetcher,now+3);
  await deliver(s,{url:'https://approved.example',token},async()=>{},fetcher,now+999999);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(s.alerts[0]).toMatchObject({state:'failed',category:'provider_rejected'});
 });
 it('recovers a rate-limited transport, reports accepted instead of delivered and never resends accepted entries',async()=>{
  const s=firing(),fetcher=vi.fn().mockResolvedValueOnce(new Response(null,{status:429})).mockResolvedValue(new Response(null,{status:202}));
  await deliver(s,{url:'https://approved.example',token},async()=>{},fetcher,now+3);
  expect(s.alerts[0]).toMatchObject({state:'unknown',category:'rate_limit'});
  await deliver(s,{url:'https://approved.example',token},async()=>{},fetcher,now+30003);
  await deliver(s,{url:'https://approved.example',token},async()=>{},fetcher,now+999999);
  expect(fetcher).toHaveBeenCalledTimes(2);expect(s.alerts[0].state).toBe('accepted');
 });
 it('keeps persisted state/id across an interrupted request and a genuine filesystem reload',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'medbridge-monitor-'));const file=join(directory,'state.json');
  try{const s=firing(),persist=async (state:State)=>{await writeFile(file,JSON.stringify(state));};
   await expect(deliver(s,{url:'https://approved.example',token},async state=>{await persist(state);throw new Error('interrupted');},vi.fn(),now+3)).rejects.toThrow();
   const restored=stateSchema.parse(JSON.parse(await readFile(file,'utf8')));const key=restored.alerts[0].id;
   expect(restored.alerts[0]).toMatchObject({state:'unknown',attempts:1});
   const fetcher=vi.fn<typeof fetch>(async()=>new Response(null,{status:202}));await deliver(restored,{url:'https://approved.example',token},persist,fetcher,now+30003);
   expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Idempotency-Key')).toBe(key);expect(restored.alerts[0].attempts).toBe(2);
  }finally{await rm(directory,{recursive:true,force:true});}
 });
 it('refuses sensitive or unsupported persisted state and alerts',()=>{
  expect(stateSchema.safeParse({...firing(),document:'private'}).success).toBe(false);
  const s=firing();expect(stateSchema.safeParse({...s,alerts:[{...s.alerts[0],url:'signed'}]}).success).toBe(false);
 });
});
describe('actual HTTP probe failure contract',()=>{
 it('redacts malformed configured endpoints from worker errors before any outbound request',()=>{
  try{execFileSync(process.execPath,['scripts/operations-monitor/worker.mjs','--once'],{env:{...process.env,MEDBRIDGE_MONITOR_ORIGIN:'private-qa-endpoint-marker'},stdio:'pipe'});throw new Error('Worker unexpectedly accepted invalid configuration');}
  catch(error){const stderr=String((error as {stderr?:Buffer}).stderr);expect(stderr).toContain('monitor_https_endpoint_required');expect(stderr).not.toContain('private-qa-endpoint-marker');}
 });
 it('bounds a genuine HTTP alert timeout and keeps an uncertain receipt for the same alert ID',async()=>{
  let requests=0;const server=createServer(req=>{requests++;req.resume();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('server');
  try{const s=firing(),id=s.alerts[0].id;await deliver(s,{url:`http://127.0.0.1:${address.port}`,token,timeoutMs:50},async()=>{},fetch,now+3);
   expect(requests).toBe(1);expect(s.alerts[0]).toMatchObject({id,state:'unknown',attempts:1,category:'timeout_or_network'});
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 it('aborts a stalled external response, reports unavailable, and measures no dependent service',async()=>{
  const server=createServer(()=>{});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('server');
  try{expect(await collect(`http://127.0.0.1:${address.port}`,token,fetch,20)).toEqual({application:true,dependency_probe:true});}
  finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 it('projects only strict fresh measurements and detects failures, scanner configuration and owner gaps',async()=>{
  const p={...snapshot,requestFailures:3,failedWorkflows:1,stalledWorkflows:1,blockedDocuments:1,unownedIncidents:1,ai:'configured_not_probed',scanner:'not_configured'};
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).endsWith('operations-monitor')?Response.json(p):new Response(null,{status:200}));
  expect(await collect('https://example.test',token,fetcher,100,now)).toMatchObject({application:false,dependency_probe:false,request_failures:true,workflow_failed:true,workflow_stalled:true,documents_blocked:true,scanner_configuration:true,incident_unowned:true});
  p.checkedAt=new Date(now-120000).toISOString();expect(await collect('https://example.test',token,fetcher,100,now)).toEqual({application:false,dependency_probe:true});
 });
});
