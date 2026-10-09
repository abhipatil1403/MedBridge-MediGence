-- Disposable local QA only. Apply validate-production-catalog.sql keep_fixture=1 first.
\set ON_ERROR_STOP on
begin;
do $$begin if current_database() not like 'production_catalog_personal_inquiry_%' then raise exception 'Disposable inquiry QA database required';end if;end;$$;
create temporary table pc(k text primary key,id uuid default gen_random_uuid(),v jsonb);
insert into pc(k) values('patient'),('manager');
insert into auth.users(id,email) select id,'provider-coordination-'||k||'@qa.invalid' from pc;
insert into public.staff_roles(user_id,role) select id,'support_manager' from pc where k='manager';
insert into pc(k,id) select 'hospital',id from public.hospitals where source_kind='first_party' and publication_status='published' limit 1;
insert into pc(k,id) select 'org',id from public.organizations where hospital_id=(select id from pc where k='hospital');
insert into pc(k,id) select 'provider',user_id from public.organization_members where organization_id=(select id from pc where k='org') and active limit 1;
grant all on pc to authenticated;
create function pg_temp.pc_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end;$$;
create function pg_temp.pc_denied(stmt text,code text) returns void language plpgsql as $$begin begin execute stmt;exception when others then if position(code in sqlerrm)>0 then raise notice 'PASS: denied %',code;return;end if;raise;end;raise exception 'FAIL: permitted operation';end;$$;
create function pg_temp.pc_input(extra jsonb default '{}') returns jsonb language sql as $$select jsonb_build_object('operationId',gen_random_uuid(),'caseId',(select id from pc where k='case'))||extra;$$;

-- Canonical publication exists, but nobody can act for the organization yet.
update public.organization_members set active=false where organization_id=(select id from pc where k='org');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from pc where k='patient'),true);
select pg_temp.pc_assert(public.inquiry_target('hospital',(select id from pc where k='hospital'))->>'organizationId' is null,'inactive provider team cannot be offered for authorization');
insert into pc(k,id) select 'case',(public.inquiry_command('create',jsonb_build_object('operationId',gen_random_uuid(),'entityKind','hospital','entityId',(select id from pc where k='hospital'),'expectedPublishedRevision',(public.inquiry_target('hospital',(select id from pc where k='hospital'))->>'publishedRevision')::integer,'source','hospital_detail','title','LOCAL provider coordination QA','objective','Clarify this administrative coordination request.','consent',true,'reviewed',true))->>'id')::uuid;
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'organization'='null'::jsonb,'unconnected inquiry honestly stays with Support');
select pg_temp.pc_denied(format('select public.inquiry_command(''share_provider'',%L)',pg_temp.pc_input(jsonb_build_object('organizationId',(select id from pc where k='org'),'purpose','Coordinate this request.','confirmed',true))::text),'INQUIRY_PROVIDER_UNAVAILABLE');
reset role;
update public.organization_members set active=true where organization_id=(select id from pc where k='org') and user_id=(select id from pc where k='provider');
set local role authenticated;
select pg_temp.pc_assert((public.inquiry_context((select id from pc where k='case'))->'providerCoordination'->>'available')::boolean,'newly activated trusted canonical team becomes available');
select public.inquiry_command('share_provider',pg_temp.pc_input(jsonb_build_object('organizationId',(select id from pc where k='org'),'purpose','Coordinate this request.','confirmed',true)));
select pg_temp.pc_assert((select organization_id=(select id from pc where k='org') and share_with_provider from public.support_cases where id=(select id from pc where k='case')),'late binding occurs only on explicit named patient authorization');
select set_config('request.jwt.claim.sub',(select id::text from pc where k='provider'),true);
insert into pc(k,v) values('information',pg_temp.pc_input('{"body":"What dates can you coordinate with our team?"}'));
select public.inquiry_command('request_information',(select v from pc where k='information'));
select public.inquiry_command('request_information',(select v from pc where k='information'));
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'case'->>'provider_response_status'='information_requested','provider information request persists its actual response state');
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'providerCoordination'->'latestResponse'->>'body'='What dates can you coordinate with our team?','provider information request has an accountable persisted response');
reset role;
select pg_temp.pc_assert((select count(*)=1 from public.portal_notifications where resource_id=(select id from pc where k='case') and user_id=(select id from pc where k='patient') and title='Additional information requested.'),'information retry emits one patient notification');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from pc where k='patient'),true);
select public.inquiry_command('message',pg_temp.pc_input('{"body":"Private answer for Support only.","visibility":"patient"}'));
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'case'->>'provider_response_status'='information_requested','private reply cannot fulfill a provider information request');
select set_config('request.jwt.claim.sub',(select id::text from pc where k='provider'),true);
select pg_temp.pc_assert(position('Private answer for Support only.' in public.inquiry_context((select id from pc where k='case'))::text)=0,'provider cannot read a patient-only reply');
select set_config('request.jwt.claim.sub',(select id::text from pc where k='patient'),true);
insert into pc(k,v) values('answer',pg_temp.pc_input('{"body":"My shared coordination dates are next month.","visibility":"shared"}'));
select public.inquiry_command('message',(select v from pc where k='answer'));
select public.inquiry_command('message',(select v from pc where k='answer'));
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'case'->>'provider_response_status'='pending','shared patient answer changes to awaiting provider response');
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'providerCoordination'->>'informationAnsweredAt' is not null,'shared answer timestamp survives a fresh context read');
reset role;
select pg_temp.pc_assert((select count(*)=1 from public.portal_notifications where resource_id=(select id from pc where k='case') and user_id=(select id from pc where k='provider') and title='Patient replied to the provider information request.'),'patient reply retry emits one provider notification');
-- Dual-role actor is not assigned Support access and must retain provider provenance.
insert into public.staff_roles(user_id,role) select id,'support_agent' from pc where k='provider';
update public.support_cases set assigned_to=(select id from pc where k='manager') where id=(select id from pc where k='case');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from pc where k='provider'),true);
insert into pc(k,v) values('review',pg_temp.pc_input('{"status":"further_review","body":"Our authorized team requires further coordination.","confirmed":true}'));
select public.inquiry_command('provider_response',(select v from pc where k='review'));
select public.inquiry_command('provider_response',(select v from pc where k='review'));
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'case'->>'provider_response_status'='further_review','further coordination is a real persisted state distinct from acceptance');
select pg_temp.pc_assert(exists(select 1 from jsonb_array_elements(public.inquiry_context((select id from pc where k='case'))->'messages') m where m->>'body'='Our authorized team requires further coordination.' and m->>'sender'='Provider'),'dual-role message principal reflects actual provider access');
select pg_temp.pc_denied(format('select public.inquiry_command(''provider_response'',%L)',pg_temp.pc_input('{"status":"accepted_for_coordination","body":"Our team can proceed."}')::text),'PORTAL_CONFIRMATION_REQUIRED');
select public.inquiry_command('provider_response',pg_temp.pc_input('{"status":"accepted_for_coordination","body":"Our team can continue administrative coordination only.","confirmed":true}'));
select set_config('request.jwt.claim.sub',(select id::text from pc where k='manager'),true);
select pg_temp.pc_assert(public.inquiry_context((select id from pc where k='case'))->'providerCoordination'->'latestResponse'->>'body'='Our team can continue administrative coordination only.','Support sees the actual confirmed operational response');
reset role;
select pg_temp.pc_assert(exists(select 1 from public.audit_events where entity_id=(select id from pc where k='case') and event_name='inquiry.provider_response' and actor_id=(select id from pc where k='provider') and metadata->>'organizationId'=(select id::text from pc where k='org')),'audit identifies actual actor organization and event without response prose');
select pg_temp.pc_assert((select count(*)=1 from public.portal_notifications where resource_id=(select id from pc where k='case') and user_id=(select id from pc where k='patient') and title='Provider response received: further review.'),'further-review retry emits one patient notification');

