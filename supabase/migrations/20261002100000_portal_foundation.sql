-- Operational tenancy and immutable review history. Public catalog tables are reused.
create table public.portal_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true, notification_preferences jsonb not null default '{"in_app":true}',
  updated_at timestamptz not null default now()
);
create table public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('support_agent','support_manager','admin','super_admin')),
  active boolean not null default true, granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 180),
  legal_name text not null default '', provider_type text not null check(provider_type in ('hospital','clinic','healthcare_organization')),
  source_kind text not null check(source_kind in ('first_party','synthetic')),
  status text not null default 'active' check(status in ('active','suspended','archived')),
  hospital_id uuid unique references public.hospitals(id), created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
  role text not null check(role in ('provider_admin','provider_editor')), active boolean not null default true,
  joined_at timestamptz not null default now(), last_active_at timestamptz, primary key(organization_id,user_id)
);
create table public.organization_invites (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  email text not null, role text not null check(role in ('provider_admin','provider_editor')),
  invited_by uuid not null references auth.users(id), accepted_by uuid references auth.users(id),
  expires_at timestamptz not null default(now()+interval '7 days'), revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.provider_records (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  kind text not null check(kind in ('organization','location','specialty','treatment','doctor','facility','accreditation','package','international_service')),
  name text not null check(length(name) between 1 and 180), data jsonb not null check(jsonb_typeof(data)='object'),
  revision integer not null default 1 check(revision>0), published_revision integer,
  status text not null default 'draft' check(status in ('draft','submitted','under_review','changes_requested','approved','published','expired','archived','rejected')),
  canonical_id uuid, created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,id), check(published_revision is null or published_revision<=revision)
);
create unique index provider_one_profile on public.provider_records(organization_id) where kind='organization';
create index provider_records_organization_kind on public.provider_records(organization_id,kind,status);
create table public.provider_revisions (
  record_id uuid not null references public.provider_records(id), revision integer not null,
  organization_id uuid not null references public.organizations(id), name text not null, data jsonb not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), primary key(record_id,revision)
);
alter table public.provider_records add constraint provider_published_revision foreign key(id,published_revision) references public.provider_revisions(record_id,revision) deferrable initially deferred;
create table public.provider_submissions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  status text not null default 'submitted' check(status in ('submitted','under_review','changes_requested','approved','rejected','published','archived')),
  submitted_by uuid not null references auth.users(id), reviewer_id uuid references auth.users(id),
  message text not null default '', review_message text not null default '',
  submitted_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.provider_submission_items (
  submission_id uuid not null references public.provider_submissions(id), record_id uuid not null,
  revision integer not null, primary key(submission_id,record_id),
  foreign key(record_id,revision) references public.provider_revisions(record_id,revision)
);
create table public.provider_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  record_id uuid, name text not null, document_type text not null check(document_type in ('license','accreditation','certificate','package','official_information','supporting_evidence','profile_image')),
  storage_path text not null unique, mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check(size_bytes between 1 and 3145728), expires_on date,
  status text not null default 'uploaded' check(status in ('uploaded','under_review','approved','rejected','expired','archived')),
  review_message text not null default '', uploaded_by uuid not null references auth.users(id), reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,record_id) references public.provider_records(organization_id,id)
);
create table public.provider_field_reviews (
  sequence bigint generated always as identity unique,
  id uuid primary key default gen_random_uuid(), record_id uuid not null, revision integer not null,
  organization_id uuid not null references public.organizations(id), field text not null,
  status text not null check(status in ('approved','verified','needs_confirmation','conflicting','rejected','stale','not_applicable')),
  evidence text not null default '', source_url text, document_id uuid references public.provider_documents(id),
  expires_on date, reviewed_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(record_id,revision) references public.provider_revisions(record_id,revision),
  check(status<>'verified' or (length(evidence)>=10 and (source_url is not null or document_id is not null))),
  check(source_url is null or source_url ~ '^https://[^[:space:]]+$')
);
create table public.portal_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, body text not null default '', resource_type text not null, resource_id uuid,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index portal_notifications_user on public.portal_notifications(user_id,created_at desc);
create table public.support_cases (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.profiles(id),
  organization_id uuid references public.organizations(id), source_case_id uuid references public.cases(id),
  conversation_id uuid references public.conversations(id), document_workspace_id uuid references public.document_workspaces(id),
  title text not null check(length(title) between 3 and 180), description text not null default '',
  case_type text not null default 'coordination' check(case_type in ('coordination','provider','documents','account','other')),
  status text not null default 'open' check(status in ('open','in_progress','waiting_patient','waiting_provider','escalated','resolved','closed')),
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  assigned_to uuid references auth.users(id), due_at timestamptz, escalation_reason text,
  share_conversation boolean not null default false, share_documents boolean not null default false,
  share_with_provider boolean not null default false, consent_granted_at timestamptz not null,
  consent_revoked_at timestamptz, revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index support_cases_queue on public.support_cases(assigned_to,status,priority,updated_at desc);
create table public.support_case_events (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id),
  actor_id uuid not null references auth.users(id), action text not null, summary text not null,
  visibility text not null check(visibility in ('internal','patient','provider','shared')),
  created_at timestamptz not null default now()
);
create table public.support_case_messages (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id),
  actor_id uuid not null references auth.users(id), body text not null check(length(body) between 1 and 8000),
  visibility text not null check(visibility in ('internal','patient','provider','shared')),
  created_at timestamptz not null default now()
);
create table public.support_tasks (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.support_cases(id),
  title text not null check(length(title) between 3 and 180), assigned_to uuid references auth.users(id),
  due_at timestamptz, priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  status text not null default 'open' check(status in ('open','in_progress','completed','cancelled')),
  created_by uuid not null references auth.users(id), revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_messages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id), body text not null check(length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);
