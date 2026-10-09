/** Explicit private QA identities, real HTTP/Auth, read-only data + an actual health probe.
 * Creates no production provider, inquiry, incident, response or delivery fixture.
 * Immutable audit references require disabling identities rather than deleting them.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.MEDBRIDGE_OPERATIONS_LIVE!=='1')throw new Error('Explicit operational live-test opt-in required');
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'https://medbridge-medigence.vercel.app';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options);
const actors=[];let passes=0;
function good(result){assert.equal(result.error,null,'Authenticated database operation failed');return result.data;}
function check(ok,label){assert.ok(ok,label);console.log(`PASS ${++passes}: ${label}`);}
async function actor(role){const email=`operations-qa-${randomUUID()}@qa.invalid`,password=randomUUID();const user=good(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);const item={id:user.id,role,db};actors.push(item);
 item.session=good(await db.auth.signInWithPassword({email,password})).session;
 if(role!=='patient')good(await admin.from('staff_roles').insert({user_id:user.id,role,active:true}));return item;
}
async function api(a,path,input){const start=performance.now();const r=await fetch(origin+path,{method:input?'POST':'GET',headers:{'Content-Type':'application/json',...(a?{Authorization:`Bearer ${a.session.access_token}`}:{})},...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(20000)});return {status:r.status,data:await r.json(),ms:Math.round(performance.now()-start),cache:r.headers.get('cache-control')};}
try{
 check((await api(null,'/api/health')).status===200,'public liveness responds');
 check((await api(null,'/api/health/ready')).status===401,'readiness details require authentication');
 check((await api(null,'/api/portals?portal=admin&resource=operations_overview')).status===401,'anonymous Operations access is denied');
 const patient=await actor('patient'),support=await actor('support_agent'),operator=await actor('admin');
 check((await api(patient,'/api/health/ready')).status===403,'patient cannot read readiness details');
 check((await api(support,'/api/health/ready?portal=support')).status===403,'Support cannot read privileged readiness');
 check((await api(patient,'/api/portals?portal=provider&resource=operations_overview')).status===403,'ordinary provider-portal access does not grant Operations');
 check((await api(support,'/api/portals?portal=support&resource=operations_overview')).status===403,'Support cannot read the global operational aggregate');
 const overview=await api(operator,'/api/portals?portal=admin&resource=operations_overview');check(overview.status===200,'authenticated Admin reads real operational state');
 check(overview.cache==='private, no-store','operational responses are private and not cached');
 check(overview.data.providers.connected===0&&overview.data.providers.responseObserved===0,'production still has no connected participating provider or response');
 check(overview.data.pilotRows.every(p=>!p.acceptanceRecorded),'local QA has not become production pilot acceptance');
 check(!/description|storage_path|signedUrl|patient_id|email|prompt|Authorization|stack/.test(JSON.stringify(overview.data)),'operational projection has no patient payload or sensitive diagnostics');
 const ready=await api(operator,'/api/health/ready?portal=admin');check(ready.status===200&&ready.data.database==='available','real authenticated database readiness probe succeeds');
 check(ready.data.ai==='configured_not_probed'&&ready.data.externalMonitoring==='not_configured'&&ready.data.externalDelivery==='not_configured','configuration is distinguished from measured external availability');
 const input={action:'operations_health_check',input:{operationId:randomUUID(),confirmed:true}};
 const first=await api(operator,'/api/portals?portal=admin',input);check(first.status===200&&first.data.status==='ready','Admin health command records an actual measured result');
 const second=await api(operator,'/api/portals?portal=admin',input);check(second.status===200&&second.data.checkedAt===first.data.checkedAt,'retry returns the original verified check without a duplicate audit');
 const probes=good(await admin.from('audit_events').select('id').eq('actor_id',operator.id).eq('event_name','operations.command.health_check').eq('metadata->>operationId',input.input.operationId));check(probes.length===1,'one measured health audit persisted');
 const refreshed=await api(operator,'/api/portals?portal=admin&resource=operations_overview');check(refreshed.data.health.checkedAt===first.data.checkedAt&&!!refreshed.data.lastSuccessfulCheck,'verified history and last successful time are visible');
 const scope=await api(support,'/api/portals?portal=support&resource=operations_inquiries&filter=all');check(scope.status===200&&scope.data.rows.length<=50,'Support receives a bounded authorized inquiry queue');
 check(scope.data.rows.every(row=>!['title','description','patient_id','storage_path','email','body'].some(key=>Object.hasOwn(row,key))),'attention rows do not contain patient messages or identity');
 check((await operator.db.rpc('operations_record_health',{p_actor:operator.id,p_operation:randomUUID(),p_result:ready.data})).error,'browser role cannot forge measured health');
 check((await api(operator,'/api/portals?portal=admin',{action:'save_setting',input:{key:'operations.health',value:{status:'ready'}}})).status!==200,'generic settings cannot overwrite verified health');
 check((await api(patient,'/api/portals',{action:'operations_incident_create',input:{operationId:randomUUID(),confirmed:true,category:'ai',severity:'high'}})).status===403,'patients cannot create privileged incidents');
 check((await patient.db.from('operational_incidents').select('*')).data?.length===0,'incident RLS excludes patients');
 console.log(JSON.stringify({measuredHealthMs:first.data.durationMs,overviewHttpMs:overview.ms,readinessHttpMs:ready.ms,telemetryWindow:overview.data.windowStart,providersConnected:overview.data.providers.connected}));
}finally{
 for(const a of actors){good(await admin.from('staff_roles').update({active:false}).eq('user_id',a.id));good(await admin.from('portal_accounts').upsert({user_id:a.id,active:false}));if(a.session)await admin.auth.admin.signOut(a.session.access_token,'global');good(await admin.auth.admin.updateUserById(a.id,{ban_duration:'876000h'}));}
 console.log('QA roles disabled, accounts banned and sessions revoked. No public provider fixtures created.');
}
console.log(`Operational production live: ${passes} gates passed.`);