-- Ambiguous persisted links fail closed; never choose an arbitrary first organization.
insert into pc(k) values('ambiguous_org'),('ambiguous_record'),('ambiguous_submission');
insert into public.organizations select (jsonb_populate_record(null::public.organizations,to_jsonb(o)||jsonb_build_object('id',(select id from pc where k='ambiguous_org'),'name','LOCAL ambiguous canonical organization','hospital_id',null))).* from public.organizations o where id=(select id from pc where k='org');
insert into public.organization_members(organization_id,user_id,role,active) values((select id from pc where k='ambiguous_org'),(select id from pc where k='provider'),'provider_admin',true);
insert into public.provider_records select (jsonb_populate_record(null::public.provider_records,to_jsonb(r)||jsonb_build_object('id',(select id from pc where k='ambiguous_record'),'organization_id',(select id from pc where k='ambiguous_org')))).* from public.provider_records r where organization_id=(select id from pc where k='org') and kind='organization';
insert into public.provider_revisions select (jsonb_populate_record(null::public.provider_revisions,to_jsonb(v)||jsonb_build_object('record_id',(select id from pc where k='ambiguous_record'),'organization_id',(select id from pc where k='ambiguous_org')))).* from public.provider_revisions v where record_id=(select id from public.provider_records where organization_id=(select id from pc where k='org') and kind='organization');
insert into public.provider_submissions(id,organization_id,status,submitted_by,requires_section_review) values((select id from pc where k='ambiguous_submission'),(select id from pc where k='ambiguous_org'),'published',(select id from pc where k='provider'),false);
insert into public.provider_submission_items(submission_id,record_id,revision) select (select id from pc where k='ambiguous_submission'),id,published_revision from public.provider_records where id=(select id from pc where k='ambiguous_record');
select pg_temp.pc_assert(private.inquiry_connected_org('hospital',(select id from pc where k='hospital'))=(select id from pc where k='org'),'an unauthorized legacy duplicate cannot override the explicitly reviewed canonical owner');
update public.provider_records set status='archived' where id=(select id from pc where k='ambiguous_record');
select pg_temp.pc_assert(private.inquiry_connected_org('hospital',(select id from pc where k='hospital'))=(select id from pc where k='org'),'historical archived canonical link cannot cause mapping ambiguity');
rollback;
\echo Provider coordination regression checks passed; local fixtures rolled back.
