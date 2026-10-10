-- Security verdicts are independent of owner-controlled coordination metadata.
create table public.document_security_jobs (
 id uuid primary key default gen_random_uuid(),bucket text not null check(bucket in ('care-documents','provider-documents')),
 object_path text not null check(length(object_path) between 1 and 500),checksum text not null check(checksum~'^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes between 1 and 3145728),mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 state text not null default 'pending_scan' check(state in ('pending_scan','scanning','clean','quarantined','scan_failed')),
 ready boolean not null default false,attempts integer not null default 0 check(attempts between 0 and 3),
 lease uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now(),
 policy_version text not null default 'clamav-v1',engine_version text,signature_version text,signature_at timestamptz,scanned_at timestamptz,
 failure_category text,last_result_hash text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(bucket,object_path),check(state<>'clean' or (scanned_at is not null and engine_version is not null and signature_at is not null))
);
alter table public.document_security_jobs enable row level security;
revoke all on public.document_security_jobs from public,anon,authenticated;
grant all on public.document_security_jobs to service_role;
create index document_security_queue on public.document_security_jobs(next_attempt_at) where ready and state in ('pending_scan','scanning','scan_failed');
create function private.document_security_clean(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.document_security_jobs where bucket=p_bucket and object_path=p_path and state='clean' and policy_version='clamav-v1');
$$;
revoke all on function private.document_security_clean(text,text) from public,anon,authenticated;
grant execute on function private.document_security_clean(text,text) to service_role;
create function private.document_security_audit(p_id uuid,p_state text,p_category text default null) returns void language sql security definer set search_path='' as $$
 insert into public.audit_events(actor_type,actor_role,event_name,entity_type,entity_id,metadata)
 values('system','document_scanner','document.security_state','document_security',p_id,jsonb_build_object('state',p_state,'category',p_category));
$$;
revoke all on function private.document_security_audit(uuid,text,text) from public,anon,authenticated;
create function public.document_security_register(p_bucket text,p_path text,p_checksum text,p_size integer,p_mime text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;begin
 insert into public.document_security_jobs(bucket,object_path,checksum,size_bytes,mime_type) values(p_bucket,p_path,p_checksum,p_size,p_mime) on conflict(bucket,object_path) do nothing returning * into j;
 if found then perform private.document_security_audit(j.id,j.state);else
  select * into j from public.document_security_jobs where bucket=p_bucket and object_path=p_path for update;
  if j.checksum<>p_checksum or j.size_bytes<>p_size or j.mime_type<>p_mime then raise exception 'DOCUMENT_SECURITY_CONFLICT';end if;
 end if;return to_jsonb(j);end;$$;
create function public.document_security_ready(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;begin
 select * into j from public.document_security_jobs where id=p_id for update;
 if not found or not exists(select 1 from storage.objects where bucket_id=j.bucket and name=j.object_path) then raise exception 'DOCUMENT_SECURITY_NOT_STORED';end if;
 update public.document_security_jobs set ready=true,updated_at=now() where id=j.id;
end;$$;
create function public.document_security_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;begin
 -- A lost final attempt must reach a terminal blocked state rather than stay scanning.
 for j in update public.document_security_jobs set state='scan_failed',failure_category='lease_expired',lease_until=null,updated_at=now()
  where state='scanning' and lease_until<=now() and attempts>=3 returning * loop
  perform private.document_security_audit(j.id,'scan_failed','lease_expired');end loop;
 select * into j from public.document_security_jobs where ready and attempts<3 and next_attempt_at<=now()
  and (state='pending_scan' or state='scan_failed' or (state='scanning' and lease_until<=now())) order by next_attempt_at,id for update skip locked limit 1;
 if not found then return null;end if;
 update public.document_security_jobs set state='scanning',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=j.id returning * into j;
 perform private.document_security_audit(j.id,j.state);return to_jsonb(j);end;$$;
create function public.document_security_result(p_id uuid,p_lease uuid,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;s text:=p_result->>'state';rh text:=md5(p_result::text);sig timestamptz;begin
 select * into j from public.document_security_jobs where id=p_id for update;
 if not found or j.lease is distinct from p_lease then raise exception 'DOCUMENT_SECURITY_LEASE';end if;
 if j.state<>'scanning' and j.last_result_hash=rh then return jsonb_build_object('id',j.id,'state',j.state);end if;
 if j.state<>'scanning' or j.lease_until<=now() then raise exception 'DOCUMENT_SECURITY_LEASE';end if;
 if s not in ('clean','quarantined','scan_failed') or p_result->>'checksum' is distinct from j.checksum then raise exception 'DOCUMENT_SECURITY_RESULT';end if;
 if s in ('clean','quarantined') then
  sig:=(p_result->>'signatureAt')::timestamptz;
  if p_result->>'engine' is distinct from 'ClamAV' or coalesce(p_result->>'engineVersion','') !~ '^1\.[0-9]+\.[0-9]+$'
    or coalesce(p_result->>'signatureVersion','') !~ '^[1-9][0-9]{0,11}$' or sig is null or sig>now()+interval '5 minutes' or sig<now()-interval '48 hours'
    or p_result->>'policyVersion' is distinct from 'clamav-v1' then raise exception 'DOCUMENT_SECURITY_RESULT';end if;
 end if;
 if s='scan_failed' and coalesce(p_result->>'category','') not in ('timeout','unavailable','malformed','inconclusive','integrity','invalid_file') then raise exception 'DOCUMENT_SECURITY_RESULT';end if;
 update public.document_security_jobs set state=s,lease_until=null,last_result_hash=rh,scanned_at=case when s in ('clean','quarantined') then now() end,
  engine_version=case when s in ('clean','quarantined') then p_result->>'engineVersion' end,signature_version=case when s in ('clean','quarantined') then p_result->>'signatureVersion' end,signature_at=sig,
  failure_category=case when s='scan_failed' then p_result->>'category' end,next_attempt_at=now()+make_interval(secs=>30*power(2,j.attempts-1)::integer),updated_at=now() where id=j.id;
 perform private.document_security_audit(j.id,s,case when s='scan_failed' then p_result->>'category' end);
 return jsonb_build_object('id',j.id,'state',s);end;$$;
create function public.document_security_assert_clean(p_bucket text,p_path text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;begin
 select * into j from public.document_security_jobs where bucket=p_bucket and object_path=p_path;
 if not found or not private.document_security_clean(p_bucket,p_path) then raise exception 'DOCUMENT_SECURITY_BLOCKED';end if;
 return jsonb_build_object('checksum',j.checksum,'size',j.size_bytes,'mime',j.mime_type);end;$$;
create function public.document_security_retire(p_bucket text,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare jid uuid;begin
 update public.document_security_jobs set state='quarantined',failure_category='removed',lease=null,lease_until=null,ready=false,updated_at=now() where bucket=p_bucket and object_path=p_path returning id into jid;
 if found then perform private.document_security_audit(jid,'quarantined','removed');end if;end;$$;
create function public.document_security_review(p_id uuid default null,p_retry boolean default false,p_confirmed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.document_security_jobs;begin
 if not private.portal_active() or private.portal_role()<>'super_admin' then raise exception 'PORTAL_DENIED';end if;
 if p_retry then
  select * into j from public.document_security_jobs where id=p_id for update;
  if not found or not p_confirmed or not j.ready or j.state not in ('scan_failed','quarantined') or j.failure_category='removed' then raise exception 'DOCUMENT_SECURITY_RETRY_DENIED';end if;
  update public.document_security_jobs set state='pending_scan',attempts=0,lease=null,lease_until=null,next_attempt_at=now(),last_result_hash=null,updated_at=now() where id=p_id;
  perform private.portal_audit('document.security_retry','document_security',p_id,null,null,jsonb_build_object('confirmed',true));
 end if;
 return coalesce((select jsonb_agg(v) from (select id,state,attempts,failure_category,engine_version,signature_version,scanned_at,updated_at from public.document_security_jobs order by updated_at desc limit 100) v),'[]');
end;$$;
-- Consumers cannot read Storage directly, even after a clean verdict. This also
-- denies new signing requests; authenticated proxies preserve current consent.
create policy document_security_no_direct_reads on storage.objects as restrictive for select to anon,authenticated using(bucket_id not in ('care-documents','provider-documents'));
-- Existing command implementation is private, with its public/browser grants removed.
alter function public.inquiry_command(text,jsonb) rename to inquiry_command_before_security;
alter function public.inquiry_command_before_security(text,jsonb) set schema private;
revoke all on function private.inquiry_command_before_security(text,jsonb) from public,anon,authenticated;
create function public.inquiry_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.support_case_documents;begin
 if p_action in ('share_document','review_document') then
  select * into d from public.support_case_documents where id=(p_input->>'documentId')::uuid and case_id=(p_input->>'caseId')::uuid;
  if not found or not private.inquiry_document_access(d.id) then raise exception 'PORTAL_DENIED';end if;
  if not private.document_security_clean('care-documents',d.owner_id::text||'/'||d.case_id::text||'/'||d.id::text||case d.mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end) then raise exception 'DOCUMENT_SECURITY_BLOCKED';end if;
 end if;return private.inquiry_command_before_security(p_action,p_input);end;$$;
revoke all on function public.inquiry_command(text,jsonb) from public,anon;grant execute on function public.inquiry_command(text,jsonb) to authenticated;
alter function public.inquiry_document_delivery(uuid) rename to inquiry_document_delivery_before_security;
alter function public.inquiry_document_delivery_before_security(uuid) set schema private;
revoke all on function private.inquiry_document_delivery_before_security(uuid) from public,anon,authenticated;
create function public.inquiry_document_delivery(p_document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.support_case_documents;begin
 if not private.inquiry_document_access(p_document_id) then raise exception 'PORTAL_DENIED';end if;
 select * into d from public.support_case_documents where id=p_document_id;
 if not private.document_security_clean('care-documents',d.owner_id::text||'/'||d.case_id::text||'/'||d.id::text||case d.mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end) then raise exception 'DOCUMENT_SECURITY_BLOCKED';end if;
 return private.inquiry_document_delivery_before_security(p_document_id);end;$$;
revoke all on function public.inquiry_document_delivery(uuid) from public,anon;grant execute on function public.inquiry_document_delivery(uuid) to authenticated;
-- Only metadata remains visible to the owner while scanning; recipients see clean files.
alter function private.inquiry_document_access(uuid) rename to inquiry_document_access_before_security;
revoke all on function private.inquiry_document_access_before_security(uuid) from public,anon,authenticated;
create function private.inquiry_document_access(p_document uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.inquiry_document_access_before_security(p_document) and exists(select 1 from public.support_case_documents d where d.id=p_document and
  (d.owner_id=auth.uid() or private.document_security_clean('care-documents',d.owner_id::text||'/'||d.case_id::text||'/'||d.id::text||case d.mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end)));
$$;
revoke all on function private.inquiry_document_access(uuid) from public,anon;grant execute on function private.inquiry_document_access(uuid) to authenticated;
-- Existing policies depend on the old OID: replace their predicate explicitly.
alter policy inquiry_documents_read on public.support_case_documents using(private.inquiry_document_access(id));
alter policy inquiry_document_grants_read on public.support_document_grants using(private.inquiry_owner(case_id) or (revoked_at is null and private.inquiry_document_access(document_id)));
alter policy inquiry_private_document_audit on public.audit_events using(event_name not in ('inquiry.support_case_documents.insert','inquiry.support_case_documents.update') or private.inquiry_document_access((new_value->>'rowId')::uuid));
-- No general role may manufacture a scan verdict. Security review never marks clean.
revoke all on function public.document_security_register(text,text,text,integer,text),public.document_security_ready(uuid),public.document_security_claim(),public.document_security_result(uuid,uuid,jsonb),public.document_security_assert_clean(text,text),public.document_security_retire(text,text) from public,anon,authenticated;
grant execute on function public.document_security_register(text,text,text,integer,text),public.document_security_ready(uuid),public.document_security_claim(),public.document_security_result(uuid,uuid,jsonb),public.document_security_assert_clean(text,text),public.document_security_retire(text,text) to service_role;
revoke all on function public.document_security_review(uuid,boolean,boolean) from public,anon;grant execute on function public.document_security_review(uuid,boolean,boolean) to authenticated;
-- Provider evidence review and legacy workspace sharing cannot bypass clean checks.
alter function public.portal_command(text,jsonb) rename to portal_command_before_security;
alter function public.portal_command_before_security(text,jsonb) set schema private;
revoke all on function private.portal_command_before_security(text,jsonb) from public,anon,authenticated;
create function public.portal_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.provider_documents;begin
 if p_action='review_document' and p_input->>'status' in ('under_review','approved') then
  select * into d from public.provider_documents where id=(p_input->>'documentId')::uuid;
  if not found or not(private.portal_admin() or private.portal_org_reviewer(d.organization_id)) then raise exception 'PORTAL_DENIED';end if;
  if not private.document_security_clean('provider-documents',d.storage_path) then raise exception 'DOCUMENT_SECURITY_BLOCKED';end if;
 end if;
 return private.portal_command_before_security(p_action,p_input);end;$$;
revoke all on function public.portal_command(text,jsonb) from public,anon;grant execute on function public.portal_command(text,jsonb) to authenticated;
create function private.document_security_legacy_share() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.share_documents and (TG_OP='INSERT' or not old.share_documents or new.document_workspace_id is distinct from old.document_workspace_id) and
  exists(select 1 from public.document_workspaces w cross join lateral jsonb_array_elements(w.data->'documents') d
   where w.id=new.document_workspace_id and d->>'uploadStatus'='uploaded' and not private.document_security_clean('care-documents',w.owner_id::text||'/'||w.id::text||'/'||(d->>'id')||case d->>'mimeType' when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end)) then raise exception 'DOCUMENT_SECURITY_BLOCKED';end if;
 return new;end;$$;
revoke all on function private.document_security_legacy_share() from public,anon,authenticated;
create trigger document_security_legacy_share before insert or update on public.support_cases for each row execute function private.document_security_legacy_share();
-- Case metadata cannot be supplied to AI for an unscanned physical file.
create policy document_security_case_ai on public.case_documents as restrictive for select to authenticated using(storage_path is not null and private.document_security_clean('care-documents',storage_path));
grant execute on function private.document_security_clean(text,text) to authenticated;
create function public.document_security_states(p_bucket text,p_paths text[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(object_path,state),'{}'::jsonb) from public.document_security_jobs where bucket=p_bucket and object_path=any(p_paths);
$$;
revoke all on function public.document_security_states(text,text[]) from public,anon,authenticated;grant execute on function public.document_security_states(text,text[]) to service_role;
alter function public.inquiry_context(uuid) rename to inquiry_context_before_security;
alter function public.inquiry_context_before_security(uuid) set schema private;
revoke all on function private.inquiry_context_before_security(uuid) from public,anon,authenticated;
create function public.inquiry_context(p_case_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=private.inquiry_context_before_security(p_case_id);
 return jsonb_set(result,'{documents}',coalesce((select jsonb_agg(d||jsonb_build_object('security_state',coalesce((select j.state from public.document_security_jobs j join public.support_case_documents doc on doc.id=(d->>'id')::uuid
   where j.bucket='care-documents' and j.object_path=doc.owner_id::text||'/'||doc.case_id::text||'/'||doc.id::text||case doc.mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end),'not_scanned')))
   from jsonb_array_elements(result->'documents') d),'[]'::jsonb));
end;$$;
revoke all on function public.inquiry_context(uuid) from public,anon;grant execute on function public.inquiry_context(uuid) to authenticated;
