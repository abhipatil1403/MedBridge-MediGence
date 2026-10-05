-- Personal presentation preferences reuse profiles; operational permissions are unchanged.
alter table public.profiles add column currency text not null default 'USD' check(currency in ('USD','AED','AUD','CAD','EUR','GBP','INR','MYR')),
  add column phone text not null default '' check(length(phone)<=30),
  add column country text not null default '' check(length(country)<=80),
  add column city text not null default '' check(length(city)<=100),
  add column preferences_updated_at timestamptz;
update public.profiles set locale=case when split_part(coalesce(locale,'en'),'-',1) in ('en','hi','mr') then split_part(coalesce(locale,'en'),'-',1) else 'en' end;
alter table public.profiles alter column locale set default 'en';
alter table public.profiles alter column locale set not null;
alter table public.profiles add constraint experience_locale check(locale in ('en','hi','mr'));

create table public.saved_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('hospital','doctor','package')),
  hospital_id uuid references public.hospitals(id), doctor_id uuid references public.doctors(id), package_id uuid references public.packages(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((kind='hospital' and hospital_id is not null and doctor_id is null and package_id is null)
    or (kind='doctor' and doctor_id is not null and hospital_id is null and package_id is null)
    or (kind='package' and package_id is not null and hospital_id is null and doctor_id is null))
);
create unique index saved_hospital_unique on public.saved_items(owner_id,hospital_id) where hospital_id is not null;
create unique index saved_doctor_unique on public.saved_items(owner_id,doctor_id) where doctor_id is not null;
create unique index saved_package_unique on public.saved_items(owner_id,package_id) where package_id is not null;
create index saved_owner on public.saved_items(owner_id,created_at desc);
create table public.recent_searches (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  query text not null check(length(query) between 2 and 240), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,query)
);
create index recent_search_owner on public.recent_searches(owner_id,updated_at desc);

