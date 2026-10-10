import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.MEDBRIDGE_PACKAGE_ASSISTANT_LIVE!=='1')throw new Error('Opt in with MEDBRIDGE_PACKAGE_ASSISTANT_LIVE=1. Uses existing published packages and a disposable patient.');
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'https://medbridge-medigence.vercel.app';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options);
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const catalog=await db.from('packages').select('id,name,estimated_min,estimated_max,currency');assert.equal(catalog.error,null);assert.equal(catalog.data.length,7);
let userId,session,conversationId,passes=0;
function check(ok,label){assert.ok(ok,label);console.log(`PASS ${++passes}: ${label}`);}
try{
 const email=`medbridge-package-assistant-${randomUUID()}@example.invalid`,password=randomUUID();
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);userId=created.data.user.id;
 const login=await db.auth.signInWithPassword({email,password});assert.equal(login.error,null);
 session=login.data.session;
 async function turn(content,continued=true){
  const response=await fetch(origin+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${login.data.session.access_token}`},body:JSON.stringify({content,displayCurrency:'INR',...(continued&&conversationId?{conversationId}:{})}),signal:AbortSignal.timeout(125000)});
  const result=await response.json();assert.equal(response.status,200,`${content}: ${result.code??''} ${result.error??''}`);
  if(result.status==='failed')console.log(JSON.stringify({event:'package_assistant_incomplete',state:result.activity?.state,findingCount:result.findings?.length??0,failedTools:result.tasks?.filter(t=>t.status==='failed').map(t=>({tool:t.tool,code:t.errorCode}))}));
  assert.notEqual(result.status,'failed',content+' must complete or ask for clarification');
  const count=result.summary.match(/I found (\d+) catalog records? matching/);
  if(count)check(Number(count[1])===new Set(result.findings.map(f=>f.provenance.recordId)).size,'discovery summary counts unique displayed records');
  if(continued){check(!conversationId||conversationId===result.conversationId,'conversation identifier persists');conversationId=result.conversationId;}
  const packages=(result.findings??[]).filter(f=>f.kind==='packages');
  check(packages.every(f=>catalog.data.some(p=>p.id===f.provenance.recordId)&&f.provenance.sourceKind==='external'),'package findings are actual published canonical references');
  check(packages.every(f=>{const p=catalog.data.find(p=>p.id===f.provenance.recordId);return f.facts.listedPrice===p.estimated_min&&f.facts.listedPriceMax===p.estimated_max&&f.facts.currency===p.currency;}),'Assistant preserves original package amount, range and currency');
  console.log(JSON.stringify({turn:content,status:result.status,agent:result.agent,names:packages.map(f=>f.title),summary:result.summary,question:result.question,modelCode:result.diagnostics?.modelPlanError}));
  return result;
 }
 const first=await turn('Show me health check packages in Mumbai.');
 check(first.findings.filter(f=>f.kind==='packages').length===2,'Mumbai discovery returns the two sourced packages');
 await turn('Which one is cheaper?');
 const second=await turn('Tell me more about the second one.');check(second.findings.filter(f=>f.kind==='packages').length===1,'second displayed package resolves to one real entity');
 const accommodation=await turn('Does it include accommodation?');check(/conditional|not confirmed|not (?:provided|published)|confirm/i.test(accommodation.summary),'accommodation reply preserves incomplete or conditional evidence');
 const comparison=await turn('Compare it with the first one.');check(comparison.type==='comparison'&&comparison.findings.filter(f=>f.kind==='packages').length===2,'first-versus-selected comparison retains both canonical packages');
 check(/USD/.test(comparison.summary)&&comparison.summary.includes('1,445')&&comparison.summary.includes('260'),'pair summary retains both original published prices');
 check(comparison.findings.some(f=>f.facts.accommodationStatus==='conditional')&&comparison.findings.some(f=>f.facts.accommodationStatus==='not confirmed')&&comparison.findings.every(f=>!f.facts.durationDays),'comparison preserves asymmetric service evidence and unpublished duration');
 const missing=await turn('Show me knee replacement packages in Mumbai.',false);check(!missing.findings.some(f=>f.kind==='packages'&&f.facts.treatmentSlug==='health-checkup'),'unsupported surgical request does not claim health screening is an exact match');
 const unrelated=await turn('Tell me more about the second one.',false);check(!unrelated.findings.length&&unrelated.status==='awaiting_user_input','ordinal without history asks for context instead of guessing');
 await turn('I need knee replacement in Mumbai under $6000 with accommodation.',false);
 const transfer=await turn('Show me health check packages with airport transfer.',false);
 check(transfer.findings.filter(f=>f.kind==='packages').every(f=>f.requirementEvaluation?.overallStatus!=='fully_satisfies'&&f.facts.transferStatus==='not confirmed'),'unknown transfer never becomes an included or fully satisfied match');
 const requirements=await turn('Show me health check packages in Mumbai under $6000 with accommodation.',false);
 const evaluated=requirements.findings.filter(f=>f.kind==='packages');
 check(evaluated.length===2&&evaluated.every(f=>f.requirementEvaluation?.overallStatus!=='fully_satisfies'),'two real Mumbai packages do not fully satisfy unconfirmed or conditional accommodation');
 check(evaluated.every(f=>['procedure','location','budget','accommodation'].every(type=>f.requirementEvaluation.evaluations.some(e=>e.type===type))),'treatment, location, budget and accommodation are evaluated independently on existing packages');
 check(evaluated.every(f=>['procedure','location','budget'].every(type=>f.requirementEvaluation.evaluations.some(e=>e.type===type&&e.status==='exact'))),'published treatment, Mumbai location and listed-price budget match independently');
 check(evaluated.every(f=>f.requirementEvaluation.evaluations.some(e=>e.type==='accommodation'&&['unknown','incomplete'].includes(e.status))),'conditional or unconfirmed accommodation remains an independent unmet evidence gate');
 await turn('Find health check packages under $6000.',false);
 await turn('Show me Hip Replacement packages in Mumbai.',false);
 console.log(`${passes} real production package Assistant checks passed.`);
}finally{if(userId){
 // Revoke before banning: GoTrue rejects sign-out of an already banned actor.
 const revoked=session?await admin.auth.admin.signOut(session.access_token,'global'):null;
 const cleanup=await Promise.allSettled([
  admin.from('portal_accounts').upsert({user_id:userId,active:false}),
  admin.from('conversations').update({status:'archived'}).eq('owner_id',userId),
  admin.auth.admin.updateUserById(userId,{ban_duration:'876000h'})
 ]);
 assert.ok(!revoked?.error&&cleanup.every(r=>r.status==='fulfilled'&&!r.value.error),'Disposable package QA cleanup incomplete.');
 console.log('Disposable package patient signed out, disabled and banned; private conversations archived and immutable runtime history retained.');
}}
