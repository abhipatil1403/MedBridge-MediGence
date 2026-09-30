-- Internal coordination plans, distinct from clinical treatment plans and case records.
alter table public.conversations add constraint conversations_id_owner_unique unique (id, owner_id);
alter table public.conversations add column execution_token uuid;
alter table public.conversations add column execution_expires_at timestamptz;

create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null unique,
  title text not null check (char_length(title) between 1 and 160),
  goal text not null check (char_length(goal) between 1 and 2000),
  status text not null default 'draft' check (status in ('draft','planning','awaiting_user','ready','in_progress','completed','cancelled')),
  destination_country text references public.countries(slug), destination_city text,
  treatment_id uuid references public.treatments(id),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.conversations(id, owner_id) on delete cascade
);
create table public.care_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans(id) on delete cascade,
  task_key text not null check (char_length(task_key) between 1 and 200),
  title text not null check (char_length(title) between 1 and 160), description text not null default '',
  task_type text not null check (task_type in ('discovery','review','preferences','clarification','external_action')),
  status text not null default 'pending' check (status in ('pending','in_progress','blocked','awaiting_user','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('normal','high')),
  requires_user_action boolean not null default false, requires_approval boolean not null default false,
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(care_plan_id, task_key),
  check ((requires_approval and approval_status <> 'not_required') or (not requires_approval and approval_status = 'not_required')),
  check (not requires_approval or status <> 'completed' or approval_status = 'approved')
);
alter table public.agent_runs add column care_plan_id uuid references public.care_plans(id) on delete set null;
alter table public.agent_tasks add column care_plan_task_id uuid references public.care_plan_tasks(id) on delete set null;
create index care_plans_user_updated_idx on public.care_plans(user_id, updated_at desc);
create index care_plan_tasks_status_idx on public.care_plan_tasks(care_plan_id, status);
create index agent_runs_plan_idx on public.agent_runs(care_plan_id) where care_plan_id is not null;
create index agent_tasks_plan_task_idx on public.agent_tasks(care_plan_task_id) where care_plan_task_id is not null;
create function private.check_care_execution_scope() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'agent_runs' then
    if new.care_plan_id is not null and not exists (select 1 from public.care_plans p
      where p.id = new.care_plan_id and p.conversation_id = new.conversation_id and p.user_id = new.initiated_by)
      then raise exception 'Agent run care plan scope mismatch'; end if;
  else
    if new.care_plan_task_id is not null and not exists (select 1 from public.care_plan_tasks t join public.agent_runs r on r.care_plan_id = t.care_plan_id
      where t.id = new.care_plan_task_id and r.id = new.run_id)
      then raise exception 'Agent task care plan scope mismatch'; end if;
  end if;
  return new;
end; $$;
create trigger check_care_execution_scope before insert or update on public.agent_runs
for each row execute function private.check_care_execution_scope();
create trigger check_care_execution_scope before insert or update on public.agent_tasks
for each row execute function private.check_care_execution_scope();
create trigger touch_updated_at before update on public.care_plans for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.care_plan_tasks for each row execute function private.touch_updated_at();
alter table public.care_plans enable row level security;
alter table public.care_plan_tasks enable row level security;
revoke all on public.care_plans, public.care_plan_tasks from anon, authenticated;
grant select on public.care_plans, public.care_plan_tasks to authenticated;
grant all on public.care_plans, public.care_plan_tasks to service_role;
create policy care_plans_owner_read on public.care_plans for select to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and c.owner_id = (select auth.uid()))
);
create policy care_plan_tasks_owner_read on public.care_plan_tasks for select to authenticated using (
  exists (select 1 from public.care_plans p where p.id = care_plan_id and p.user_id = (select auth.uid()))
);

-- A short server-only lease serializes turns across server instances; crashes expire safely.
create function public.acquire_assistant_turn(p_conversation_id uuid, p_user_id uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set execution_token = p_token, execution_expires_at = now() + interval '150 seconds'
  where id = p_conversation_id and owner_id = p_user_id
    and (execution_token is null or execution_expires_at < now());
  return found;
end; $$;
create function public.release_assistant_turn(p_conversation_id uuid, p_token uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversations set execution_token = null, execution_expires_at = null
  where id = p_conversation_id and execution_token = p_token;
$$;

-- Persist plan + tasks atomically. The lease and ownership are checked again here.
create function public.save_care_plan(p_plan jsonb, p_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t jsonb; v_id uuid := (p_plan->>'id')::uuid; v_conversation uuid := (p_plan->>'conversationId')::uuid;
begin
  perform 1 from public.conversations where id = v_conversation and owner_id = (p_plan->>'userId')::uuid
    and execution_token = p_token and execution_expires_at > now() for update;
  if not found then raise exception 'Plan ownership or turn lease mismatch'; end if;
  if jsonb_array_length(p_plan->'tasks') > 40 then raise exception 'Too many care tasks'; end if;
  insert into public.care_plans(id,user_id,conversation_id,title,goal,status,destination_country,destination_city,treatment_id,context,findings)
  values(v_id,(p_plan->>'userId')::uuid,v_conversation,p_plan->>'title',p_plan->>'goal',p_plan->>'status',
    p_plan->'context'->>'country',p_plan->'context'->>'city',(p_plan->'context'->>'treatmentId')::uuid,p_plan->'context',p_plan->'findings')
  on conflict (id) do update set title=excluded.title, goal=excluded.goal,status=excluded.status,
    destination_country=excluded.destination_country,destination_city=excluded.destination_city,treatment_id=excluded.treatment_id,
    context=excluded.context,findings=excluded.findings
  where care_plans.conversation_id=v_conversation and care_plans.user_id=(p_plan->>'userId')::uuid;
  if not found then raise exception 'Care plan scope mismatch'; end if;
  for t in select value from jsonb_array_elements(p_plan->'tasks') loop
    insert into public.care_plan_tasks(id,care_plan_id,task_key,title,description,task_type,status,priority,requires_user_action,requires_approval,approval_status,metadata)
    values((t->>'id')::uuid,v_id,t->>'key',t->>'title',t->>'description',t->>'taskType',t->>'status',t->>'priority',
      (t->>'requiresUserAction')::boolean,(t->>'requiresApproval')::boolean,t->>'approvalStatus',
      t - array['id','key','title','description','taskType','status','priority','requiresUserAction','requiresApproval','approvalStatus','updatedAt'])
    on conflict (care_plan_id, task_key) do update set title=excluded.title,description=excluded.description,status=excluded.status,
      priority=excluded.priority,requires_user_action=excluded.requires_user_action,requires_approval=excluded.requires_approval,
      approval_status=excluded.approval_status,metadata=excluded.metadata;
  end loop;
end; $$;
revoke all on function public.acquire_assistant_turn(uuid,uuid,uuid), public.release_assistant_turn(uuid,uuid), public.save_care_plan(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.acquire_assistant_turn(uuid,uuid,uuid), public.release_assistant_turn(uuid,uuid), public.save_care_plan(jsonb,uuid) to service_role;
