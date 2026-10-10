-- No invented retention period or automatic expiry. Explicit owner removal only.
create table public.document_deletion_jobs (
 id uuid primary key default gen_random_uuid(),security_job_id uuid not null unique references public.document_security_jobs(id),
 workspace_id uuid not null references public.document_workspaces(id),requested_by uuid not null references auth.users(id),
 state text not null default 'queued' check(state in ('queued','deleting','cleanup_failed','held','deleted')),
 attempts integer not null default 0 check(attempts between 0 and 3),lease uuid,lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),failure_category text,requested_at timestamptz not null default now(),completed_at timestamptz,
 check((state='deleted')=(completed_at is not null))
);
create table public.document_retention_holds (
 security_job_id uuid primary key references public.document_security_jobs(id),active boolean not null,
 category text not null check(category in ('legal_review','operational_review','security_incident')),
 applied_by uuid not null references auth.users(id),applied_at timestamptz not null default now(),released_by uuid references auth.users(id),released_at timestamptz
);
alter table public.document_deletion_jobs enable row level security;
alter table public.document_retention_holds enable row level security;
revoke all on public.document_deletion_jobs,public.document_retention_holds from public,anon,authenticated;
grant select,insert,update on public.document_deletion_jobs,public.document_retention_holds to service_role;
create index document_deletion_queue on public.document_deletion_jobs(next_attempt_at) where state in ('queued','deleting','cleanup_failed','held');
-- Restore operators set this while traffic is isolated, before reconciliation.
create table private.document_recovery_gate(id boolean primary key default true check(id),blocked boolean not null default false);
insert into private.document_recovery_gate values(true,false);
revoke all on private.document_recovery_gate from public,anon,authenticated;
grant select,update on private.document_recovery_gate to service_role;
create function private.document_lifecycle_audit(p_id uuid,p_actor uuid,p_state text) returns void language sql security definer set search_path='' as $$
 insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,metadata)
 values(p_actor,case when p_actor is null then 'system' when exists(select 1 from public.staff_roles where user_id=p_actor and active) then 'staff' else 'patient' end,'document_lifecycle','document.deletion_state','document_deletion',p_id,jsonb_build_object('state',p_state));
