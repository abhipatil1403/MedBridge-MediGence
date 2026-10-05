import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

// Read the real publication boundary. --local-source-qa uses only the isolated,
// migrated anonymous PostgREST database; no hosted credentials cross it.
const local=process.argv.includes('--local-source-qa');
const db=createClient(local?'http://127.0.0.1:55438':process.env.NEXT_PUBLIC_SUPABASE_URL,local?'local-anonymous-catalog':process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'https://medbridge-medigence.vercel.app';
let passes=0;
function check(value,label){assert.ok(value,label);console.log(`PASS ${++passes}: ${label}`);}
function good(result){assert.equal(result.error,null);return result.data;}
const loader=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
let sources,expected,currencies;
try{({packageSources:sources,sourcedPackages:expected}=await loader.ssrLoadModule('/lib/reference-data/package-starter.ts'));({currencies}=await loader.ssrLoadModule('/lib/experience/preferences.ts'));}finally{await loader.close();}
const packages=good(await db.from('packages').select('*'));
const hospitals=good(await db.from('hospitals').select('id,name,slug'));
const treatments=good(await db.from('treatments').select('id,name,slug'));
check(packages.length===expected.length,'bounded seven legitimate published packages');
check(packages.every(p=>p.source_kind==='external'&&p.publication_status==='published'),'real references only, no QA or first-party mislabel');
check(hospitals.length===5&&treatments.length===3,'five existing hospitals and three reviewed treatment identities');
check(new Set(packages.map(p=>p.hospital_id)).size===2,'two established exact hospital branches represented');
for(const entry of expected){
 const row=packages.find(p=>p.name===entry.name);check(Boolean(row),`${entry.name}: canonical published record`);
 check(row.estimated_min===entry.data.price&&row.estimated_max===entry.data.price&&row.currency===entry.data.currency&&row.price_type===entry.data.priceType,`${entry.name}: exact source payable price, currency and pricing type`);
 check(row.duration_days===null,`${entry.name}: no invented duration`);
 check(treatments.find(t=>t.id===row.treatment_id)?.slug==='health-checkup',`${entry.name}: documented treatment relationship`);
 const hospital=hospitals.find(h=>h.id===row.hospital_id);check(hospital?.name.includes(entry.providerKey.startsWith('deenanath')?'Deenanath':'Kokilaben'),`${entry.name}: canonical provider relationship`);
 const claims=good(await db.rpc('public_reference_claims',{p_kind:'package',p_id:row.id}));
 check(claims.some(c=>c.field==='price')&&claims.every(c=>['approved','verified'].includes(c.status)&&c.sourceUrl===sources[entry.source].url&&Date.parse(c.collectedAt)>0),`${entry.name}: reviewed relevant public sources and checked dates`);
 const evidence=good(await db.rpc('public_package_evidence',{p_id:row.id}));
 check(evidence.some(c=>c.field==='price')&&!/actor_id|reviewed_by|storage_path|evidence_summary/.test(JSON.stringify(evidence)),`${entry.name}: published evidence excludes private fields`);
 const details=good(await db.rpc('public_provider_package_details',{})).find(p=>p.id===row.id);
 check(details?.publishedRevision===1,`${entry.name}: reviewed published revision, not private draft version`);
 check(Boolean(details)&&['transfer','interpreter','hospitalStay','rehabilitation','localTransport','visaAssistance','followUp'].every(k=>details.serviceDetails[k].status==='not_confirmed'),`${entry.name}: missing services stay independently unconfirmed`);
 check(details.serviceDetails.accommodation.status===(entry.key==='kokilaben-platinum-male'?'conditional':'not_confirmed'),`${entry.name}: accommodation conditions preserved`);
 if(!local){
  const response=await fetch(`${origin}/packages/${row.slug}`);const html=await response.text();check(response.status===200&&html.includes(row.name)&&html.includes('Duration not published'),`${entry.name}: real canonical public page`);
  check(html.includes(`/hospitals/${hospital.slug}`)&&html.includes(`/help?package=${row.slug}`),`${entry.name}: provider and actual inquiry links`);
 }
}
const candidates=good(await db.rpc('search_catalog_candidates',{p_terms:'health check',p_treatment_slug:'health-checkup'}));
check(packages.every(p=>candidates.some(c=>c.kind==='packages'&&c.slug===p.slug)), 'search returns all published source-backed packages');
check(!packages.some(p=>/QA ONLY|LOCAL QA|synthetic/i.test(p.name)),'no test package names promoted');
check(good(await db.rpc('public_package_evidence',{p_id:randomUUID()})).length===0,'unknown package evidence empty');
for(const table of ['provider_revisions','provider_reference_claims','provider_field_reviews','provider_documents']){const result=await db.from(table).select('id').limit(1);check(result.error||result.data.length===0,`${table}: private publication data denied anonymously`);}
if(!local){
 const before=JSON.stringify(packages.map(p=>[p.id,p.estimated_min,p.estimated_max,p.currency]));
 for(const currency of currencies){const response=await fetch(`${origin}/api/currency?from=USD&to=${currency}`);const {quote}=await response.json();check(response.status===200&&(currency==='USD'?quote===null:quote?.rate>0&&quote.source==='https://www.exchangerate-api.com'&&Date.parse(quote.updatedAt)>0),`${currency}: existing indicative live/cached conversion`);}
 check(JSON.stringify(good(await db.from('packages').select('*')).map(p=>[p.id,p.estimated_min,p.estimated_max,p.currency]))===before,'conversion preserves original stored amounts and currencies');
 const response=await fetch(`${origin}/api/discover?q=health%20check%20packages`);const result=await response.json();check(response.status===200&&result.sections.packages.length===7,'Discovery returns real packages');
 const missing=await fetch(`${origin}/api/discover?q=knee%20replacement%20packages&type=packages`);const missingResult=await missing.json();check(missing.status===200&&missingResult.sections.packages.length===0,'no fabricated surgical packages fill an unsupported request');
}
console.log(`Governed package ${local?'isolated source QA':'production'}: ${passes} public checks passed.`);