create table public.portal_verification_checks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  initiated_by uuid not null references auth.users(id), provider_id uuid not null,
  report jsonb not null check(jsonb_typeof(report)='object'), created_at timestamptz not null default now()
);
create table public.portal_settings (
  key text primary key check(key in ('provider_required_fields','publication_requires_identity_evidence')),
  value jsonb not null, updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
insert into public.portal_settings(key,value) values ('provider_required_fields','["name","description","cityId","email","phone"]'),('publication_requires_identity_evidence','true');
alter table public.audit_events add column organization_id uuid references public.organizations(id),
  add column actor_role text, add column old_value jsonb, add column new_value jsonb;

create function private.portal_active() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and not exists(select 1 from public.portal_accounts where user_id=auth.uid() and not active);
$$;
create function private.portal_role() returns text language sql stable security definer set search_path='' as $$
  select role from public.staff_roles where user_id=auth.uid() and active and private.portal_active();
$$;
create function private.portal_admin() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.portal_role() in ('admin','super_admin'),false);
$$;
create function private.portal_manager() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.portal_role() in ('support_manager','admin','super_admin'),false);
$$;
create function private.portal_member(p_org uuid,p_admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
    where m.organization_id=p_org and m.user_id=auth.uid() and m.active and o.status='active' and (not p_admin or m.role='provider_admin'));
