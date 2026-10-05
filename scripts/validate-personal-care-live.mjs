import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(process.env.MEDBRIDGE_PERSONAL_LIVE!=='1')throw new Error('Set MEDBRIDGE_PERSONAL_LIVE=1 for the authorized disposable patient integration gate.');
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'http://127.0.0.1:3000';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const users=[];let passes=0,cookie='';
function check(value,label){assert.ok(value,label);console.log(`PASS ${++passes}: ${label}`);}
async function actor(){const email=`medbridge-personal-qa-${randomUUID()}@example.invalid`,password=randomUUID();
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'QA ONLY personal care integration'}});assert.equal(created.error,null);users.push(created.data.user.id);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options),login=await db.auth.signInWithPassword({email,password});assert.equal(login.error,null);
 return {id:created.data.user.id,token:login.data.session.access_token,db};
}
async function api(path,input,user,guest=false){const response=await fetch(origin+path,{method:input?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(user?{Authorization:`Bearer ${user.token}`} : {}),...(guest&&cookie?{Cookie:cookie}:{})},...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(125000)});
 if(guest&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 const data=await response.json();return {status:response.status,data};
}
function good(result){assert.equal(result.status,200,result.data.error);return result.data;}
try{
 check((await api('/api/account')).status===401,'anonymous account access requires authentication');
 check((await api('/api/recovery')).status===401,'anonymous recovery access requires authentication');
 const quote=good(await api('/api/currency?from=USD&to=INR')).quote;
 check(quote&&quote.rate>0&&quote.source==='https://www.exchangerate-api.com'&&Date.parse(quote.updatedAt)>0,'real cached/live exchange-rate source and timestamp');
 check(!('rates' in quote),'currency endpoint returns one indicative pair, not the provider feed');
 check((await api('/api/currency?from=USD&to=XXX')).status===400,'unsupported currency rejected');
 const owner=await actor(),other=await actor();check(owner.id!==other.id,'real isolated Supabase identities sign in');
 good(await api('/api/account',{action:'save_profile',input:{display_name:'QA ONLY coordination',phone:'',country:'India',city:'Mumbai',locale:'hi',currency:'INR',inApp:true}},owner));
 let profile=good(await api('/api/account',undefined,owner)).profile;
 check(profile.display_name==='QA ONLY coordination'&&profile.currency==='INR'&&profile.locale==='hi','profile and language/currency preferences survive another request');
 good(await api('/api/account',{action:'save_preferences',input:{locale:'mr',currency:'AED'}},owner));profile=good(await api('/api/account',undefined,owner)).profile;
 check(profile.locale==='mr'&&profile.currency==='AED','account language/currency changes persist in Supabase');
 const hospitals=await anon.from('hospitals').select('id,name,slug').order('name'),doctors=await anon.from('doctors').select('id,name,slug').order('name');assert.equal(hospitals.error,null);assert.equal(doctors.error,null);
 check(hospitals.data.length===5&&doctors.data.length===5,'production retains the five real published hospital and doctor records');
 const hospital=hospitals.data.find(h=>h.name.includes('Kokilaben')),doctor=doctors.data[0];assert.ok(hospital);
 for(const [kind,record] of [['hospital',hospital],['doctor',doctor]])good(await api('/api/account',{action:'save_item',input:{kind,recordId:record.id,saved:true}},owner));
 let saved=good(await api('/api/account?section=saved',undefined,owner)).items;
 check(saved.length===2&&saved.every(i=>i.record?.name),'saved hospital and doctor reload with published names');
 check(good(await api('/api/account?section=saved',undefined,other)).items.length===0,'another account cannot read those saved records');
 const direct=await other.db.from('saved_items').select('id').eq('owner_id',owner.id);check(!direct.error&&direct.data.length===0,'direct RLS reads cannot bypass saved-item ownership');
 good(await api('/api/account',{action:'save_item',input:{kind:'doctor',recordId:doctor.id,saved:false}},owner));
 check(good(await api('/api/account?section=saved',undefined,owner)).items.length===1,'saved-item removal persists');
 const unknown=await api('/api/account',{action:'save_item',input:{kind:'package',recordId:randomUUID(),saved:true}},owner);check(unknown.status!==200,'unpublished/nonexistent package cannot be saved');
 good(await api('/api/account',{action:'save_search',input:{query:'Knee replacement in Mumbai'}},owner));
 check(good(await api('/api/account?section=searches',undefined,owner)).items.length===1,'recent search persists');
 const journey=good(await api('/api/recovery',{action:'create_journey',title:'QA ONLY non-clinical coordination',hospitalId:hospital.id},owner));
 const task=good(await api('/api/recovery',{action:'add_task',journeyId:journey.id,title:'QA ONLY prepare questions',dueAt:new Date(Date.now()+86400000).toISOString()},owner));
 good(await api('/api/recovery',{action:'add_event',journeyId:journey.id,title:'QA ONLY coordination note',occurredAt:new Date().toISOString()},owner));
 let recovery=good(await api('/api/recovery',undefined,owner));
 check(recovery.journeys.some(j=>j.id===journey.id&&j.hospital_id===hospital.id),'recovery journey and published provider association persist');
 check(recovery.tasks.some(t=>t.id===task.id&&t.source==='user_created'&&t.status==='open'),'non-clinical task and due date persist');
 check(recovery.events.some(e=>e.title==='QA ONLY coordination note'),'user-created milestone persists');
 check(good(await api('/api/recovery',undefined,other)).journeys.length===0,'recovery journey isolated from another account');
 const changed=await api('/api/recovery',{action:'complete_task',journeyId:journey.id,taskId:task.id,completed:true},other);check(changed.status!==200,'another account cannot complete the owner task');
 good(await api('/api/recovery',{action:'complete_task',journeyId:journey.id,taskId:task.id,completed:true},owner));
 recovery=good(await api('/api/recovery',undefined,owner));check(recovery.tasks.some(t=>t.id===task.id&&t.status==='completed'&&t.completed_at),'task completion survives reload');
 check(recovery.events.some(e=>e.event_type==='task_completed'),'actual completion creates a persistent timeline event');
 const noConsent=await api('/api/recovery',{action:'create_support',journeyId:journey.id,title:'QA ONLY coordination gate',description:'QA ONLY integration check. No patient information.',consent:false},owner);check(noConsent.status!==200,'missing Support consent rejected');
 const support=good(await api('/api/recovery',{action:'create_support',journeyId:journey.id,title:'QA ONLY coordination gate',description:'QA ONLY integration check. No patient information.',consent:true},owner));
 const queue=await admin.from('support_cases').select('id,status').eq('id',support.id);assert.equal(queue.error,null);check(queue.data.length===1,'consented request creates the actual case used by the Support queue');
 recovery=good(await api('/api/recovery',undefined,owner));check(recovery.support.some(s=>s.id===support.id)&&recovery.links.some(l=>l.support_case_id===support.id),'actual Support case is linked to the private journey');
 const notifications=good(await api('/api/account?section=notifications',undefined,owner)).items;
 check(notifications.some(n=>n.resource_type==='recovery_journey'),'existing owner notifications record the recovery reminder');
 const staffNotifications=await admin.from('portal_notifications').select('id,user_id').eq('resource_type','support_case').eq('resource_id',support.id).neq('user_id',owner.id);
 assert.equal(staffNotifications.error,null);check(staffNotifications.data.length>0,'the actual Support queue notifies its staff through existing notifications');
 const coordination=good(await api('/api/assistant',{content:'Show me my upcoming recovery tasks.'},owner));
 check(coordination.coordination?.journeys.some(j=>j.id===journey.id),'existing registered assistant tool reads the owner recovery context');
 check(coordination.coordination.savedProviders.some(s=>s.name===hospital.name),'saved providers resolve to canonical public names and links');
 check(!JSON.stringify(coordination.coordination).includes('storage_path'),'assistant coordination has no raw document paths');
 const boundary=good(await api('/api/assistant',{content:'Is my recovery medically normal?',conversationId:coordination.conversationId},owner));
 check(!boundary.coordination&&/cannot diagnose/i.test(boundary.summary)&&boundary.nextSteps.some(step=>/medical professional/i.test(step)),'medical recovery question preserves the clinical boundary');
 const guest=good(await api('/api/assistant/public',{content:'Find knee replacement hospitals in Mumbai.',page:{kind:'hospital',slug:hospital.slug}},undefined,true));
 check(guest.findings.some(f=>f.title.includes('Kokilaben'))&&guest.findings.every(f=>f.provenance.sourceKind!=='synthetic'),'visitor assistant executes real published catalog tools');
 check(cookie.startsWith('medbridge_visitor='),'opaque visitor cookie issued without anonymous auth account');
 let history=good(await api('/api/assistant/public',undefined,undefined,true));check(history.messages.some(m=>m.metadata?.response?.findings?.length),'visitor history retains actual structured results');
 await new Promise(resolve=>setTimeout(resolve,3100));
 const detail=good(await api('/api/assistant/public',{content:'Tell me more about the first one.',conversationId:guest.conversationId},undefined,true));
 check(detail.conversationId===guest.conversationId&&detail.findings.some(f=>f.title.includes('Kokilaben')),'visitor reference resolution keeps the same published record and conversation');
 await new Promise(resolve=>setTimeout(resolve,3100));
 const adopted=good(await api('/api/assistant/public',{action:'adopt',content:'Keep this conversation in my account'},owner,true));check(adopted.conversationId===guest.conversationId,'explicit import reuses the real conversation identifier');
 const privateHistory=good(await api(`/api/assistant/public?conversationId=${adopted.conversationId}`,undefined,owner));check(privateHistory.messages.length>=history.messages.length,'imported messages persist in the existing account history');
 check((await api(`/api/assistant/public?conversationId=${adopted.conversationId}`,undefined,other)).status!==200,'another account cannot read imported history');
 console.log(`${passes} live personal care/API checks passed. Positive package/price checks remain isolated database QA; no production catalog fixtures were inserted.`);
}finally{
 const closed=await admin.from('support_cases').update({status:'closed',consent_revoked_at:new Date().toISOString()}).in('patient_id',users);assert.equal(closed.error,null);
 for(const id of users){const result=await admin.auth.admin.updateUserById(id,{ban_duration:'876000h'});assert.equal(result.error,null);}
 console.log('Disposable QA Support cases closed and patient accounts disabled; existing immutable audit history retained. No human account changed.');
}
