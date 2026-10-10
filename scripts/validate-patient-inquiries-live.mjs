/** Explicit opt-in, disposable private accounts. Never creates public providers.
 * MEDBRIDGE_INQUIRY_LIVE_TEST=1 node --env-file=.env.local scripts/validate-patient-inquiries-live.mjs [--browser]
 */
import assert from 'node:assert/strict';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {writeFileSync} from 'node:fs';
import { createClient } from '@supabase/supabase-js';
if(process.env.MEDBRIDGE_INQUIRY_LIVE_TEST!=='1')throw new Error('Explicit disposable inquiry test opt-in required.');
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'http://127.0.0.1:3000';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,options);
const actors={},caseIds=[],storedPaths=[];let passed=0,broker;
function check(ok,label){assert.ok(ok,label);console.log(`PASS ${++passed}: ${label}`);}
function good(result){assert.equal(result.status,200,result.data?.error);return result.data;}
function db(result){if(result.error)throw new Error(`Database gate failed: ${result.error.message}`);return result.data;}
async function actor(role){const password=randomBytes(32).toString('base64url');const created=db(await admin.auth.admin.createUser({email:`inquiry-qa-${role}-${randomUUID()}@qa.invalid`,password,email_confirm:true}));
  const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);actors[role]={id:created.user.id,client};
  if(process.env.MEDBRIDGE_INQUIRY_QA_MANIFEST)writeFileSync(process.env.MEDBRIDGE_INQUIRY_QA_MANIFEST,JSON.stringify({origin,createdAt:new Date().toISOString(),actors:Object.entries(actors).map(([role,a])=>({role,id:a.id}))},null,2));
  const login=db(await client.auth.signInWithPassword({email:created.user.email,password}));actors[role].session=login.session;
  if(role==='support'||role==='manager')db(await admin.from('staff_roles').insert({user_id:created.user.id,role:role==='manager'?'support_manager':'support_agent',active:true}));
  return actors[role];
}
async function api(role,path='/api/inquiries',input){const a=actors[role];const response=await fetch(origin+path,{method:input?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(a?{Authorization:`Bearer ${a.session.access_token}`}:{})},...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(125000)});const data=await response.json();return {status:response.status,data};}
function command(action,caseId,extra={},operationId=randomUUID()){return {action,input:{operationId,caseId,...extra}};}
async function upload(role,caseId,operationId,bytes,filename='qa-summary.pdf',extra={}){const form=new FormData();form.set('caseId',caseId);form.set('operationId',operationId);form.set('file',new Blob([bytes],{type:'application/pdf'}),filename);for(const [key,value] of Object.entries(extra))form.set(key,value);const response=await fetch(`${origin}/api/inquiries/documents`,{method:'POST',headers:{Authorization:`Bearer ${actors[role].session.access_token}`},body:form});return {status:response.status,data:await response.json()};}
async function file(role,id){const response=await fetch(`${origin}/api/inquiries/documents?portal=${role==='manager'?'support':role==='support'?'support':'patient'}&id=${id}`,{headers:actors[role]?{Authorization:`Bearer ${actors[role].session.access_token}`}:{}});return {status:response.status,bytes:new Uint8Array(await response.arrayBuffer()),headers:response.headers};}
try{
  check((await api(undefined)).status===401,'anonymous inquiry access requires sign-in');
  await actor('patient');await actor('other');await actor('manager');await actor('support');
  const hospitals=db(await admin.from('hospitals').select('id,slug').eq('publication_status','published').neq('source_kind','synthetic').limit(20));
  let hospital,target,targetFailure;
  for(const candidate of hospitals){const result=await api('patient',`/api/inquiries?kind=hospital&entityId=${candidate.id}`);if(result.status===200){hospital=candidate;target=result.data;break;}targetFailure=result;}
  if(!target){
    if(hospitals.length){const rpc=await actors.patient.client.rpc('inquiry_target',{p_kind:'hospital',p_id:hospitals[0].id});throw new Error(`Published catalog exists, but inquiry target is unavailable. HTTP ${targetFailure?.status}; database code ${rpc.error?.code??'none'}. Verify hosted inquiry migrations and API build.`);}
    throw new Error('No real published hospital is available for the inquiry gate.');
  }
  const create={action:'create',input:{operationId:randomUUID(),entityKind:'hospital',entityId:hospital.id,expectedPublishedRevision:target.publishedRevision,source:'hospital_detail',title:'QA ONLY — hospital coordination validation',objective:'Disposable release validation. No real patient information.',consent:true,reviewed:true}};
  const inquiry=good(await api('patient','/api/inquiries',create));caseIds.push(inquiry.id);check(!!inquiry.id,'published hospital inquiry has a persistent ID');
  check(good(await api('patient','/api/inquiries',create)).id===inquiry.id,'submission retry returns the same inquiry');
  check((await api('patient','/api/inquiries',{...create,input:{...create.input,title:'Different retry'}})).status!==200,'conflicting retry is rejected');
  const packages=db(await admin.from('packages').select('id,slug').eq('publication_status','published').neq('source_kind','synthetic').limit(30));let pkg,packageTarget;
  for(const candidate of packages){const result=await api('patient',`/api/inquiries?kind=package&entityId=${candidate.id}`);if(result.status===200){pkg=candidate;packageTarget=result.data;break;}}
  assert.ok(packageTarget,'A real published package is required.');
  const packageRequest=good(await api('patient','/api/inquiries',{...create,input:{...create.input,operationId:randomUUID(),entityKind:'package',entityId:pkg.id,expectedPublishedRevision:packageTarget.publishedRevision,source:'package_detail',title:'QA ONLY — package coordination validation'}}));caseIds.push(packageRequest.id);check(!!packageRequest.id,'published package inquiry persists separately');
  let context=good(await api('patient',`/api/inquiries?id=${inquiry.id}`));check(context.case.entity_snapshot.id===hospital.id&&context.case.entity_snapshot.publishedRevision===target.publishedRevision,'request preserves exact published entity and revision');
  if(!target.organizationId)check(context.organization===null&&!context.case.share_with_provider&&context.case.provider_responded_at===null,'reference-only listing stays pending coordination without fabricated provider response');
  check((await api('other',`/api/inquiries?id=${inquiry.id}`)).status===403,'another patient cannot read request context');
  check(good(await api('patient')).items.some(item=>item.id===inquiry.id),'My Requests contains actual saved request');
  const supportContext=good(await api('manager',`/api/inquiries?portal=support&id=${inquiry.id}`));check(supportContext.role==='support','authorized Support sees request');
  good(await api('manager','/api/inquiries?portal=support',command('update',inquiry.id,{expectedRevision:supportContext.case.revision,status:'in_progress',assignedTo:actors.support.id,priority:'normal'})));
  const assignmentAudit=db(await admin.from('audit_events').select('new_value,actor_id').eq('entity_id',inquiry.id).eq('event_name','inquiry.support_cases.update'));
  check(assignmentAudit.some(a=>a.new_value?.assignedTo===actors.support.id&&a.actor_id===actors.manager.id),'field-level assignment audit records actual assignee and actor');
  const legacyContext=db(await actors.support.client.rpc('portal_case_context',{p_case_id:inquiry.id}));
  check(legacyContext.patient&&!Object.hasOwn(legacyContext.patient,'email'),'legacy case RPC uses minimal inquiry context without patient email');
  check(good(await api('support',`/api/portals?portal=support&resource=support_cases&assignedTo=me`)).rows.some(row=>row.id===inquiry.id),'assigned request appears in existing Support queue');
  good(await api('support','/api/inquiries?portal=support',command('request_information',inquiry.id,{body:'QA ONLY: please clarify preferred coordination timing.'})));
  good(await api('support','/api/inquiries?portal=support',command('message',inquiry.id,{body:'QA_ONLY_INTERNAL_NOTE_NEVER_PATIENT_VISIBLE',visibility:'internal'})));
  const documentRequest=good(await api('support','/api/inquiries?portal=support',command('request_document',inquiry.id,{title:'QA ONLY coordination summary',purpose:'Validate explicit file permission for this QA inquiry.',visibility:'patient'})));
  context=good(await api('patient',`/api/inquiries?id=${inquiry.id}`));check(context.case.status==='waiting_patient'&&context.documentRequests.some(r=>r.id===documentRequest.id),'patient sees actual outstanding information and document request');
  check(!JSON.stringify(context).includes('QA_ONLY_INTERNAL_NOTE'),'internal notes are absent from patient context');
  const message=command('message',inquiry.id,{body:'QA ONLY: next month is my test coordination timing.',visibility:'patient'});
  const response=good(await api('patient','/api/inquiries',message));check(good(await api('patient','/api/inquiries',message)).id===response.id,'message retry returns the same persisted message');
  check(db(await admin.from('support_case_messages').select('id').eq('case_id',inquiry.id).eq('id',response.id)).length===1,'one message persisted');
  const invalid=await upload('patient',inquiry.id,randomUUID(),new TextEncoder().encode('NOT A PDF'));check(invalid.status!==200,'invalid file signature does not create success');
  const bytes=new TextEncoder().encode('%PDF-1.4\n% QA ONLY disposable nonclinical file\n%%EOF');const uploadOp=randomUUID();
  const uploaded=good(await upload('patient',inquiry.id,uploadOp,bytes,'qa-summary.pdf',{requestId:documentRequest.id})).document;
  storedPaths.push(`${actors.patient.id}/${inquiry.id}/${uploaded.id}.pdf`);check(uploaded.status==='uploaded','private Storage upload and metadata commit succeed');
  check(good(await upload('patient',inquiry.id,uploadOp,bytes,'qa-summary.pdf',{requestId:documentRequest.id})).document.id===uploaded.id,'upload retry reuses one object and metadata record');
  const privateStaff=good(await api('support',`/api/inquiries?portal=support&id=${inquiry.id}`));check(!privateStaff.documents.some(d=>d.id===uploaded.id),'Support cannot see private upload metadata');
  check((await file('support',uploaded.id)).status===403,'Support cannot download before a file grant');
  const privateAudit=db(await actors.support.client.from('audit_events').select('new_value').eq('entity_id',inquiry.id).eq('event_name','inquiry.support_case_documents.insert'));
  check(!privateAudit.some(a=>a.new_value?.rowId===uploaded.id),'private file audit is not a metadata side channel');
  check((await file('other',uploaded.id)).status===403,'another patient cannot download the file');
  good(await api('patient','/api/inquiries',command('share_document',inquiry.id,{documentId:uploaded.id,recipient:'support',purpose:'QA ONLY: review this coordination summary.',confirmed:true})));
  const delivery=await file('support',uploaded.id);check(delivery.status===200&&createHash('sha256').update(delivery.bytes).digest('hex')===createHash('sha256').update(bytes).digest('hex'),'authorized Support downloads exact selected bytes');
  check(delivery.headers.get('cache-control')==='private, no-store'&&delivery.headers.get('x-content-type-options')==='nosniff','private delivery prevents caching and MIME sniffing');
  good(await api('support','/api/inquiries?portal=support',command('review_document',inquiry.id,{documentId:uploaded.id,status:'replacement_requested',note:'QA ONLY: provide a clearer administrative summary.'})));
  const replacement=good(await upload('patient',inquiry.id,randomUUID(),bytes,'qa-replacement.pdf',{requestId:documentRequest.id,replacesId:uploaded.id})).document;storedPaths.push(`${actors.patient.id}/${inquiry.id}/${replacement.id}.pdf`);
  check((await file('support',uploaded.id)).status===403&&(await file('support',replacement.id)).status===403,'replacement revokes old shares and starts private');
  good(await api('patient','/api/inquiries',command('share_document',inquiry.id,{documentId:replacement.id,recipient:'support',purpose:'QA ONLY: review this replacement.',confirmed:true})));
  good(await api('patient','/api/inquiries',command('revoke_document',inquiry.id,{documentId:replacement.id,recipient:'support'})));
  check((await file('support',replacement.id)).status===403,'revocation blocks subsequent authorized-recipient downloads');
  const ai=good(await api('patient','/api/assistant',{content:`Show my inquiry ${inquiry.id}`}));check(ai.inquiries?.selectedId===inquiry.id&&ai.inquiries.requests[0]?.id===inquiry.id,'registered AI tool reads exact owner inquiry');
  check(!JSON.stringify(ai).includes('QA_ONLY_INTERNAL_NOTE')&&!JSON.stringify(ai).includes('storage_path'),'AI output excludes internal notes and storage paths');
  const follow=good(await api('patient','/api/assistant',{content:'What is its status?',conversationId:ai.conversationId}));check(follow.inquiries?.selectedId===inquiry.id,'same-conversation follow-up resolves correct inquiry');
  const otherAI=await api('other','/api/assistant',{content:`Show my inquiry ${inquiry.id}`});check(otherAI.status!==200||!otherAI.data.inquiries?.requests?.length,'other-account AI cannot reveal inquiry');
  check((await api('other',`/api/assistant?conversationId=${ai.conversationId}`)).status!==200,'other user cannot read saved inquiry conversation');
  const journey=good(await api('patient','/api/recovery',{action:'create_journey',title:'QA ONLY inquiry coordination journey'}));context=good(await api('patient',`/api/inquiries?id=${inquiry.id}`));
  const link=command('link_recovery',inquiry.id,{journeyId:journey.id,eventId:context.events[0].id,title:'QA ONLY review inquiry update',confirmed:true});const task=good(await api('patient','/api/inquiries',link));check(good(await api('patient','/api/inquiries',link)).id===task.id,'confirmed Recover link retry creates one task');
  const recovery=good(await api('patient','/api/recovery'));check(recovery.tasks.some(t=>t.id===task.id&&t.support_case_id===inquiry.id&&t.support_event_id===context.events[0].id),'Recover task keeps exact request and real-event links');
  context=good(await api('patient',`/api/inquiries?id=${inquiry.id}`));const unread=context.unread;good(await api('patient','/api/inquiries',command('read_messages',inquiry.id)));check(unread>0&&good(await api('patient',`/api/inquiries?id=${inquiry.id}`)).unread===0,'persisted read receipt clears only actual unread messages');
  const notifications=good(await api('patient','/api/account?section=notifications')).items;check(notifications.some(n=>n.resource_type==='support_case'&&n.resource_id===inquiry.id),'real inquiry update notifications appear in Account');
  check((await api('patient','/api/inquiries',command('provider_response',inquiry.id,{status:'responded',body:'A forged provider response.'}))).status!==200,'patient cannot manufacture provider response');
  if(!target.organizationId)check((await api('patient','/api/inquiries',command('share_provider',inquiry.id,{organizationId:randomUUID(),purpose:'QA invalid organization sharing.',confirmed:true}))).status!==200,'reference-only listing cannot be shared to a fabricated provider organization');
  check((await api('patient','/api/inquiries',command('update',inquiry.id,{expectedRevision:context.case.revision,status:'resolved',resolution:'Patient cannot resolve as Support.'}))).status!==200,'patient cannot impersonate Support status authority');
  const liveReload=good(await api('patient',`/api/inquiries?id=${inquiry.id}`));check(liveReload.events.length>5&&liveReload.messages.some(m=>m.id===response.id),'persisted history survives fresh API requests');
  good(await api('patient','/api/inquiries',command('cancel',packageRequest.id)));check(good(await api('patient',`/api/inquiries?id=${packageRequest.id}`)).case.status==='cancelled','package request cancellation persists');
  const completion=good(await api('patient','/api/inquiries',{...create,input:{...create.input,operationId:randomUUID(),title:'QA ONLY — resolution lifecycle validation'}}));
  let completionContext=good(await api('manager',`/api/inquiries?portal=support&id=${completion.id}`));
  good(await api('manager','/api/inquiries?portal=support',command('update',completion.id,{expectedRevision:completionContext.case.revision,status:'in_progress',assignedTo:actors.support.id})));
  completionContext=good(await api('support',`/api/inquiries?portal=support&id=${completion.id}`));
  good(await api('support','/api/inquiries?portal=support',command('update',completion.id,{expectedRevision:completionContext.case.revision,status:'resolved',resolution:'QA ONLY: administrative validation completed; no clinical decision.'})));
  completionContext=good(await api('patient',`/api/inquiries?id=${completion.id}`));
  check(completionContext.case.status==='resolved'&&completionContext.case.resolution_summary?.includes('QA ONLY'),'actual Support resolution persists with patient-visible summary');
  check((await api('support','/api/inquiries?portal=support',command('update',completion.id,{expectedRevision:completionContext.case.revision,status:'open'}))).status!==200,'ordinary Support cannot reopen a resolved request');
  good(await api('manager','/api/inquiries?portal=support',command('update',completion.id,{expectedRevision:completionContext.case.revision,status:'closed',resolution:'QA ONLY: closed after release validation.'})));
  check(good(await api('patient',`/api/inquiries?id=${completion.id}`)).case.status==='closed','authorized closure is visible after fresh load');
  // Keep a nonterminal private case available for authorized UI validation only.
  if(process.argv.includes('--browser')){
    const uiInput={...create,input:{...create.input,operationId:randomUUID(),title:'QA ONLY — browser inquiry validation'}};const uiCase=good(await api('patient','/api/inquiries',uiInput));caseIds.push(uiCase.id);
    const paths={patient:`/account?section=requests&request=${uiCase.id}`,support:'/support/cases',manager:'/support/cases',create:`/request-assistance?kind=hospital&entityId=${hospital.id}&source=hospital_detail`,package:`/request-assistance?kind=package&entityId=${pkg.id}&source=package_detail`,recover:`/recover?journey=${journey.id}`};
    // Callback fragments are temporary credentials. Wait for the final application
    // route before requesting browser state/screenshots; never record callback URLs.
    let finish;const done=new Promise(resolve=>{finish=resolve;});broker=createServer((request,response)=>{
      if(request.url==='/finish'&&request.method==='POST'){response.writeHead(200);response.end('QA cleanup started.');finish();return;}
      if(request.url==='/info'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({paths,requestId:uiCase.id,origin}));return;}
      const key=request.url?.slice(1);if(!Object.hasOwn(paths,key??'')){response.writeHead(404);response.end();return;}
      const selected=actors[key]??actors.patient;const fragment=new URLSearchParams({access_token:selected.session.access_token,refresh_token:selected.session.refresh_token,token_type:'bearer',type:'signup'});
      response.writeHead(302,{Location:`${origin}/auth/callback?next=${encodeURIComponent(paths[key])}#${fragment}`,'Cache-Control':'no-store'});response.end();
    });await new Promise(resolve=>broker.listen(4321,'127.0.0.1',resolve));console.log('Authorized disposable browser broker ready on http://127.0.0.1:4321. POST /finish to clean up.');await done;await new Promise(resolve=>broker.close(resolve));
  }
  good(await api('patient','/api/inquiries',command('revoke_support',inquiry.id)));check((await api('support',`/api/inquiries?portal=support&id=${inquiry.id}`)).status===403,'withdrawn Support consent blocks future case access');
  check(good(await api('patient',`/api/inquiries?id=${inquiry.id}`)).case.consent_revoked_at!==null,'patient retains revocation history');
  console.log(`${passed} live inquiry checks passed. Provider positive response tests run in isolated local SQL QA; no fake public provider was created.`);
}finally{
  if(broker?.listening)await new Promise(resolve=>broker.close(resolve));
  const ids=Object.values(actors).map(a=>a.id);
  if(ids.length){
    // Disable every QA actor before optional resource cleanup. A failed file cleanup
    // must never leave an elevated test account active.
    const deactivation=await Promise.allSettled([
      ...ids.flatMap(id=>[
        admin.from('portal_accounts').upsert({user_id:id,active:false}).then(db),
        admin.auth.admin.updateUserById(id,{ban_duration:'876000h'}).then(db),
      ]),admin.from('staff_roles').update({active:false}).in('user_id',ids).then(db),
    ]);
    const cases=db(await admin.from('support_cases').select('id').in('patient_id',ids));const ownedCases=cases.map(c=>c.id);
    if(ownedCases.length){
      db(await admin.from('support_cases').update({status:'closed',consent_revoked_at:new Date().toISOString(),share_with_provider:false}).in('id',ownedCases));
      db(await admin.from('support_document_grants').update({revoked_at:new Date().toISOString()}).in('case_id',ownedCases).is('revoked_at',null));
      db(await admin.from('support_case_provider_consents').update({revoked_at:new Date().toISOString()}).in('case_id',ownedCases).is('revoked_at',null));
      const documents=db(await admin.from('support_case_documents').select('id,owner_id,case_id,mime_type').in('case_id',ownedCases));
      const paths=documents.map(d=>{assert.ok(ids.includes(d.owner_id)&&ownedCases.includes(d.case_id));return `${d.owner_id}/${d.case_id}/${d.id}.${d.mime_type==='application/pdf'?'pdf':d.mime_type==='image/png'?'png':'jpg'}`;});
      if(paths.length)db(await admin.storage.from('care-documents').remove(paths));
      if(documents.length)db(await admin.from('support_case_documents').update({status:'withdrawn'}).in('case_id',ownedCases));
      db(await admin.from('portal_notifications').delete().eq('resource_type','support_case').in('resource_id',ownedCases));
    }
    const journeys=db(await admin.from('recovery_journeys').select('id').in('owner_id',ids));if(journeys.length)db(await admin.from('recovery_journeys').update({stage:'archived'}).in('owner_id',ids));
    if(deactivation.some(result=>result.status==='rejected'))throw new Error('One or more QA account deactivations failed; recover cleanup using the optional QA manifest.');
  }
  console.log('Disposable accounts disabled, QA cases closed, file grants revoked and QA Storage objects removed. Immutable audit retained. No public provider or human record changed.');
}
