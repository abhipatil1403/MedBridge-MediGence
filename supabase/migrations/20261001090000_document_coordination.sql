-- Administrative document coordination only. No clinical processing or hospital submission.
create table public.document_checklists (
  id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id),
  service_id uuid references public.healthcare_services(id), service_label text,
  source_kind text not null check (source_kind in ('hospital','provider_configured')),
  source_label text not null, source_reference text,
  requirements jsonb not null check (jsonb_typeof(requirements)='array' and jsonb_array_length(requirements) between 1 and 30),
  published boolean not null default false, updated_at timestamptz not null default now()
);
create table public.document_workspaces (
  id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null, hospital_id uuid not null references public.hospitals(id),
  service_id uuid references public.healthcare_services(id), service_label text not null,
  revision integer not null check (revision >= 0), data jsonb not null check (jsonb_typeof(data)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (conversation_id,owner_id) references public.conversations(id,owner_id) on delete cascade,
  unique(conversation_id),
  check ((data->>'id')::uuid=id and (data->>'ownerId')::uuid=owner_id and (data->>'conversationId')::uuid=conversation_id
    and (data->>'hospitalId')::uuid=hospital_id and (data->>'revision')::integer=revision and data->>'serviceLabel'=service_label),
  check (data->'requirements' is not null and jsonb_typeof(data->'requirements')='array'),
  check (data->'documents' is not null and jsonb_typeof(data->'documents')='array')
);
create table public.document_coordination_audit (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.document_workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null, action text not null, snapshot jsonb not null,
  created_at timestamptz not null default now(), unique(workspace_id,revision)
);
alter table public.document_checklists enable row level security;
alter table public.document_workspaces enable row level security;
alter table public.document_coordination_audit enable row level security;
revoke all on public.document_checklists,public.document_workspaces,public.document_coordination_audit from anon,authenticated;
grant select on public.document_checklists,public.document_workspaces,public.document_coordination_audit to authenticated;
grant all on public.document_checklists,public.document_workspaces,public.document_coordination_audit to service_role;
create policy document_checklists_published on public.document_checklists for select to authenticated using(published);
create policy document_workspaces_owner on public.document_workspaces for select to authenticated using(owner_id=auth.uid());
create policy document_audit_owner on public.document_coordination_audit for select to authenticated using(owner_id=auth.uid()
  and exists(select 1 from public.document_workspaces w where w.id=workspace_id and w.owner_id=auth.uid()));
create index document_workspaces_owner_idx on public.document_workspaces(owner_id,updated_at desc);
create index document_checklists_target_idx on public.document_checklists(hospital_id,service_id) where published;

-- Atomic optimistic concurrency plus audit. Browser roles cannot call this function.
create function public.save_document_workspace(p_workspace jsonb,p_expected_revision integer,p_action text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare wid uuid := (p_workspace->>'id')::uuid; old public.document_workspaces;
begin
  select * into old from public.document_workspaces where id=wid for update;
  if found then
    if old.owner_id<>(p_workspace->>'ownerId')::uuid or old.conversation_id<>(p_workspace->>'conversationId')::uuid
      or old.hospital_id<>(p_workspace->>'hospitalId')::uuid or old.service_label<>p_workspace->>'serviceLabel'
      or old.service_id is distinct from (p_workspace->>'serviceId')::uuid then raise exception 'document scope mismatch'; end if;
    if old.revision<>p_expected_revision or (p_workspace->>'revision')::integer<>p_expected_revision+1 then raise exception 'document revision conflict'; end if;
    update public.document_workspaces set data=p_workspace,revision=(p_workspace->>'revision')::integer,updated_at=now() where id=wid;
  else
    if p_expected_revision<>-1 or (p_workspace->>'revision')::integer<>0 then raise exception 'document revision conflict'; end if;
    insert into public.document_workspaces(id,owner_id,conversation_id,hospital_id,service_id,service_label,revision,data)
    values(wid,(p_workspace->>'ownerId')::uuid,(p_workspace->>'conversationId')::uuid,(p_workspace->>'hospitalId')::uuid,
      (p_workspace->>'serviceId')::uuid,p_workspace->>'serviceLabel',0,p_workspace);
  end if;
  insert into public.document_coordination_audit(workspace_id,owner_id,revision,action,snapshot)
  values(wid,(p_workspace->>'ownerId')::uuid,(p_workspace->>'revision')::integer,p_action,p_workspace);
end $$;
revoke all on function public.save_document_workspace(jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.save_document_workspace(jsonb,integer,text) to service_role;

-- Same Supabase Storage, private bucket. No browser writes; uploads pass server validation.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('care-documents','care-documents',false,3145728,array['application/pdf','image/jpeg','image/png']);
create policy care_documents_owner_read on storage.objects for select to authenticated using(
  bucket_id='care-documents' and split_part(name,'/',1)=auth.uid()::text
  and exists(select 1 from public.document_workspaces w where w.owner_id=auth.uid() and w.id::text=split_part(name,'/',2)
    and exists(select 1 from jsonb_array_elements(w.data->'documents') d where d->>'uploadStatus'='uploaded'
      and split_part(split_part(name,'/',3),'.',1)=d->>'id'))
);
