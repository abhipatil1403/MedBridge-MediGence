-- Immutable, private evidence snapshots. No provider/catalog mutation privileges.
create table public.provider_verification_runs (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  provider_id uuid not null,
  provider_type text not null check (provider_type in ('hospital','clinic','doctor','healthcare_provider','package')),
  completed_at timestamptz not null,
  report jsonb not null check (jsonb_typeof(report)='object'),
  constraint provider_verification_conversation_owner foreign key (conversation_id,owner_id) references public.conversations(id,owner_id) on delete cascade,
  check ((report->>'id')::uuid=id and (report->>'ownerId')::uuid=owner_id
    and (report->>'conversationId')::uuid=conversation_id
    and (report->'provider'->>'id')::uuid=provider_id
    and report->'provider'->>'type'=provider_type)
);
create index provider_verification_history_idx on public.provider_verification_runs(owner_id,conversation_id,provider_id,completed_at desc);
alter table public.provider_verification_runs enable row level security;
revoke all on public.provider_verification_runs from anon, authenticated;
grant select on public.provider_verification_runs to authenticated;
grant select, insert, delete on public.provider_verification_runs to service_role;
create policy provider_verification_owner_read on public.provider_verification_runs for select to authenticated
using (owner_id=(select auth.uid()) and exists(select 1 from public.conversations c where c.id=conversation_id and c.owner_id=(select auth.uid())));
comment on table public.provider_verification_runs is 'Private immutable factual verification history; validated research evidence remains separate from the provider catalog.';
