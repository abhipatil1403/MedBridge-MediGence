-- Run only on a disposable production_catalog_* database. Never hosted.
-- Default: validate and roll back. keep_fixture=1 commits the V1 fixture for
-- local HTTP/browser checks, and must use a separate disposable database.
\set ON_ERROR_STOP on
\if :{?keep_fixture}
\else
\set keep_fixture 0
\endif
begin;
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Disposable database required';end if;end;$$;
create temporary table qc(k text primary key,id uuid default gen_random_uuid());
insert into qc(k) values('provider'),('other'),('admin'),('support'),('document');
insert into auth.users(id,email) select id,'catalog-'||k||'@qa.invalid' from qc where k<>'document';
insert into public.staff_roles(user_id,role) select id,case k when 'admin' then 'super_admin' else 'support_agent' end from qc where k in ('admin','support');
grant all on qc to authenticated;grant select on qc to anon;
create function pg_temp.assert_catalog(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end;$$;
create function pg_temp.denied_catalog(stmt text,msg text) returns void language plpgsql as $$begin begin execute stmt;exception when others then if position(msg in sqlerrm)>0 then raise notice 'PASS: denied %',msg;return;end if;raise;end;raise exception 'FAIL: permitted: %',stmt;end;$$;
set local role anon;
select pg_temp.assert_catalog((select count(*)=0 from public.hospitals),'seed QA hospitals excluded');
select pg_temp.assert_catalog((select count(*)=0 from public.packages),'seed QA packages excluded');
select pg_temp.assert_catalog((select count(*)=0 from public.search_catalog_candidates('')),'empty production search without demo fallback');
select pg_temp.assert_catalog(public.public_provider_package_details()='[]','QA structured services excluded');
select pg_temp.assert_catalog(public.public_catalog_provenance()='[]','QA provenance excluded');
reset role;
\ir pg-catalog-reference-fixtures.sql
select pg_temp.qa_publish_references((select id from qc where k='admin'));
-- A service-written published row without an approved publication must not
-- become public merely by having a real source classification.
insert into public.hospitals(slug,name,city_id,description,source_kind,publication_status,source_record_id)
  select 'local-unreviewed','LOCAL UNREVIEWED row',id,'Local negative fixture without governed approval.','external','published',source_record_id from public.cities where slug='mumbai';
set local role anon;
select pg_temp.assert_catalog(not exists(select 1 from public.hospitals where slug='local-unreviewed'),'non-QA classification alone cannot bypass publication review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='provider'),true);
insert into qc(k,id) select 'org',(public.portal_command('create_organization','{"name":"LOCAL VALIDATION Care Centre","providerType":"hospital","sourceKind":"first_party"}')->>'id')::uuid;
insert into qc(k,id) select 'profile',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','organization','name','LOCAL VALIDATION Care Centre','data',jsonb_build_object('cityId',(select id from public.cities where slug='mumbai'),'description','Disposable local publication test. Not a real provider or medical offer.','email','qa@qa.invalid','phone','00000000','address','Local test address','website','https://qa.invalid')))->>'id')::uuid;
insert into qc(k,id) select 'location',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','location','name','Local validation Delhi location','data',jsonb_build_object('cityId',(select id from public.cities where slug='new-delhi'),'address','Local additional address','phone','00000000')))->>'id')::uuid;
insert into qc(k,id) select 'specialty',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','specialty','name','Local Orthopedics department','data',jsonb_build_object('specialtyId',(select id from public.specialties where slug='orthopedics'),'department','Orthopedics','description','Local reviewed department.','availability','available')))->>'id')::uuid;
insert into qc(k,id) select 'treatment',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','treatment','name','Local knee replacement procedure','data',jsonb_build_object('treatmentId',(select id from public.treatments where slug='knee-replacement'),'description','Local reviewed procedure information.','availability','available')))->>'id')::uuid;
insert into qc(k,id) select 'doctor',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','doctor','name','LOCAL VALIDATION Doctor','data',jsonb_build_object('specialtyId',(select id from public.specialties where slug='orthopedics'),'professionalTitle','Local test title','department','Orthopedics','biography','Local published doctor fixture. Not a real clinician.','consultationMode','both','languages',jsonb_build_array('English'),'treatmentIds',jsonb_build_array((select id from public.treatments where slug='knee-replacement')))))->>'id')::uuid;
insert into qc(k,id) select 'facility',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','facility','name','Local rehabilitation room','data','{"facilityType":"other","availability":"available","description":"Explicitly published local facility."}'::jsonb))->>'id')::uuid;
insert into qc(k,id) select 'international',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','international_service','name','Local interpreter coordination','data','{"description":"Explicit local coordination service; package inclusion remains separate.","languages":["English"],"availability":"on_request"}'::jsonb))->>'id')::uuid;
reset role;
insert into storage.objects(bucket_id,name) select 'provider-documents',(select id::text from qc where k='org')||'/'||(select id::text from qc where k='document');
set local role authenticated;
select public.portal_command('register_document',jsonb_build_object('organizationId',(select id from qc where k='org'),'documentId',(select id from qc where k='document'),'name','Local validation accreditation.pdf','documentType','accreditation','storagePath',(select id::text from qc where k='org')||'/'||(select id::text from qc where k='document'),'mimeType','application/pdf','sizeBytes',20));
insert into qc(k,id) select 'accreditation',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','accreditation','name','LOCAL VALIDATION Accreditation','data',jsonb_build_object('body','Local validation body','documentId',(select id from qc where k='document'),'expiresOn',current_date+365)))->>'id')::uuid;
insert into qc(k,id) select 'package',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'kind','package','name','LOCAL VALIDATION Knee Package','data',jsonb_build_object('treatmentId',(select id from public.treatments where slug='knee-replacement'),'description','Disposable local package fixture. Not an available medical offer.','currency','INR','price',25000,'durationDays',3,'inclusions',jsonb_build_array('Hospital stay','Accommodation explicitly included'),'exclusions',jsonb_build_array('Flights'),'accommodationStatus','included','accommodationInfo','Two nights in explicitly listed accommodation.','transferStatus','excluded','interpreterStatus','conditional','interpreterInfo','By prior arrangement only.','consultationStatus','included','diagnosticsStatus','not_confirmed','followUpStatus','not_confirmed')))->>'id')::uuid;
select pg_temp.denied_catalog('select public.portal_publication_command(''publish_submission'',''{}'')','PORTAL_DENIED');
select set_config('request.jwt.claim.sub',(select id::text from qc where k='other'),true);
select pg_temp.assert_catalog((select count(*)=0 from public.provider_records),'other provider cannot read drafts');
select pg_temp.assert_catalog((select count(*)=0 from public.provider_documents),'other provider cannot read private evidence');
select set_config('request.jwt.claim.sub',(select id::text from qc where k='provider'),true);
insert into qc(k,id) select 'submission',(public.portal_command('submit',jsonb_build_object('organizationId',(select id from qc where k='org')))->>'id')::uuid;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_review_command('review_section',jsonb_build_object('submissionId',(select id from qc where k='submission'),'recordId',(select id from qc where k='profile'),'expectedRevision',1,'status','changes_requested','comment','Clarify the local published description.'));
select public.portal_command('review_submission',jsonb_build_object('submissionId',(select id from qc where k='submission'),'status','changes_requested','message','Clarify the local description.'));
select set_config('request.jwt.claim.sub',(select id::text from qc where k='provider'),true);
select public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'recordId',id,'kind',kind,'name',name,'data',data||'{"description":"Corrected local publication fixture. Not a real provider."}'::jsonb,'expectedRevision',revision)) from public.provider_records where id=(select id from qc where k='profile');
insert into qc(k,id) select 'resubmission',(public.portal_command('submit',jsonb_build_object('organizationId',(select id from qc where k='org'),'message','Description corrected.'))->>'id')::uuid;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='support'),true);
select pg_temp.denied_catalog('select public.portal_publication_command(''publish_submission'',''{}'')','PORTAL_DENIED');
select pg_temp.denied_catalog(format('select public.portal_command(''review_submission'',%L)',jsonb_build_object('submissionId',(select id from qc where k='resubmission'),'status','approved')::text),'PORTAL_DENIED');
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_command('review_document',jsonb_build_object('documentId',(select id from qc where k='document'),'status','approved','message','Reviewed local fixture evidence.'));
select public.portal_command('review_field',jsonb_build_object('submissionId',(select id from qc where k='resubmission'),'recordId',i.record_id,'field',case r.kind when 'organization' then 'name' else 'body' end,'status','verified','documentId',(select id from qc where k='document'),'evidence','Disposable fixture evidence, no real-world attestation.')) from public.provider_submission_items i join public.provider_records r on r.id=i.record_id where i.submission_id=(select id from qc where k='resubmission') and r.kind in ('organization','accreditation');
select public.portal_review_command('review_section',jsonb_build_object('submissionId',submission_id,'recordId',record_id,'expectedRevision',revision,'status','approved')) from public.provider_submission_items where submission_id=(select id from qc where k='resubmission');
select pg_temp.denied_catalog(format('select public.portal_command(''review_submission'',%L)',jsonb_build_object('submissionId',(select id from qc where k='resubmission'),'status','approved')::text),'PORTAL_PACKAGE_EVIDENCE_REQUIRED');
select public.portal_command('review_field',jsonb_build_object('submissionId',i.submission_id,'recordId',r.id,'field',claim.key,'status','approved','sourceUrl','https://qa.invalid/package-evidence','evidence','Disposable local evidence for the exact frozen package value.')) from public.provider_submission_items i join public.provider_records r on r.id=i.record_id join public.provider_revisions v on v.record_id=r.id and v.revision=i.revision cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) claim where i.submission_id=(select id from qc where k='resubmission') and r.kind='package';
select public.portal_command('review_submission',jsonb_build_object('submissionId',(select id from qc where k='resubmission'),'status','approved'));
reset role;
set local role anon;
select pg_temp.assert_catalog((select count(*)=0 from public.hospitals),'approved provider remains private before explicit publication');
select pg_temp.assert_catalog((select count(*)=0 from public.packages),'approved package remains private before publication');
select pg_temp.assert_catalog(jsonb_array_length(public.public_catalog_snapshot()->'packages')=0,'atomic snapshot keeps approved packages private');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_publication_command('publish_submission',jsonb_build_object('submissionId',(select id from qc where k='resubmission')));
insert into qc(k,id) select 'hospital',hospital_id from public.organizations where id=(select id from qc where k='org');
insert into qc(k,id) select 'public_doctor',canonical_id from public.provider_records where id=(select id from qc where k='doctor');
insert into qc(k,id) select 'public_package',canonical_id from public.provider_records where id=(select id from qc where k='package');
reset role;
set local role anon;
select pg_temp.assert_catalog((select count(*)=1 from public.hospitals),'only governed non-QA hospital visible');
select pg_temp.assert_catalog(jsonb_array_length(public.public_catalog_snapshot()->'hospitals')=1 and jsonb_array_length(public.public_catalog_snapshot()->'doctors')=1 and jsonb_array_length(public.public_catalog_snapshot()->'packages')=1,'atomic snapshot excludes synthetic and unpublished providers');
select pg_temp.assert_catalog((select count(*)=1 from public.doctors),'published doctor visible');
select pg_temp.assert_catalog((select count(*)=1 from public.packages),'published package visible');
select pg_temp.assert_catalog(exists(select 1 from public.hospital_doctors where hospital_id=(select id from qc where k='hospital') and doctor_id=(select id from qc where k='public_doctor')),'hospital doctor relationship canonical');
select pg_temp.assert_catalog(exists(select 1 from public.packages where id=(select id from qc where k='public_package') and hospital_id=(select id from qc where k='hospital')),'hospital package relationship canonical');
select pg_temp.assert_catalog(exists(select 1 from public.search_catalog_candidates('knee replacement','knee-replacement',null,array['india'],'Mumbai') where kind='hospitals'),'Discovery canonical hospital search');
select pg_temp.assert_catalog(exists(select 1 from public.search_catalog_candidates('knee replacement','knee-replacement') where kind='packages'),'package search consumes canonical publication');
select pg_temp.assert_catalog((public.public_provider_record('package',(select id from qc where k='public_package'))->'serviceDetails'->'accommodation'->>'status')='included','explicit accommodation evidence published');
select pg_temp.assert_catalog((public.public_provider_record('package',(select id from qc where k='public_package'))->'serviceDetails'->'diagnostics'->>'status')='not_confirmed','unknown diagnostics preserved');
select pg_temp.assert_catalog(jsonb_array_length(public.public_provider_profile((select id from qc where k='hospital'))->'locations')=1,'published additional location rendered');
select pg_temp.assert_catalog(jsonb_array_length(public.public_provider_profile((select id from qc where k='hospital'))->'accreditations')=1,'only current verified accreditation published');
select pg_temp.assert_catalog(jsonb_array_length(public.public_provider_profile((select id from qc where k='hospital'))->'internationalServices')=1,'only explicit international service published');
select pg_temp.assert_catalog(position('storage_path' in public.public_provider_profile((select id from qc where k='hospital'))::text)=0 and position('evidence' in public.public_provider_profile((select id from qc where k='hospital'))::text)=0,'private document paths and review evidence excluded');
select pg_temp.denied_catalog('select * from public.provider_documents','permission denied');
select pg_temp.denied_catalog('select verified_by from public.hospitals','permission denied');
select pg_temp.denied_catalog('select verification_source from public.doctors','permission denied');
select pg_temp.denied_catalog('select accreditation_note from public.hospitals','permission denied');
select pg_temp.denied_catalog('select public.public_provider_image(gen_random_uuid())','permission denied');
reset role;
\if :keep_fixture
commit;
\echo V1 fixture committed ONLY for isolated local HTTP/browser tests.
\else
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='provider'),true);
select public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'recordId',id,'kind',kind,'name','PRIVATE V2 Hospital','data',data,'expectedRevision',revision)) from public.provider_records where id=(select id from qc where k='profile');
select public.portal_command('save_record',jsonb_build_object('organizationId',(select id from qc where k='org'),'recordId',id,'kind',kind,'name','PRIVATE V2 Package','data',data||'{"price":27000,"accommodationStatus":"excluded"}'::jsonb,'expectedRevision',revision)) from public.provider_records where id=(select id from qc where k='package');
reset role;
set local role anon;
select pg_temp.assert_catalog(exists(select 1 from public.hospitals where name='LOCAL VALIDATION Care Centre'),'published V1 preserved during V2 draft');
select pg_temp.assert_catalog(exists(select 1 from public.packages where name='LOCAL VALIDATION Knee Package' and estimated_min=25000),'published price preserved during draft edit');
select pg_temp.assert_catalog(exists(select 1 from jsonb_array_elements(public.public_catalog_snapshot()->'packages') p where p->>'name'='LOCAL VALIDATION Knee Package' and (p->>'estimated_min')::numeric=25000),'atomic snapshot preserves published V1 during draft edits');
select pg_temp.assert_catalog((public.public_provider_record('package',(select id from qc where k='public_package'))->'serviceDetails'->'accommodation'->>'status')='included','draft service change cannot leak');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='provider'),true);
insert into qc(k,id) select 'v2_submission',(public.portal_command('submit',jsonb_build_object('organizationId',(select id from qc where k='org')))->>'id')::uuid;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_command('review_field',jsonb_build_object('submissionId',(select id from qc where k='v2_submission'),'recordId',(select id from qc where k='profile'),'field','name','status','verified','documentId',(select id from qc where k='document'),'evidence','Local revision evidence reviewed for the V2 fixture.'));
select public.portal_review_command('review_section',jsonb_build_object('submissionId',submission_id,'recordId',record_id,'expectedRevision',revision,'status','approved')) from public.provider_submission_items where submission_id=(select id from qc where k='v2_submission');
select public.portal_command('review_field',jsonb_build_object('submissionId',i.submission_id,'recordId',r.id,'field',claim.key,'status','approved','sourceUrl','https://qa.invalid/package-evidence','evidence','Disposable evidence re-reviewed for this new frozen revision.')) from public.provider_submission_items i join public.provider_records r on r.id=i.record_id join public.provider_revisions v on v.record_id=r.id and v.revision=i.revision cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) claim where i.submission_id=(select id from qc where k='v2_submission') and r.kind='package';
select public.portal_command('review_submission',jsonb_build_object('submissionId',(select id from qc where k='v2_submission'),'status','approved'));
reset role;
set local role anon;
select pg_temp.assert_catalog(exists(select 1 from public.hospitals where name='LOCAL VALIDATION Care Centre'),'V2 approval alone does not replace V1');
select pg_temp.assert_catalog(exists(select 1 from jsonb_array_elements(public.public_catalog_snapshot()->'hospitals') p where p->>'name'='LOCAL VALIDATION Care Centre'),'atomic snapshot preserves V1 until explicit publication');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_publication_command('publish_submission',jsonb_build_object('submissionId',(select id from qc where k='v2_submission')));
reset role;
set local role anon;
select pg_temp.assert_catalog(exists(select 1 from public.hospitals where name='PRIVATE V2 Hospital'),'explicit V2 publication replaces V1');
select pg_temp.assert_catalog(exists(select 1 from public.packages where name='PRIVATE V2 Package' and estimated_min=27000),'explicit package publication replaces price');
select pg_temp.assert_catalog(exists(select 1 from jsonb_array_elements(public.public_catalog_snapshot()->'packages') p where p->>'name'='PRIVATE V2 Package' and (p->>'estimated_min')::numeric=27000),'atomic snapshot immediately reflects explicit V2 publication');
select pg_temp.assert_catalog((public.public_provider_record('package',(select id from qc where k='public_package'))->'serviceDetails'->'accommodation'->>'status')='excluded','explicit package publication replaces service evidence');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_publication_command('archive_record',jsonb_build_object('recordId',(select id from qc where k='facility'),'expectedRevision',1,'confirmed',true));
reset role;
set local role anon;
select pg_temp.assert_catalog(not exists(select 1 from jsonb_array_elements(public.public_provider_profile((select id from qc where k='hospital'))->'sections') s where s->>'kind'='facility'),'archived facility disappears from public snapshot');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from qc where k='admin'),true);
select public.portal_publication_command('archive_record',jsonb_build_object('recordId',(select id from qc where k='profile'),'expectedRevision',3,'confirmed',true));
select pg_temp.assert_catalog((select count(*)>=3 from public.provider_revisions where record_id=(select id from qc where k='profile')),'archive preserves immutable revision history');
reset role;
set local role anon;
select pg_temp.assert_catalog((select count(*)=0 from public.hospitals),'archived hospital disappears');
select pg_temp.assert_catalog((select count(*)=0 from public.doctors),'parent archive hides doctors');
select pg_temp.assert_catalog((select count(*)=0 from public.packages),'parent archive hides packages');
select pg_temp.assert_catalog(jsonb_array_length(public.public_catalog_snapshot()->'hospitals')=0 and jsonb_array_length(public.public_catalog_snapshot()->'doctors')=0 and jsonb_array_length(public.public_catalog_snapshot()->'packages')=0,'atomic snapshot immediately hides archived provider and dependents');
select pg_temp.assert_catalog((select count(*)=0 from public.search_catalog_candidates('LOCAL VALIDATION')),'archived listings disappear from search');
select pg_temp.assert_catalog(public.public_provider_profile((select id from qc where k='hospital'))='{}','archived profile empty');
select pg_temp.assert_catalog(public.public_provider_package_details()='[]','archived package evidence empty');
reset role;
rollback;
\echo Production catalog isolation, governed publication, canonical relationships, revisions, archival and permissions passed.
\endif
