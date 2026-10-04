-- Run only against a disposable validation database with scripts/pg-validation-bootstrap.sql.
begin;
insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003');

set role anon;
do $$ begin
  if (select count(*) from public.treatments) <> 0 then raise exception 'QA treatment leaked'; end if;
  if (select count(*) from public.hospitals) <> 0 then raise exception 'QA hospital leaked'; end if;
  if (select count(*) from public.doctors) <> 0 then raise exception 'QA doctor leaked'; end if;
  if (select count(*) from public.packages) <> 0 then raise exception 'QA package leaked'; end if;
  if (select count(*) from public.healthcare_services) <> 0 then raise exception 'QA service leaked'; end if;
  if (select count(*) from public.search_catalog_candidates('knee', 'knee-replacement')) <> 0 then raise exception 'QA search leaked'; end if;
  if has_table_privilege('anon', 'public.cases', 'SELECT') then raise exception 'Anonymous case privilege exists'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into public.cases(id, owner_id, title) values (
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Synthetic validation case');
do $$ begin
  if (select count(*) from public.cases) <> 1 then raise exception 'Owner cannot read case'; end if;
  if (select count(*) from public.case_status_history where case_id = '20000000-0000-0000-0000-000000000001') <> 1 then raise exception 'Case status event missing'; end if;
end $$;
insert into public.case_members(case_id, user_id, role, granted_by) values (
  '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'caregiver', '10000000-0000-0000-0000-000000000001');
insert into public.consents(subject_id, case_id, consent_type, purpose, decision, granted_at, version, source) values (
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'provider_sharing', 'Test consent scoping', 'granted', now(), 'v1', 'validation');
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.cases) <> 1 then raise exception 'Caregiver cannot read granted case'; end if;
  if (select count(*) from public.case_members) <> 1 then raise exception 'Caregiver cannot read memberships'; end if;
  if (select count(*) from public.consents) <> 1 then raise exception 'Caregiver cannot read case consent'; end if;
  if has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then raise exception 'Patient can insert audit events'; end if;
  if has_table_privilege('authenticated', 'public.agent_actions', 'INSERT') then raise exception 'Patient can insert agent actions'; end if;
  if has_table_privilege('authenticated', 'public.agent_runs', 'UPDATE') then raise exception 'Patient can mutate agent runs'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from public.cases) <> 0 then raise exception 'Unauthorized user read another case'; end if;
  if (select count(*) from public.case_members) <> 0 then raise exception 'Unauthorized user read memberships'; end if;
  if (select count(*) from public.consents) <> 0 then raise exception 'Unauthorized user read consent'; end if;
  if (select count(*) from public.case_documents) <> 0 then raise exception 'Unauthorized user read documents'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
update public.case_members set revoked_at = now() where case_id = '20000000-0000-0000-0000-000000000001';
reset role;
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.cases) <> 0 then raise exception 'Revoked caregiver retained case access'; end if;
end $$;
reset role;
rollback;