$$;
create function private.portal_case_access(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_active() and exists(select 1 from public.support_cases c where c.id=p_case and
    (c.patient_id=auth.uid() or (c.consent_revoked_at is null and (private.portal_manager()
      or (private.portal_role()='support_agent' and c.assigned_to=auth.uid())
      or (c.share_with_provider and private.portal_member(c.organization_id))))));
$$;
create function private.portal_case_staff(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_case_access(p_case) and coalesce(private.portal_role() in ('support_agent','support_manager','admin','super_admin'),false);
$$;
create function private.portal_case_visibility(p_case uuid,p_visibility text) returns boolean language sql stable security definer set search_path='' as $$
  select private.portal_case_access(p_case) and (private.portal_case_staff(p_case) or p_visibility='shared'
    or (p_visibility='patient' and exists(select 1 from public.support_cases where id=p_case and patient_id=auth.uid()))
    or (p_visibility='provider' and exists(select 1 from public.support_cases where id=p_case and private.portal_member(organization_id))));
$$;
create function private.portal_audit(p_action text,p_entity text,p_id uuid,p_org uuid,p_old jsonb default null,p_new jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,organization_id,old_value,new_value)
  values(auth.uid(),'staff',coalesce(private.portal_role(),(select role from public.organization_members where user_id=auth.uid() and organization_id=p_org and active),'patient'),p_action,p_entity,p_id,p_org,p_old,p_new);
end;$$;
create function private.portal_notify_org(p_org uuid,p_title text,p_body text,p_type text,p_id uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.portal_notifications(user_id,title,body,resource_type,resource_id)
  select m.user_id,p_title,p_body,p_type,p_id from public.organization_members m where m.organization_id=p_org and m.active
    and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and (not a.active or a.notification_preferences->>'in_app'='false'));
$$;
create function private.portal_notify_staff(p_title text,p_body text,p_type text,p_id uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.portal_notifications(user_id,title,body,resource_type,resource_id)
  select s.user_id,p_title,p_body,p_type,p_id from public.staff_roles s where s.active and s.role in ('admin','super_admin')
    and not exists(select 1 from public.portal_accounts a where a.user_id=s.user_id and (not a.active or a.notification_preferences->>'in_app'='false'));
$$;

-- A security-definer command is the sole authenticated write path. No direct CRUD grants.
do $$declare t text;begin foreach t in array array['portal_accounts','staff_roles','organizations','organization_members','organization_invites','provider_records','provider_revisions','provider_submissions','provider_submission_items','provider_documents','provider_field_reviews','portal_notifications','support_cases','support_case_events','support_case_messages','support_tasks','organization_messages','portal_verification_checks','portal_settings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
end loop;end;$$;
create policy portal_accounts_read on public.portal_accounts for select to authenticated using(user_id=auth.uid() or private.portal_admin());
create policy staff_roles_read on public.staff_roles for select to authenticated using(user_id=auth.uid() or private.portal_admin() or (private.portal_manager() and role in ('support_agent','support_manager')));
create policy organizations_read on public.organizations for select to authenticated using(private.portal_admin() or private.portal_member(id) or exists(select 1 from public.support_cases c where c.organization_id=organizations.id and private.portal_case_staff(c.id)));
create policy organization_members_read on public.organization_members for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy organization_invites_read on public.organization_invites for select to authenticated using(private.portal_admin() or private.portal_member(organization_id,true));
create policy provider_records_read on public.provider_records for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy provider_revisions_read on public.provider_revisions for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy provider_submissions_read on public.provider_submissions for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy provider_submission_items_read on public.provider_submission_items for select to authenticated using(exists(select 1 from public.provider_submissions s where s.id=submission_id and (private.portal_admin() or private.portal_member(s.organization_id))));
create policy provider_documents_read on public.provider_documents for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy provider_field_reviews_read on public.provider_field_reviews for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy notifications_read on public.portal_notifications for select to authenticated using(user_id=auth.uid() and private.portal_active());
create policy support_cases_read on public.support_cases for select to authenticated using(private.portal_case_access(id));
create policy support_events_read on public.support_case_events for select to authenticated using(private.portal_case_visibility(case_id,visibility));
create policy support_messages_read on public.support_case_messages for select to authenticated using(private.portal_case_visibility(case_id,visibility));
create policy support_tasks_read on public.support_tasks for select to authenticated using(private.portal_case_staff(case_id));
create policy organization_messages_read on public.organization_messages for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy portal_verification_read on public.portal_verification_checks for select to authenticated using(private.portal_admin() or private.portal_member(organization_id));
create policy portal_settings_read on public.portal_settings for select to authenticated using(private.portal_admin());
grant select on public.audit_events to authenticated;
create policy portal_audit_read on public.audit_events for select to authenticated using(private.portal_admin() or (organization_id is not null and private.portal_member(organization_id)) or (entity_type='support_case' and private.portal_case_staff(entity_id)));

create trigger revisions_immutable before update or delete on public.provider_revisions for each row execute function private.block_audit_mutation();
create trigger field_reviews_immutable before update or delete on public.provider_field_reviews for each row execute function private.block_audit_mutation();
create trigger support_events_immutable before update or delete on public.support_case_events for each row execute function private.block_audit_mutation();
create trigger support_messages_immutable before update or delete on public.support_case_messages for each row execute function private.block_audit_mutation();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('provider-documents','provider-documents',false,3145728,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
-- Files are read/downloaded by the guarded server route. There are deliberately no anon/authenticated object policies.

create function public.portal_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  return jsonb_build_object('userId',auth.uid(),'role',private.portal_role(),'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role,'status',o.status,'sourceKind',o.source_kind)) from public.organizations o join public.organization_members m on m.organization_id=o.id where m.user_id=auth.uid() and m.active),'[]'::jsonb));
end;$$;
create function public.portal_account_active() returns boolean language sql stable security definer set search_path='' as $$select private.portal_active();$$;

revoke all on function private.portal_active(),private.portal_role(),private.portal_admin(),private.portal_manager(),private.portal_member(uuid,boolean),private.portal_case_access(uuid),private.portal_case_staff(uuid),private.portal_case_visibility(uuid,text),private.portal_audit(text,text,uuid,uuid,jsonb,jsonb),private.portal_notify_org(uuid,text,text,text,uuid),private.portal_notify_staff(text,text,text,uuid) from public;
grant execute on function private.portal_active(),private.portal_role(),private.portal_admin(),private.portal_manager(),private.portal_member(uuid,boolean),private.portal_case_access(uuid),private.portal_case_staff(uuid),private.portal_case_visibility(uuid,text) to authenticated;
revoke all on function public.portal_context(),public.portal_account_active() from public,anon;
grant execute on function public.portal_context(),public.portal_account_active() to authenticated;
