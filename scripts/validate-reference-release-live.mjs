import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Ordinary anonymous catalog reads; the optional assistant gate uses a new,
// isolated patient account, never the human Admin's session or privileges.
const options={auth:{persistSession:false,autoRefreshToken:false}};
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'https://medbridge-medigence.vercel.app';
function checked(result){assert.equal(result.error,null);return result.data;}
const counts={countries:1,cities:5,specialties:3,treatments:2,hospitals:5,doctors:5,packages:0,price_estimates:0};
const catalog={};
for(const [table,count] of Object.entries(counts)){
  const fields=table==='hospitals'?'id,name,slug,source_kind,city_id,verification_status':table==='doctors'?'id,name,slug,source_kind,consultation_mode,experience_years,verification_status':'id,source_kind';
  catalog[table]=checked(await db.from(table).select(fields));
  assert.equal(catalog[table].length,count,table);assert.ok(catalog[table].every(row=>row.source_kind==='external'),table+' real references only');
  console.log(`PASS ${table}: ${count} sourced published records`);
}
const doctorLinks=checked(await db.from('hospital_doctors').select('doctor_id,hospital_id'));
assert.ok(catalog.doctors.every(row=>row.consultation_mode===null&&row.experience_years===null&&doctorLinks.some(link=>link.doctor_id===row.id&&catalog.hospitals.some(h=>h.id===link.hospital_id))),'unknown doctor facts and exact hospital relationship');
assert.ok([...catalog.hospitals,...catalog.doctors].every(row=>row.verification_status!=='verified'),'publication must not invent clinical verification');
const provenance=checked(await db.rpc('public_catalog_provenance',{}));
const entityIds=new Set([...catalog.hospitals,...catalog.doctors].map(row=>row.id));
assert.ok([...entityIds].every(id=>provenance.some(p=>p.id===id&&p.origin==='admin_reference')));
let claims=0;
for(const hospital of catalog.hospitals){
  const sources=checked(await db.rpc('public_reference_claims',{p_kind:'hospital',p_id:hospital.id}));
  assert.ok(sources.length>10,hospital.name+' provenance');claims+=sources.length;
  assert.ok(sources.every(row=>row.sourceUrl?.startsWith('https://')&&Date.parse(row.collectedAt)>0&&['approved','verified'].includes(row.status)&&row.freshness==='fresh'));
  assert.ok(sources.every(row=>!['evidence_summary','supported_value','reviewed_by','created_by'].some(key=>key in row)));
  const profile=checked(await db.rpc('public_provider_profile',{p_hospital_id:hospital.id}));
  assert.equal(profile.accreditations.length,0);assert.equal(profile.internationalServices.length,0);
  const response=await fetch(`${origin}/hospitals/${hospital.slug}`);assert.equal(response.status,200);
  assert.ok((await response.text()).includes(hospital.name),hospital.name+' rendered content, not only an HTTP 200 stream');
  console.log(`PASS ${hospital.name}: ${sources.length} public sourced claims and canonical page`);
}
assert.equal(claims,146,'complete starter field coverage');
for(const doctor of catalog.doctors){const response=await fetch(`${origin}/doctors/${doctor.slug}`);assert.equal(response.status,200);assert.ok((await response.text()).includes(doctor.name),doctor.name+' rendered content');}
console.log('PASS 146 sourced claims; five canonical doctor pages; unknown prices, packages and verification preserved');

if(process.env.MEDBRIDGE_REFERENCE_ASSISTANT_LIVE==='1'){
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,options);
  const email=`medbridge-reference-release-${randomUUID()}@example.invalid`,password=randomUUID();
  let userId;
  try{
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'QA ONLY reference release patient'}});
    assert.equal(created.error,null);userId=created.data.user.id;
    const login=await db.auth.signInWithPassword({email,password});assert.equal(login.error,null);
    let conversationId;
    const allowed=new Set(Object.values(catalog).flat().map(row=>row.id));
    const turns=['Find knee replacement hospitals in Mumbai.','Tell me more about the first one.','Show me its packages.','Tell me more about the second package.','Compare the hospitals.','Which package includes accommodation?','What information is missing?','Compare Mumbai and Pune.','Find a hospital in Pune for knee replacement.','Show me doctors associated with this hospital.'];
    for(const content of turns){
      const response=await fetch(`${origin}/api/assistant`,{method:'POST',headers:{Authorization:`Bearer ${login.data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({content,...(conversationId?{conversationId}:{})}),signal:AbortSignal.timeout(125000)});
      const result=await response.json();assert.equal(response.status,200,result.error??content);assert.ok(result.conversationId);conversationId=result.conversationId;
      assert.ok((result.findings??[]).every(row=>row.provenance?.sourceKind!=='synthetic'&&allowed.has(row.provenance?.recordId)),content+' canonical finding boundary');
      assert.equal((result.findings??[]).filter(row=>row.kind==='packages').length,0,'no invented packages');
      if(content.startsWith('Find knee'))assert.ok(result.findings.some(row=>row.title.includes('Kokilaben')));
      if(content.startsWith('Find a hospital in Pune'))assert.ok(result.findings.some(row=>row.title.includes('Deenanath')));
      console.log(JSON.stringify({turn:content,status:result.status,agent:result.agent,findings:result.findings?.map(row=>row.title),summary:result.summary}));
    }
    console.log('PASS ten production assistant turns using live configuration and published canonical references');
  }finally{if(userId){const disabled=await admin.auth.admin.updateUserById(userId,{ban_duration:'876000h'});assert.equal(disabled.error,null);console.log('Isolated QA patient disabled; immutable runtime audit retained.');}}
}
