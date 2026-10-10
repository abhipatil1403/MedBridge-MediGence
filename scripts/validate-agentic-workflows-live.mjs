/** Read-only catalog/assistant gate using disposable private identities.
 * MEDBRIDGE_WORKFLOW_LIVE_TEST=1 node --env-file=.env.local scripts/validate-agentic-workflows-live.mjs [--browser]
 * Never creates providers, inquiries, responses or documents.
 */
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
if(process.env.MEDBRIDGE_WORKFLOW_LIVE_TEST!=='1')throw new Error('Explicit disposable workflow test opt-in required.');
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'https://medbridge-medigence.vercel.app';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options),actors=[];
let passed=0,broker;
const check=(ok,label)=>{assert.ok(ok,label);console.log(`PASS ${++passed}: ${label}`);};
function good(result){assert.equal(result.error,null,'Database gate failed');return result.data;}
async function identity(){const password=randomBytes(32).toString('base64url');const created=good(await admin.auth.admin.createUser({email:`workflow-qa-${randomUUID()}@qa.invalid`,password,email_confirm:true}));
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);const actor={id:created.user.id,db};actors.push(actor);
 if(process.env.MEDBRIDGE_WORKFLOW_QA_MANIFEST)writeFileSync(process.env.MEDBRIDGE_WORKFLOW_QA_MANIFEST,JSON.stringify({origin,actors:actors.map(a=>({id:a.id}))},null,2));
 const login=good(await db.auth.signInWithPassword({email:created.user.email,password}));actor.session=login.session;return actor;}
async function api(actor,path,input){const response=await fetch(origin+path,{method:input?'POST':'GET',headers:{'Content-Type':'application/json',...(actor?{Authorization:`Bearer ${actor.session.access_token}`}:{})},...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(125000)});return {status:response.status,data:await response.json()};}
function success(result){assert.equal(result.status,200,result.data.code??result.data.error);return result.data;}
try{
 check((await api(undefined,'/api/assistant')).status===401,'anonymous private assistant access denied');
 const owner=await identity(),other=await identity();
 const hospitals=good(await owner.db.from('hospitals').select('id,name')),packages=good(await owner.db.from('packages').select('id,name'));
 check(hospitals.length>0&&packages.length>0,'existing published real catalog is available');
 const goal='Find hospitals for health checkup in Mumbai, show packages and compare them.';
 const response=success(await api(owner,'/api/assistant',{content:goal}));
 check(response.compoundRequest?.operations.length>=3,'goal uses existing ordered compound operations');
 check(response.tasks.length>=2,'multiple real registered tool tasks executed');
 check(response.findings.length>0&&response.findings.every(f=>f.provenance.sourceKind!=='synthetic'),'response has actual sourced public results');
 check(response.findings.filter(f=>f.kind==='hospitals').every(f=>hospitals.some(h=>h.id===f.provenance.recordId)),'hospital findings identify eligible published records');
 check(response.findings.filter(f=>f.kind==='packages').every(f=>packages.some(p=>p.id===f.provenance.recordId)),'package findings identify eligible published records');
 const run=good(await admin.from('agent_runs').select('metadata').eq('id',response.runId).single());
 check(run.metadata.execution.runId===response.runId&&run.metadata.execution.state===response.activity.state,'authoritative run checkpoint agrees with response activity');
 check(run.metadata.execution.calls.filter(c=>c.status==='completed').every(c=>c.validatedInput&&c.output&&c.endedAt),'completed steps persist validated inputs, outputs and timestamps');
 const history=success(await api(owner,`/api/assistant?conversationId=${response.conversationId}`));
 check(JSON.stringify(history.activity.steps)===JSON.stringify(response.activity.steps),'history progress agrees with original persisted steps');
 check(history.messages.some(m=>m.metadata?.response?.runId===response.runId),'refresh restores sourced final result');
 check(!JSON.stringify(history.activity).includes('validatedInput'),'activity exposes compact status rather than raw tool arguments');
 const before=good(await admin.from('agent_actions').select('id').eq('run_id',response.runId));
 const repeated=success(await api(owner,'/api/assistant',{content:'Resume saved catalog workflow',conversationId:response.conversationId,resumeRunId:response.runId}));
 check(repeated.runId===response.runId,'lost-response recovery returns the already saved run');
 const after=good(await admin.from('agent_actions').select('id').eq('run_id',response.runId));check(after.length===before.length,'duplicate recovery executes no additional tool actions');
 check((await api(other,`/api/assistant?conversationId=${response.conversationId}`)).status===403,'other patient cannot load this conversation');
 check((await api(other,'/api/assistant',{content:'Resume',conversationId:response.conversationId,resumeRunId:response.runId})).status===403,'other patient cannot recover this run');
 const selected=response.findings.find(f=>f.kind==='hospitals')??{title:hospitals[0].name,provenance:{recordId:hospitals[0].id}};
 const preparation=success(await api(owner,'/api/assistant',{content:`Make an inquiry about ${selected.title}`,conversationId:response.conversationId}));
 check(preparation.inquiryPreparation?.state==='review_required'&&preparation.inquiryPreparation.href.includes(selected.provenance.recordId),'natural inquiry intent reads the real selection and offers the existing review form');
 check(preparation.summary.includes('No inquiry has been submitted')&&preparation.activity.state==='waiting_for_input','request remains explicitly awaiting reviewed consent');
 check(good(await owner.db.from('support_cases').select('id').eq('patient_id',owner.id)).length===0,'assistant preparation creates no inquiry or external side effect');
 if(process.argv.includes('--browser')){
  let finish;const done=new Promise(resolve=>{finish=resolve;});
  const paths={assistant:`/assistant?conversation=${response.conversationId}`,start:`/assistant?start=1&q=${encodeURIComponent(goal)}`};
  broker=createServer((request,res)=>{
   if(request.url==='/finish'&&request.method==='POST'){res.writeHead(200).end('QA cleanup started.');finish();return;}
   const path=paths[request.url?.slice(1)];if(!path){res.writeHead(404).end();return;}
   const fragment=new URLSearchParams({access_token:owner.session.access_token,refresh_token:owner.session.refresh_token,token_type:'bearer',type:'signup'});
   res.writeHead(302,{Location:`${origin}/auth/callback?next=${encodeURIComponent(path)}#${fragment}`,'Cache-Control':'no-store'}).end();
  });await new Promise(resolve=>broker.listen(4322,'127.0.0.1',resolve));
  console.log('Disposable assistant browser broker ready at http://127.0.0.1:4322/assistant. Wait for callback completion before reading browser state. POST /finish to clean up.');await done;
 }
 console.log(`${passed} live workflow checks passed. No provider participation or clinical action was tested.`);
}finally{
 if(broker?.listening)await new Promise(resolve=>broker.close(resolve));
 // Revoke sessions before banning the user; GoTrue rejects sign-out of banned actors.
 const revocation=await Promise.allSettled(actors.filter(actor=>actor.session).map(actor=>admin.auth.admin.signOut(actor.session.access_token,'global').then(good)));
 const cleanup=await Promise.allSettled(actors.flatMap(actor=>[
  admin.from('portal_accounts').upsert({user_id:actor.id,active:false}).then(good),
  admin.auth.admin.updateUserById(actor.id,{ban_duration:'876000h'}).then(good),
  admin.from('conversations').update({status:'archived'}).eq('owner_id',actor.id).then(good)]));
 if([...revocation,...cleanup].some(r=>r.status==='rejected'))throw new Error('Disposable QA cleanup incomplete; inspect the configured QA manifest.');
 console.log('Disposable identities disabled, banned and signed out; their private conversations archived.');
}
