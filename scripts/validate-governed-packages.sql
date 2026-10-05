-- Disposable PostgreSQL only. Real publication commands; always roll back.
\set ON_ERROR_STOP on
begin;
do $$begin if current_database() not like 'production_catalog_personal_packages_%' then raise exception 'Isolated package QA database required';end if;end $$;
create function pg_temp.package_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end $$;
create function pg_temp.package_denied(kind text,data jsonb,msg text,submit boolean default false) returns void language plpgsql as $$begin begin perform private.portal_validate_record(kind,data,submit);exception when others then raise notice 'PASS: %',msg;return;end;raise exception 'FAIL: permitted %',msg;end $$;
create temporary table package_ids(k text primary key,id uuid);
insert into package_ids select 'provider',u.id from auth.users u where email='catalog-provider@qa.invalid';
insert into package_ids select 'admin',user_id from public.staff_roles where role='super_admin' and user_id=(select id from auth.users where email='catalog-admin@qa.invalid');
insert into package_ids select 'org',id from public.organizations where name='LOCAL VALIDATION Care Centre' and source_kind='first_party';
grant all on package_ids to authenticated;grant select on package_ids to anon;
-- Validator independently accepts incomplete drafts and enforces semantic bounds.
select private.portal_validate_record('package','{}',false);
select pg_temp.package_assert(true,'incomplete package draft accepted');
select private.portal_validate_record('package',jsonb_build_object('description','QA contact package','treatmentId',(select id from public.treatments where slug='knee-replacement'),'priceType','contact_provider'),true);
select pg_temp.package_assert(true,'contact pricing submit permits null amount and duration');
select private.portal_validate_record('package',jsonb_build_object('description','QA unpriced package','treatmentId',(select id from public.treatments where slug='knee-replacement'),'priceType','not_published'),true);
select pg_temp.package_assert(true,'not published pricing submit permits null currency');
select pg_temp.package_denied('package','{"priceType":"contact_provider","price":10}','contact pricing forbids amount');
select pg_temp.package_denied('package','{"priceType":"not_published","priceMax":10}','unpublished pricing forbids range');
select pg_temp.package_denied('package','{"price":100,"priceMax":90}','range maximum below minimum blocked');
select pg_temp.package_denied('package','{"price":-1}','negative original price blocked');
select pg_temp.package_denied('package','{"priceType":"made_up"}','invented pricing type blocked');
select pg_temp.package_denied('package','{"priceSourceUrl":"https://example.org/?token=secret"}','private query source blocked');
select pg_temp.package_denied('package','{"priceCheckedAt":"2099-01-01"}','future checked date blocked');
select pg_temp.package_denied('package','{"priceValidFrom":"2026-10-01","priceValidUntil":"2026-09-01"}','inverted tariff validity blocked');
select pg_temp.package_denied('package','{"accommodationStatus":"conditional"}','conditional accommodation needs conditions',true);
select pg_temp.package_denied('package','{"visaAssistanceStatus":"guaranteed"}','invented visa state blocked');
select pg_temp.package_denied('package','{"durationDays":-2}','negative duration blocked');
select pg_temp.package_denied('package','{"description":"An incomplete priced package","price":20,"currency":"usd"}','numeric submit needs canonical currency and published treatment',true);
-- Every service key retains all four independent states; no inferred inclusion.
do $$declare k text;s text;begin
 foreach k in array array['procedure','hospitalStay','rehabilitation','localTransport','visaAssistance','accommodation','transfer','interpreter','consultation','diagnostics','followUp'] loop
  foreach s in array array['included','excluded','conditional','not_confirmed'] loop
   perform pg_temp.package_assert(private.portal_package_details(jsonb_build_object(k||'Status',s,k||'Info','Exact scoped statement'))->k->>'status'=s,k||' preserves '||s);
  end loop;
  perform pg_temp.package_assert(private.portal_package_details('{}')->k->>'status'='not_confirmed',k||' defaults to unconfirmed');
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from package_ids where k='provider'),true);
insert into package_ids select 'contact',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from package_ids where k='org'),'kind','package','name','LOCAL QA Contact Price','data',jsonb_build_object('description','Isolated contact pricing fixture, not a real offer.','treatmentId',(select id from public.treatments where slug='knee-replacement'),'priceType','contact_provider','accommodationStatus','not_confirmed')))->>'id')::uuid;
insert into package_ids select 'range',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from package_ids where k='org'),'kind','package','name','LOCAL QA Price Range','data',jsonb_build_object('description','Isolated range pricing fixture, not a real offer.','treatmentId',(select id from public.treatments where slug='knee-replacement'),'priceType','estimate','price',4700,'priceMax',5100,'currency','USD','accommodationStatus','conditional','accommodationInfo','Two nights subject to documented eligibility.')))->>'id')::uuid;
insert into package_ids select 'starting',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from package_ids where k='org'),'kind','package','name','LOCAL QA Starting Price','data',jsonb_build_object('description','Isolated starting pricing fixture, not a real offer.','treatmentId',(select id from public.treatments where slug='knee-replacement'),'priceType','starting_price','price',4000,'currency','EUR')))->>'id')::uuid;
insert into package_ids select 'submission',(public.portal_command('submit',jsonb_build_object('organizationId',(select id from package_ids where k='org')))->>'id')::uuid;
select set_config('request.jwt.claim.sub',(select id::text from package_ids where k='admin'),true);
select public.portal_review_command('review_section',jsonb_build_object('submissionId',submission_id,'recordId',record_id,'expectedRevision',revision,'status','approved')) from public.provider_submission_items where submission_id=(select id from package_ids where k='submission');
reset role;
select pg_temp.package_assert(not private.package_evidence_current((select id from package_ids where k='range'),1),'section approval without price evidence cannot approve package');
set local role authenticated;
select public.portal_command('review_field',jsonb_build_object('submissionId',i.submission_id,'recordId',r.id,'field',c.key,'status','approved','sourceUrl','https://qa.invalid/scoped-package-source','evidence','Exact local fixture field checked; no real-world attestation.')) from public.provider_submission_items i join public.provider_records r on r.id=i.record_id join public.provider_revisions v on v.record_id=r.id and v.revision=i.revision cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) c where i.submission_id=(select id from package_ids where k='submission') and r.kind='package';
select public.portal_command('review_submission',jsonb_build_object('submissionId',(select id from package_ids where k='submission'),'status','approved'));
reset role;
set local role anon;
select pg_temp.package_assert(not exists(select 1 from public.packages where name='LOCAL QA Contact Price'),'approved contact package private before explicit publication');
reset role;
set local role authenticated;
select public.portal_publication_command('publish_submission',jsonb_build_object('submissionId',(select id from package_ids where k='submission')));
reset role;
set local role anon;
select pg_temp.package_assert(exists(select 1 from public.packages where name='LOCAL QA Contact Price' and estimated_min is null and estimated_max is null and currency is null and duration_days is null and price_type='contact_provider'),'contact package publishes nulls without invented zero or duration');
select pg_temp.package_assert(exists(select 1 from public.packages where name='LOCAL QA Price Range' and estimated_min=4700 and estimated_max=5100 and currency='USD' and price_type='estimate'),'range and original provider currency persist');
select pg_temp.package_assert(exists(select 1 from public.packages where name='LOCAL QA Starting Price' and estimated_min=4000 and estimated_max=4000 and currency='EUR' and price_type='starting_price'),'starting price preserves semantic type');
select pg_temp.package_assert(exists(select 1 from public.search_catalog_candidates('knee replacement','knee-replacement') where kind='packages' and slug=(select slug from public.packages where name='LOCAL QA Contact Price')),'published missing price searchable');
select pg_temp.package_assert((select jsonb_array_length(public.public_package_evidence(id))>0 from public.packages where name='LOCAL QA Price Range'),'published field provenance exposed');
select pg_temp.package_assert((select public.public_package_evidence(id)::text not like '%actor_id%' and public.public_package_evidence(id)::text not like '%storage_path%' from public.packages where name='LOCAL QA Price Range'),'public field provenance excludes actor and storage path');
select pg_temp.package_assert(public.public_package_evidence(gen_random_uuid())='[]','unknown package evidence empty');
select pg_temp.package_assert((select bool_and((entry->>'publishedRevision')::integer=1) from jsonb_array_elements(public.public_provider_package_details()) entry),'public DTO exposes published revision only');
select pg_temp.package_assert((select bool_and(not(entry ? 'revision' or entry ? 'actor_id' or entry ? 'storage_path')) from jsonb_array_elements(public.public_provider_package_details()) entry),'published revision DTO excludes current draft revision and private fields');
reset role;
rollback;
\echo Governed package pricing, ranges, nulls, all 44 service states, evidence gates, publication and privacy passed.