create table public.recovery_journeys (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(title) between 3 and 120), hospital_id uuid references public.hospitals(id),
  case_id uuid references public.cases(id),
  stage text not null default 'preparation' check(stage in ('preparation','after_treatment','follow_up','rehabilitation_coordination','ongoing','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index recovery_owner on public.recovery_journeys(owner_id,updated_at desc);
create table public.recovery_tasks (
  id uuid primary key default gen_random_uuid(), journey_id uuid not null references public.recovery_journeys(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(title) between 3 and 160), status text not null default 'open' check(status in ('open','completed')),
  due_at timestamptz, source text not null default 'user_created' check(source='user_created'),
  completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((status='completed')=(completed_at is not null))
);
create index recovery_task_journey on public.recovery_tasks(journey_id,due_at);
create table public.recovery_events (
  id uuid primary key default gen_random_uuid(), journey_id uuid not null references public.recovery_journeys(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(title) between 3 and 180), event_type text not null check(event_type in ('journey_created','stage_changed','task_added','task_completed','task_reopened','milestone','document_linked','support_created')),
  occurred_at timestamptz not null default now(), source text not null default 'user_created' check(source in ('user_created','platform_action')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index recovery_event_timeline on public.recovery_events(journey_id,occurred_at desc);
create table public.recovery_documents (
  id uuid primary key default gen_random_uuid(), journey_id uuid not null references public.recovery_journeys(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, document_id uuid not null references public.case_documents(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(journey_id,document_id)
);
create table public.recovery_support_links (
  id uuid primary key default gen_random_uuid(), journey_id uuid not null references public.recovery_journeys(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, support_case_id uuid not null references public.support_cases(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(journey_id,support_case_id)
);
-- Read policies are strictly owner scoped, including staff. Writes go through atomic commands.
do $$ declare tbl text;begin
  foreach tbl in array array['saved_items','recent_searches','recovery_journeys','recovery_tasks','recovery_events','recovery_documents','recovery_support_links'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('grant select on public.%I to authenticated',tbl);
    execute format('grant all on public.%I to service_role',tbl);
    execute format('create policy own_read on public.%I for select to authenticated using(owner_id=(select auth.uid()) and private.portal_active())',tbl);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',tbl);
  end loop;
end $$;

create function public.experience_command(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();kind text;rid uuid; jid uuid; tid uuid; j public.recovery_journeys;result jsonb;event_title text;event_kind text;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_action='save_profile' then
    update public.profiles set display_name=left(trim(p_input->>'display_name'),100),phone=coalesce(p_input->>'phone',''),
      country=coalesce(p_input->>'country',''),city=coalesce(p_input->>'city',''),locale=p_input->>'locale',currency=p_input->>'currency',preferences_updated_at=now() where id=uid;
    perform public.portal_command('save_preferences',jsonb_build_object('inApp',coalesce((p_input->>'inApp')::boolean,true)));
    return '{}';
  elsif p_action='save_preferences' then
    update public.profiles set locale=p_input->>'locale',currency=p_input->>'currency',preferences_updated_at=now() where id=uid;return '{}';
  elsif p_action='save_item' then
    kind:=p_input->>'kind';rid:=(p_input->>'recordId')::uuid;
    if coalesce((p_input->>'saved')::boolean,false) then
      if kind not in ('hospital','doctor','package') or not(rid=any(private.catalog_public_ids(case kind when 'hospital' then 'hospitals' when 'doctor' then 'doctors' else 'packages' end))) then raise exception 'PORTAL_NOT_FOUND';end if;
      insert into public.saved_items(owner_id,kind,hospital_id,doctor_id,package_id)
        values(uid,kind,case when kind='hospital' then rid end,case when kind='doctor' then rid end,case when kind='package' then rid end) on conflict do nothing;
    else delete from public.saved_items si where si.owner_id=uid and si.kind=p_input->>'kind' and coalesce(si.hospital_id,si.doctor_id,si.package_id)=rid;end if;
    return '{}';
  elsif p_action='clear_searches' then
    delete from public.recent_searches where owner_id=uid;return '{}';
  elsif p_action='save_search' then
    insert into public.recent_searches(owner_id,query) values(uid,p_input->>'query') on conflict(owner_id,query) do update set updated_at=now();
    delete from public.recent_searches where owner_id=uid and id not in(select id from public.recent_searches where owner_id=uid order by updated_at desc limit 20);return '{}';
  elsif p_action='create_journey' then
    rid:=nullif(p_input->>'hospitalId','')::uuid;tid:=nullif(p_input->>'caseId','')::uuid;
    if rid is not null and not(rid=any(private.catalog_public_ids('hospitals'))) then raise exception 'PORTAL_NOT_FOUND';end if;
    if tid is not null and not exists(select 1 from public.cases where id=tid and owner_id=uid) then raise exception 'PORTAL_DENIED';end if;
    insert into public.recovery_journeys(owner_id,title,hospital_id,case_id) values(uid,p_input->>'title',rid,tid) returning * into j;
    insert into public.recovery_events(journey_id,owner_id,title,event_type,source) values(j.id,uid,'Recovery journey created','journey_created','platform_action');return to_jsonb(j);
  end if;
  jid:=(p_input->>'journeyId')::uuid;
  select * into j from public.recovery_journeys where id=jid and owner_id=uid for update;
  if not found then raise exception 'PORTAL_DENIED';end if;
  if p_action='update_journey' then
    update public.recovery_journeys set stage=p_input->>'stage' where id=jid returning * into j;result:=to_jsonb(j);
    event_title:='Stage: '||replace(j.stage,'_',' ');event_kind:='stage_changed';
  elsif p_action='add_task' then
    insert into public.recovery_tasks(journey_id,owner_id,title,due_at) values(jid,uid,p_input->>'title',nullif(p_input->>'dueAt','')::timestamptz) returning to_jsonb(recovery_tasks.*) into result;
    event_title:=p_input->>'title';event_kind:='task_added';
    if nullif(p_input->>'dueAt','') is not null and not exists(select 1 from public.portal_accounts where user_id=uid and notification_preferences->>'in_app'='false') then
      insert into public.portal_notifications(user_id,title,body,resource_type,resource_id) values(uid,'Recovery reminder saved',p_input->>'title','recovery_journey',jid);
    end if;
  elsif p_action='complete_task' then
    update public.recovery_tasks set status=case when (p_input->>'completed')::boolean then 'completed' else 'open' end,
      completed_at=case when (p_input->>'completed')::boolean then now() end where id=(p_input->>'taskId')::uuid and journey_id=jid and owner_id=uid returning to_jsonb(recovery_tasks.*) into result;
    if result is null then raise exception 'PORTAL_NOT_FOUND';end if;
    event_title:=result->>'title';event_kind:=case when (p_input->>'completed')::boolean then 'task_completed' else 'task_reopened' end;
  elsif p_action='add_event' then
    insert into public.recovery_events(journey_id,owner_id,title,event_type,occurred_at) values(jid,uid,p_input->>'title','milestone',(p_input->>'occurredAt')::timestamptz) returning to_jsonb(recovery_events.*) into result;return result;
  elsif p_action='link_document' then
    tid:=(p_input->>'documentId')::uuid;
    if not exists(select 1 from public.case_documents d join public.cases c on c.id=d.case_id where d.id=tid and c.owner_id=uid and d.status<>'archived') then raise exception 'PORTAL_DENIED';end if;
    insert into public.recovery_documents(journey_id,owner_id,document_id) values(jid,uid,tid) on conflict do nothing;
    event_title:='Existing private document linked';event_kind:='document_linked';result:='{}';
  elsif p_action='create_support' then
    -- Only the explicitly written request is shared. Journey/tasks/documents are never blanket shared.
    result:=public.support_command('create_case',jsonb_build_object('title',p_input->>'title','description',p_input->>'description','consent',p_input->'consent','caseType','coordination','hospitalId',j.hospital_id,'shareConversation',false,'shareDocuments',false,'shareWithProvider',false));
    insert into public.recovery_support_links(journey_id,owner_id,support_case_id) values(jid,uid,(result->>'id')::uuid);
    event_title:='Coordination support request created';event_kind:='support_created';
  else raise exception 'PORTAL_DENIED';end if;
  insert into public.recovery_events(journey_id,owner_id,title,event_type,source) values(jid,uid,event_title,event_kind,'platform_action');
  update public.recovery_journeys set updated_at=now() where id=jid;
  return result;
end $$;
revoke all on function public.experience_command(text,jsonb) from public,anon;
grant execute on function public.experience_command(text,jsonb) to authenticated;

create table private.exchange_rate_cache (
  base_currency text primary key check(base_currency='USD'),snapshot jsonb not null, fetched_at timestamptz not null, expires_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table private.exchange_rate_cache enable row level security;
create function public.experience_rate_cache(p_snapshot jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_snapshot is not null then
    insert into private.exchange_rate_cache(base_currency,snapshot,fetched_at,expires_at) values('USD',p_snapshot,(p_snapshot->>'fetchedAt')::timestamptz,(p_snapshot->>'expiresAt')::timestamptz)
      on conflict(base_currency) do update set snapshot=excluded.snapshot,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,updated_at=now();
  end if;
  return (select snapshot from private.exchange_rate_cache where base_currency='USD');
end $$;
revoke all on function public.experience_rate_cache(jsonb) from public,anon,authenticated;
grant execute on function public.experience_rate_cache(jsonb) to service_role;