$$;
revoke all on function private.document_lifecycle_audit(uuid,uuid,text) from public,anon,authenticated;
create function private.document_deletion_enqueue(p_security uuid,p_workspace uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare jid uuid;j public.document_security_jobs;q public.document_deletion_jobs;begin
 select * into q from public.document_deletion_jobs where security_job_id=p_security for update;
 select * into j from public.document_security_jobs where id=p_security for update;
 if not found then raise exception 'DOCUMENT_DELETION_UNREGISTERED';end if;
 if exists(select 1 from public.document_retention_holds where security_job_id=j.id and active) then raise exception 'DOCUMENT_RETENTION_HOLD';end if;
 if q.id is null then
  insert into public.document_deletion_jobs(security_job_id,workspace_id,requested_by) values(j.id,p_workspace,p_actor) returning id into jid;
  perform public.document_security_retire(j.bucket,j.object_path);
  perform private.document_lifecycle_audit(jid,p_actor,'queued');
 else select id into jid from public.document_deletion_jobs where id=q.id and workspace_id=p_workspace and requested_by=p_actor;
  if jid is null then raise exception 'DOCUMENT_DELETION_SCOPE';end if;
 end if;return jid;
end;$$;
revoke all on function private.document_deletion_enqueue(uuid,uuid,uuid) from public,anon,authenticated;
-- Metadata removal and cleanup intent commit together. A hold rolls back both.
create function private.document_workspace_removal() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb;jid uuid;path text;begin
 for d in select n from jsonb_array_elements(new.data->'documents') n where n->>'uploadStatus'='removed'
  and exists(select 1 from jsonb_array_elements(old.data->'documents') o where o->>'id'=n->>'id' and o->>'uploadStatus'<>'removed') loop
  path:=new.owner_id::text||'/'||new.id::text||'/'||(d->>'id')||case d->>'mimeType' when 'application/pdf' then '.pdf' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else null end;
  select id into jid from public.document_security_jobs where bucket='care-documents' and object_path=path;
  if jid is null then jid:=(public.document_security_register('care-documents',path,d->>'checksum',(d->>'size')::integer,d->>'mimeType')->>'id')::uuid;end if;
  perform private.document_deletion_enqueue(jid,new.id,new.owner_id);
 end loop;return new;
end;$$;
revoke all on function private.document_workspace_removal() from public,anon,authenticated;
create trigger document_workspace_removal before update on public.document_workspaces for each row execute function private.document_workspace_removal();
create function public.document_deletion_request(p_workspace uuid,p_document uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.document_workspaces;j public.document_security_jobs;d jsonb;jid uuid;path text;begin
 select * into w from public.document_workspaces where id=p_workspace and owner_id=p_actor for update;
 if not found or exists(select 1 from public.portal_accounts where user_id=p_actor and not active) then raise exception 'DOCUMENT_DELETION_SCOPE';end if;
 select value into d from jsonb_array_elements(w.data->'documents') where value->>'id'=p_document::text;
 if d is not null and d->>'uploadStatus'<>'removed' then raise exception 'DOCUMENT_DELETION_NOT_REMOVED';end if;
 if d is not null then
  path:=p_actor::text||'/'||w.id::text||'/'||p_document::text||case d->>'mimeType' when 'application/pdf' then '.pdf' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else null end;
  if path is null then raise exception 'DOCUMENT_DELETION_UNREGISTERED';end if;
  -- Legacy removed metadata may predate scan registration. This only registers
  -- its immutable identity for retirement; it never grants a clean verdict.
  if not exists(select 1 from public.document_security_jobs where bucket='care-documents' and object_path=path) then
   perform public.document_security_register('care-documents',path,d->>'checksum',(d->>'size')::integer,d->>'mimeType');
  end if;
 end if;
 -- Missing metadata is only an upload that failed its metadata commit; its registered
 -- identity must still belong to this exact owner/workspace/document path.
 if d is null and (select count(*) from public.document_security_jobs where bucket='care-documents' and object_path in
  (p_actor::text||'/'||w.id::text||'/'||p_document::text||'.pdf',p_actor::text||'/'||w.id::text||'/'||p_document::text||'.png',p_actor::text||'/'||w.id::text||'/'||p_document::text||'.jpg'))<>1 then raise exception 'DOCUMENT_DELETION_UNREGISTERED';end if;
 select * into j from public.document_security_jobs where bucket='care-documents' and (path is null or object_path=path) and object_path in
  (p_actor::text||'/'||w.id::text||'/'||p_document::text||'.pdf',p_actor::text||'/'||w.id::text||'/'||p_document::text||'.png',p_actor::text||'/'||w.id::text||'/'||p_document::text||'.jpg');
 if not found then raise exception 'DOCUMENT_DELETION_UNREGISTERED';end if;
 jid:=private.document_deletion_enqueue(j.id,w.id,p_actor);
 return (select jsonb_build_object('id',id,'state',state,'attempts',attempts) from public.document_deletion_jobs where id=jid);
end;$$;
create function public.document_deletion_claim(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.document_deletion_jobs;j public.document_security_jobs;begin
 if p_id is not null then
  select * into q from public.document_deletion_jobs where id=p_id and state='deleted';
  if found then return jsonb_build_object('id',q.id,'state','deleted');end if;
 end if;
 for q in update public.document_deletion_jobs set state='cleanup_failed',failure_category='lease_expired',lease_until=null
  where state='deleting' and lease_until<=now() and attempts>=3 returning * loop
  perform private.document_lifecycle_audit(q.id,null,'cleanup_failed');end loop;
 select * into q from public.document_deletion_jobs where (p_id is null or id=p_id) and attempts<3 and next_attempt_at<=now()
  and (state in ('queued','cleanup_failed','held') or (state='deleting' and lease_until<=now())) order by next_attempt_at,id for update skip locked limit 1;
 if not found then return null;end if;
 select * into j from public.document_security_jobs where id=q.security_job_id for update;
 if exists(select 1 from public.document_retention_holds where security_job_id=j.id and active) then
  update public.document_deletion_jobs set state='held',failure_category=null,next_attempt_at=now()+interval '30 seconds' where id=q.id;
  if q.state<>'held' then perform private.document_lifecycle_audit(q.id,null,'held');end if;return null;
 end if;
 update public.document_deletion_jobs set state='deleting',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',failure_category=null where id=q.id returning * into q;
 perform private.document_lifecycle_audit(q.id,null,'deleting');
 return jsonb_build_object('id',q.id,'lease',q.lease,'bucket',j.bucket,'path',j.object_path);
end;$$;
create function public.document_deletion_result(p_id uuid,p_lease uuid,p_absent boolean,p_category text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.document_deletion_jobs;begin
 select * into q from public.document_deletion_jobs where id=p_id for update;
 if p_absent is null then raise exception 'DOCUMENT_DELETION_RESULT';end if;
 if not found or q.lease is distinct from p_lease then raise exception 'DOCUMENT_DELETION_LEASE';end if;
 if q.state='deleted' and p_absent then return jsonb_build_object('id',q.id,'state',q.state);end if;
 if q.state='cleanup_failed' and not p_absent and q.failure_category is not distinct from p_category then return jsonb_build_object('id',q.id,'state',q.state);end if;
 if q.state<>'deleting' or q.lease_until<=now() then raise exception 'DOCUMENT_DELETION_LEASE';end if;
 if p_absent and exists(select 1 from storage.objects o join public.document_security_jobs j on j.bucket=o.bucket_id and j.object_path=o.name where j.id=q.security_job_id) then raise exception 'DOCUMENT_DELETION_OBJECT_REMAINS';end if;
 if not p_absent and coalesce(p_category,'') not in ('storage_unavailable','object_remains') then raise exception 'DOCUMENT_DELETION_RESULT';end if;
 update public.document_deletion_jobs set state=case when p_absent then 'deleted' else 'cleanup_failed' end,completed_at=case when p_absent then now() end,
  failure_category=case when not p_absent then p_category end,lease_until=null,next_attempt_at=now()+make_interval(secs=>30*power(2,q.attempts-1)::integer) where id=q.id;
 perform private.document_lifecycle_audit(q.id,null,case when p_absent then 'deleted' else 'cleanup_failed' end);
 return jsonb_build_object('id',q.id,'state',case when p_absent then 'deleted' else 'cleanup_failed' end);
end;$$;
-- A hold cannot be installed once any deletion attempt has started: reject instead
-- of falsely assuring preservation while a Storage call may already be in flight.
create function public.document_retention_hold(p_security uuid,p_active boolean,p_category text,p_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;h public.document_retention_holds;begin
 if not private.portal_active() or private.portal_role() is distinct from 'super_admin' or p_confirmed is distinct from true then raise exception 'PORTAL_DENIED';end if;
 if p_category not in ('legal_review','operational_review','security_incident') or p_active is null then raise exception 'DOCUMENT_HOLD_INVALID';end if;
 perform 1 from public.document_deletion_jobs where security_job_id=p_security for update;
 select * into j from public.document_security_jobs where id=p_security for update;
 -- A job can appear while waiting for the immutable identity lock. Fail safely
 -- rather than invert locks against a worker already issuing its claim.
 perform 1 from public.document_deletion_jobs where security_job_id=p_security for update nowait;
 if j.id is null or j.bucket<>'care-documents' or not exists(select 1 from public.document_workspaces w where j.object_path like w.owner_id::text||'/'||w.id::text||'/%')
 or exists(select 1 from public.document_deletion_jobs where security_job_id=j.id and attempts>0) then raise exception 'DOCUMENT_HOLD_TOO_LATE';end if;
 select * into h from public.document_retention_holds where security_job_id=j.id;
 if h.active is not distinct from p_active then return jsonb_build_object('active',p_active);end if;
 if not p_active and h.security_job_id is null then raise exception 'DOCUMENT_HOLD_INVALID';end if;
 insert into public.document_retention_holds(security_job_id,active,category,applied_by) values(j.id,p_active,p_category,auth.uid())
 on conflict(security_job_id) do update set active=p_active,category=p_category,applied_by=case when p_active then auth.uid() else document_retention_holds.applied_by end,
  applied_at=case when p_active then now() else document_retention_holds.applied_at end,released_by=case when not p_active then auth.uid() end,released_at=case when not p_active then now() end;
 if not p_active then update public.document_deletion_jobs set next_attempt_at=now() where security_job_id=j.id and state='held';end if;
 perform private.document_lifecycle_audit(j.id,auth.uid(),case when p_active then 'hold_active' else 'hold_released' end);
 return jsonb_build_object('active',p_active);
end;$$;
create function public.document_deletion_queue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.portal_active() or private.portal_role() is distinct from 'super_admin' then raise exception 'PORTAL_DENIED';end if;
 return coalesce((select jsonb_agg(v) from (select id,state,attempts,failure_category,requested_at,completed_at from public.document_deletion_jobs order by requested_at desc limit 100)v),'[]');
end;$$;
create or replace function private.document_security_clean(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select not (select blocked from private.document_recovery_gate where id) and exists(select 1 from public.document_security_jobs j
 where j.bucket=p_bucket and j.object_path=p_path and j.state='clean' and j.policy_version='clamav-v1'
 and not exists(select 1 from public.document_deletion_jobs q where q.security_job_id=j.id));
$$;
revoke all on function public.document_deletion_request(uuid,uuid,uuid),public.document_deletion_claim(uuid),public.document_deletion_result(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.document_deletion_request(uuid,uuid,uuid),public.document_deletion_claim(uuid),public.document_deletion_result(uuid,uuid,boolean,text) to service_role;
revoke all on function public.document_retention_hold(uuid,boolean,text,boolean),public.document_deletion_queue() from public,anon;
grant execute on function public.document_retention_hold(uuid,boolean,text,boolean),public.document_deletion_queue() to authenticated;

-- Import the independently preserved deletion/consent delta first. This function
-- cannot recover requests absent from the snapshot and is never a release switch.
create function public.document_deletion_reconcile() returns integer language plpgsql security definer set search_path='' as $$
declare q public.document_deletion_jobs;n integer:=0;begin
 if (select blocked from private.document_recovery_gate where id) is distinct from true then raise exception 'DOCUMENT_RECOVERY_ISOLATION_REQUIRED';end if;
 for q in select * from public.document_deletion_jobs order by id for update loop
  perform public.document_security_retire(j.bucket,j.object_path) from public.document_security_jobs j where j.id=q.security_job_id and j.failure_category is distinct from 'removed';
  if q.state='deleted' and exists(select 1 from storage.objects o join public.document_security_jobs j on j.bucket=o.bucket_id and j.object_path=o.name where j.id=q.security_job_id) then
   update public.document_deletion_jobs set state='queued',attempts=0,lease=null,lease_until=null,completed_at=null,failure_category=null,next_attempt_at=now() where id=q.id;
   perform private.document_lifecycle_audit(q.id,null,'restore_cleanup_queued');n:=n+1;
  end if;
 end loop;return n;
end;$$;
revoke all on function public.document_deletion_reconcile() from public,anon,authenticated;
grant execute on function public.document_deletion_reconcile() to service_role;
create or replace function private.can_access_case(p_case_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not (select blocked from private.document_recovery_gate where id) and (
 exists(select 1 from public.cases c where c.id=p_case_id and c.owner_id=auth.uid())
 or exists(select 1 from public.case_members m where m.case_id=p_case_id and m.user_id=auth.uid() and m.revoked_at is null));
$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('private.portal_case_access(uuid)'::regprocedure);
 if position('select private.portal_active()' in definition)=0 then raise exception 'Unexpected case access definition';end if;
 -- Preserve the current organization-authority and connected-recipient checks.
 definition:=replace(definition,'select private.portal_active()','select not (select blocked from private.document_recovery_gate where id) and private.portal_active()');
 execute definition;
end;$$;

-- A missing staff role must fail closed, including direct authenticated RPC access.
create or replace function public.document_security_review(p_id uuid default null,p_retry boolean default false,p_confirmed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;begin
 if not private.portal_active() or private.portal_role() is distinct from 'super_admin' then raise exception 'PORTAL_DENIED';end if;
 if p_retry then
  select * into j from public.document_security_jobs where id=p_id for update;
  if not found or not p_confirmed or not j.ready or j.state not in ('scan_failed','quarantined') or j.failure_category='removed' then raise exception 'DOCUMENT_SECURITY_RETRY_DENIED';end if;
  update public.document_security_jobs set state='pending_scan',attempts=0,lease=null,lease_until=null,next_attempt_at=now(),last_result_hash=null,updated_at=now() where id=p_id;
  perform private.portal_audit('document.security_retry','document_security',p_id,null,null,jsonb_build_object('confirmed',true));
 end if;
 return coalesce((select jsonb_agg(v) from (select id,state,attempts,failure_category,engine_version,signature_version,scanned_at,updated_at from public.document_security_jobs order by updated_at desc limit 100) v),'[]');
end;$$;
