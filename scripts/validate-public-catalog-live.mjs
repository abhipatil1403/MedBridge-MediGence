import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
// Read-only release gate using ordinary anonymous public permissions.
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let passed=0;
for(const table of ['countries','cities','specialties','conditions','treatments','hospitals','doctors','packages','healthcare_services','price_estimates']) {
 const {data,error}=await client.from(table).select('id,source_kind');
 assert.equal(error,null,table);
 assert.ok(data.every(row=>['first_party','external'].includes(row.source_kind)),`${table}: QA exclusion`);
 if(process.env.MEDBRIDGE_EXPECT_EMPTY_CATALOG==='1') assert.equal(data.length,0,`${table}: empty production catalog`);
 console.log(`PASS ${++passed}: ${table} anonymous visibility (${data.length} rows)`);
}
for(const [table,column] of [['hospitals','verified_by'],['hospitals','verification_source'],['hospitals','accreditation_note'],['doctors','verified_by'],['doctors','verification_source']]) {
 assert.ok((await client.from(table).select(column)).error,`${table}.${column} must remain private`);
 console.log(`PASS ${++passed}: private ${table}.${column} denied`);
}
for(const table of ['provider_documents','provider_revisions','provider_section_reviews','provider_field_reviews','provider_reference_claims','source_records','audit_events','organization_verification_requests','provider_listing_ownership','portal_network_operations','operational_incidents','operational_recovery_attempts']) {
 const {data,error}=await client.from(table).select('id').limit(1);
 assert.ok(error || data.length===0,`${table} must remain private`);
 console.log(`PASS ${++passed}: private ${table} denied`);
}
for(const [name,args] of [['search_catalog_candidates',{p_terms:''}],['public_provider_package_details',{}],['public_catalog_provenance',{}]]) {
 const {data,error}=await client.rpc(name,args);
 assert.equal(error,null,name);
 if(process.env.MEDBRIDGE_EXPECT_EMPTY_CATALOG==='1') assert.deepEqual(data,[],name);
 console.log(`PASS ${++passed}: ${name} shares the public boundary`);
}
for(const [name,args] of [['public_reference_locations',{}]]){
 const {data,error}=await client.rpc(name,args);assert.equal(error,null,name);
 assert.ok(Array.isArray(data));assert.ok(data.every(row=>!Object.hasOwn(row,'evidence_summary')&&!Object.hasOwn(row,'reviewed_by')));
 console.log(`PASS ${++passed}: ${name} excludes private evidence and operators`);
}
for(const [name,args] of [['operations_overview',{}],['operations_probe',{}],['operations_inquiries',{}],['operations_command',{p_action:'operations_policy',p_input:{}}],['operations_record_health',{p_actor:null,p_operation:null,p_result:{}}],['operations_record_request',{p_actor:null,p_metadata:{}}],['portal_network_readiness',{}],['portal_network_command',{p_action:'submit_organization_verification',p_input:{}}]]) {
 assert.ok((await client.rpc(name,args)).error,`${name}: authentication required`);
 console.log(`PASS ${++passed}: anonymous ${name} denied`);
}
console.log(`Public catalog live: ${passed} read-only gates passed.`);
