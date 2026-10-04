// Generates a rollback-only validation transaction for a disposable local DB.
// It uses the actual bounded manifest and every governed RPC, never direct
// inserts into provider or canonical tables. Do not run against hosted data.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const load=(path,imports={})=>{
  const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInNewContext(output,{exports,require:name=>{if(!imports[name])throw new Error(`Unexpected import ${name}`);return imports[name];}});return exports;
};
const starter=load('lib/reference-data/starter.ts');
const taxonomy=load('lib/reference-data/taxonomy.ts',{'./starter':starter});
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const json=value=>`${quote(JSON.stringify(value))}::jsonb`;
const commands=[`\\set ON_ERROR_STOP on
\\encoding UTF8
begin;
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Disposable database required';end if;end;$$;
create temporary table starter_ids(k text primary key,id uuid not null);
insert into starter_ids values('admin',gen_random_uuid());
insert into auth.users(id,email) select id,'starter-local-admin@qa.invalid' from starter_ids;
insert into public.staff_roles(user_id,role) select id,'super_admin' from starter_ids;
grant all on starter_ids to authenticated;grant select on starter_ids to anon;
create function pg_temp.starter_resolve(d jsonb) returns jsonb language plpgsql as $$declare k text;v jsonb;ref text;target uuid;begin
 for k,v in select * from jsonb_each(d) loop
 if jsonb_typeof(v)='string' and (v#>>'{}') like '$%' then
 ref:=substring(v#>>'{}' from 2);ref:=regexp_replace(ref,'^city:','cities:');ref:=regexp_replace(ref,'^specialty:','specialties:');ref:=regexp_replace(ref,'^treatment:','treatments:');
 select id into target from starter_ids where starter_ids.k=ref;
 if target is null then raise exception 'Unresolved starter reference %',ref;end if;d:=jsonb_set(d,array[k],to_jsonb(target));
 end if;end loop;return d;end;$$;
create function pg_temp.starter_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from starter_ids where starter_ids.k='admin'),true);`];
for(const [key,source] of Object.entries(starter.starterSources))commands.push(`insert into starter_ids select ${quote(`source:${key}`)},(public.portal_reference_command('create_reference_source',${json({...source,collectedAt:starter.starterCollectedAt,reviewAfter:starter.starterReviewAfter,notes:'Local validation of the actual researched collection.'})})->>'id')::uuid;`);
commands.push(`insert into starter_ids select 'countries:'||slug,id from public.countries;
insert into starter_ids select 'cities:'||slug,id from public.cities;
insert into starter_ids select 'specialties:'||slug,id from public.specialties;
insert into starter_ids select 'treatments:'||slug,id from public.treatments;`);
for(const entry of taxonomy.starterTaxonomy){
 const key=`${entry.entity}:${entry.slug}`;
 commands.push(`do $$declare d jsonb;begin
 d:=public.portal_catalog_command('save_catalog_draft',jsonb_build_object('entity',${quote(entry.entity)},'name',${quote(entry.name)},'targetId',(select id from starter_ids where starter_ids.k=${quote(key)}),'data',pg_temp.starter_resolve(${json({...entry.data,slug:entry.slug,source_kind:'external'})})||jsonb_build_object('source_record_id',(select id from starter_ids where starter_ids.k=${quote(`source:${entry.source}`)}))));
 perform public.portal_catalog_command('approve_catalog',jsonb_build_object('draftId',d->>'id','expectedRevision',d->'revision'));
 d:=public.portal_catalog_command('publish_catalog',jsonb_build_object('draftId',d->>'id','expectedRevision',d->'revision','confirmed',true));
 insert into starter_ids values(${quote(key)},(d->>'target_id')::uuid) on conflict(k) do update set id=excluded.id;
 end;$$;`);
}
for(const provider of starter.starterProviders){
 commands.push(`insert into starter_ids select ${quote(`org:${provider.key}`)},(public.portal_reference_command('create_reference_organization',${json({name:provider.name,providerType:'hospital'})})->>'id')::uuid;`);
 for(const entry of provider.records){
  commands.push(`do $$declare r jsonb;claim_field text;begin
   r:=public.portal_command('save_record',jsonb_build_object('organizationId',(select id from starter_ids where starter_ids.k=${quote(`org:${provider.key}`)}),'kind',${quote(entry.kind)},'name',${quote(entry.name)},'data',pg_temp.starter_resolve(${json(entry.data)})));
   insert into starter_ids values(${quote(`record:${entry.key}`)},(r->>'id')::uuid) on conflict(k) do update set id=excluded.id;
   for claim_field in select jsonb_object_keys((r->'data')||jsonb_build_object('name',r->>'name')) loop
    perform public.portal_reference_command('attach_reference_claim',jsonb_build_object('recordId',r->>'id','expectedRevision',r->'revision','field',claim_field,'sourceId',(select id from starter_ids where starter_ids.k=${quote(`source:${entry.source}`)}),'evidence',${quote(entry.evidence)}));
   end loop;end;$$;`);
 }
 commands.push(`reset role;set local role anon;select pg_temp.starter_assert(not exists(select 1 from public.hospitals where name=${quote(provider.name)}),'${provider.key} remains private in draft');reset role;set local role authenticated;
 select set_config('request.jwt.claim.sub',(select id::text from starter_ids where starter_ids.k='admin'),true);
 do $$declare s jsonb;r public.provider_records;begin
 s:=public.portal_command('submit',jsonb_build_object('organizationId',(select id from starter_ids where starter_ids.k=${quote(`org:${provider.key}`)}),'message','Sourced starter collection: local workflow validation.'));
 for r in select * from public.provider_records where organization_id=(select id from starter_ids where starter_ids.k=${quote(`org:${provider.key}`)}) loop
 perform public.portal_reference_command('review_reference_claims',jsonb_build_object('submissionId',s->>'id','recordId',r.id,'expectedRevision',r.revision,'confirmed',true,'identityChecked',r.kind='organization'));
 perform public.portal_review_command('review_section',jsonb_build_object('submissionId',s->>'id','recordId',r.id,'expectedRevision',r.revision,'status','approved','comment','Every populated claim was checked against the linked official branch source.','reason','Bounded reference review.'));
 end loop;
 perform public.portal_command('review_submission',jsonb_build_object('submissionId',s->>'id','status','approved','message','Source-backed reference sections approved.'));
 perform public.portal_publication_command('publish_submission',jsonb_build_object('submissionId',s->>'id','confirmed',true));
 end;$$;`);
}
commands.push(`reset role;set local role anon;
select pg_temp.starter_assert((select count(*)=5 from public.hospitals),'five sourced hospitals published; synthetic catalog excluded');
select pg_temp.starter_assert((select count(*)=5 from public.doctors),'five sourced doctors published');
select pg_temp.starter_assert((select count(*)=0 from public.packages),'no invented starter packages');
select pg_temp.starter_assert((select count(*)=0 from public.price_estimates),'no fabricated starter prices');
select pg_temp.starter_assert((select bool_and(consultation_mode is null and experience_years is null) from public.doctors),'unknown doctor modes and experience remain unset');
select pg_temp.starter_assert((select count(*)=2 from public.treatments),'two sourced canonical treatment identities');
select pg_temp.starter_assert((select count(*)=4 from public.hospital_treatments ht join public.treatments t on t.id=ht.treatment_id where t.slug='knee-replacement'),'four explicitly sourced knee replacement offerings');
select pg_temp.starter_assert((select bool_and(jsonb_array_length(public.public_reference_claims('hospital',id))>10) from public.hospitals),'every published hospital exposes safe field-level provenance');
select pg_temp.starter_assert(not exists(select 1 from jsonb_array_elements(public.public_catalog_provenance()) x where x->>'origin'='provider_published'),'references never mislabeled provider-submitted');
reset role;
select pg_temp.starter_assert((select count(*)=29 from public.provider_records r join public.organizations o on o.id=r.organization_id where o.onboarding_origin='admin_reference'),'all twenty-nine sourced sections passed governed publication');
rollback;`);
const output=process.argv[2];if(!output)throw new Error('Supply a temporary SQL output path.');writeFileSync(output,commands.join('\n'),'utf8');console.log('Generated rollback-only starter collection validation.');
