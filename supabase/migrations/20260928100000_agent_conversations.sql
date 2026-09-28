create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null default 'New care workspace',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  visibility text not null default 'user' check (visibility in ('user', 'internal')),
  content text not null check (char_length(content) <= 12000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (role in ('user', 'assistant') or visibility = 'internal')
);

alter table public.agent_runs add column conversation_id uuid references public.conversations(id) on delete set null;
alter table public.agent_runs drop constraint agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check
  check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'awaiting_user_input', 'awaiting_approval'));

alter table public.agent_tasks add column tool_name text;
alter table public.agent_tasks add column input_summary jsonb not null default '{}'::jsonb;
alter table public.agent_tasks add column output_summary jsonb not null default '{}'::jsonb;
alter table public.agent_tasks add column started_at timestamptz;
alter table public.agent_tasks add column completed_at timestamptz;
alter table public.agent_tasks add column error_code text;
alter table public.agent_tasks drop constraint agent_tasks_status_check;
alter table public.agent_tasks add constraint agent_tasks_status_check
  check (status in ('pending', 'running', 'completed', 'failed', 'cancelled', 'blocked', 'awaiting_approval', 'awaiting_user_input'));

create index conversations_owner_updated_idx on public.conversations(owner_id, updated_at desc);
create index conversations_case_idx on public.conversations(case_id) where case_id is not null;
create index conversation_messages_order_idx on public.conversation_messages(conversation_id, created_at, id);
create index agent_runs_conversation_idx on public.agent_runs(conversation_id, created_at desc);

create trigger touch_updated_at before update on public.conversations
for each row execute function private.touch_updated_at();

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

grant select on public.conversations, public.conversation_messages to authenticated;
create policy conversations_owner_read on public.conversations for select to authenticated
  using (owner_id = (select auth.uid()) and (case_id is null or private.can_access_case(case_id)));
create policy messages_owner_read on public.conversation_messages for select to authenticated
  using (visibility = 'user' and exists (
    select 1 from public.conversations c where c.id = conversation_id
      and c.owner_id = (select auth.uid())
      and (c.case_id is null or private.can_access_case(c.case_id))
  ));
