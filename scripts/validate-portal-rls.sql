-- Disposable local transaction. Exercise authenticated RPCs and real PostgreSQL RLS.
\set ON_ERROR_STOP on
begin;
create temporary table portal_test_ids(k text primary key,id uuid default gen_random_uuid());
insert into portal_test_ids(k) values('a'),('b'),('editor'),('support'),('admin'),('patient');
insert into auth.users(id,email) select id,'portal-'||k||'@qa.invalid' from portal_test_ids;
insert into public.staff_roles(user_id,role) select id,case k when 'support' then 'support_agent' else 'super_admin' end from portal_test_ids where k in ('support','admin');
grant select,insert,update on portal_test_ids to authenticated;
create function pg_temp.portal_assert(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end;$$;
create function pg_temp.portal_denied(stmt text,expected text) returns void language plpgsql as $$begin
  begin execute stmt;exception when others then if position(expected in sqlerrm)>0 then return;else raise;end if;end;
  raise exception 'FAIL: operation unexpectedly permitted: %',stmt;
end;$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from portal_test_ids where k='a'),true);
insert into portal_test_ids(k,id) select 'org_a',(public.portal_command('create_organization','{"name":"QA ONLY Provider A","providerType":"hospital","sourceKind":"synthetic"}') ->>'id')::uuid;
insert into portal_test_ids(k,id) select 'record_a',(public.portal_command('save_record',jsonb_build_object('organizationId',(select id from portal_test_ids where k='org_a'),'kind','organization','name','QA ONLY Provider A','data','{}'::jsonb))->>'id')::uuid;
select pg_temp.portal_assert((select count(*)=1 from public.organizations),'provider can read its own organization');
select pg_temp.portal_denied('update public.provider_records set status=''published''','permission denied');
select pg_temp.portal_denied('select public.portal_command(''set_staff_role'',''{}'')','PORTAL_DENIED');
select pg_temp.portal_denied(format('select public.portal_command(''save_record'',%L)',jsonb_build_object('organizationId',(select id from portal_test_ids where k='org_a'),'recordId',(select id from portal_test_ids where k='record_a'),'kind','organization','name','QA changed','data','{}'::jsonb,'expectedRevision',0)::text),'PORTAL_CONFLICT');
select set_config('request.jwt.claim.sub',(select id::text from portal_test_ids where k='b'),true);
insert into portal_test_ids(k,id) select 'org_b',(public.portal_command('create_organization','{"name":"QA ONLY Provider B","providerType":"clinic","sourceKind":"synthetic"}') ->>'id')::uuid;
select pg_temp.portal_assert((select count(*)=0 from public.provider_records),'Provider B cannot see Provider A drafts');
select pg_temp.portal_denied(format('select public.portal_command(''save_record'',%L)',jsonb_build_object('organizationId',(select id from portal_test_ids where k='org_a'),'recordId',(select id from portal_test_ids where k='record_a'),'kind','organization','name','Illegal cross-tenant edit','data','{}'::jsonb,'expectedRevision',1)::text),'PORTAL_DENIED');
reset role;
insert into public.organization_members(organization_id,user_id,role) values((select id from portal_test_ids where k='org_a'),(select id from portal_test_ids where k='editor'),'provider_editor');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from portal_test_ids where k='editor'),true);
select pg_temp.portal_denied(format('select public.portal_command(''invite_member'',%L)',jsonb_build_object('organizationId',(select id from portal_test_ids where k='org_a'),'email','invited@qa.invalid','role','provider_admin')::text),'PORTAL_DENIED');
select pg_temp.portal_assert((select count(*)=1 from public.provider_records),'assigned editor can read own organization');
select set_config('request.jwt.claim.sub',(select id::text from portal_test_ids where k='support'),true);
select pg_temp.portal_assert((select count(*)=0 from public.provider_records),'support role alone cannot read provider drafts');
select pg_temp.portal_assert((select count(*)=0 from public.portal_settings),'support cannot read admin settings');
select set_config('request.jwt.claim.sub',(select id::text from portal_test_ids where k='patient'),true);
select pg_temp.portal_assert((select count(*)=0 from public.provider_records),'patient cannot read drafts');
select pg_temp.portal_denied('select public.bootstrap_portal_super_admin(''portal-patient@qa.invalid'')','permission denied');
select set_config('request.jwt.claim.sub',(select id::text from portal_test_ids where k='admin'),true);
select pg_temp.portal_assert((select count(*)=2 from public.organizations),'admin can inspect authorized organizations');
select pg_temp.portal_denied('delete from public.audit_events','permission denied');
select pg_temp.portal_assert((select count(*)>=3 from public.audit_events where event_name in ('organization.created','record.saved')),'important mutations audited');
reset role;
set local role anon;
select pg_temp.portal_denied('select * from public.provider_records','permission denied');
select pg_temp.portal_denied('select public.portal_command(''create_organization'',''{}'')','permission denied');
reset role;
rollback;
\echo Portal tenant, role, direct-write, revision and audit checks passed.
