-- Temporary visitor state uses the existing runtime/store contracts. It never has an auth user or access to patient tables.
create table private.assistant_visitors (
  token_hash text primary key check(length(token_hash)=64), state jsonb not null default '{}',
  lease uuid, lease_until timestamptz, expires_at timestamptz not null default now()+interval '24 hours',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.assistant_visitor_limits (
  subject_hash text primary key check(length(subject_hash)=64), turns integer not null default 0,
  window_start timestamptz not null default now(), last_turn timestamptz, expires_at timestamptz not null default now()+interval '1 day',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table private.assistant_visitors enable row level security;
alter table private.assistant_visitor_limits enable row level security;
create function public.experience_guest_session(p_action text,p_hash text,p_ip_hash text default null,p_lease uuid default null,p_state jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row private.assistant_visitors;lim private.assistant_visitor_limits;
begin
  if length(p_hash)<>64 then raise exception 'INVALID_VISITOR';end if;
  delete from private.assistant_visitors where expires_at<now();
  delete from private.assistant_visitor_limits where expires_at<now();
  if p_action='read' then return (select state from private.assistant_visitors where token_hash=p_hash);end if;
  if p_action='acquire' then
    if p_lease is null or length(coalesce(p_ip_hash,''))<>64 then raise exception 'INVALID_VISITOR';end if;
    insert into private.assistant_visitors(token_hash) values(p_hash) on conflict do nothing;
    select * into row from private.assistant_visitors where token_hash=p_hash for update;
    if row.lease_until>now() then raise exception 'VISITOR_BUSY';end if;
    insert into private.assistant_visitor_limits(subject_hash) values(p_ip_hash) on conflict do nothing;
    select * into lim from private.assistant_visitor_limits where subject_hash=p_ip_hash for update;
    if lim.last_turn>now()-interval '3 seconds' or lim.turns>=50 then raise exception 'VISITOR_LIMIT';end if;
    update private.assistant_visitor_limits set turns=turns+1,last_turn=now(),updated_at=now() where subject_hash=p_ip_hash;
    update private.assistant_visitors set lease=p_lease,lease_until=now()+interval '150 seconds',updated_at=now() where token_hash=p_hash;
    return row.state;
  end if;
  select * into row from private.assistant_visitors where token_hash=p_hash for update;
  if not found or row.lease is distinct from p_lease then raise exception 'VISITOR_BUSY';end if;
  if p_action='save' then
    if jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>524288 then raise exception 'VISITOR_STATE_LIMIT';end if;
    update private.assistant_visitors set state=p_state,lease=null,lease_until=null,updated_at=now() where token_hash=p_hash;
  elsif p_action='delete' then delete from private.assistant_visitors where token_hash=p_hash;
  elsif p_action='release' then update private.assistant_visitors set lease=null,lease_until=null where token_hash=p_hash;
  else raise exception 'INVALID_VISITOR';end if;
  return '{}';
end $$;
revoke all on function public.experience_guest_session(text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.experience_guest_session(text,text,text,uuid,jsonb) to service_role;
create function public.experience_import_visitor(p_hash text,p_lease uuid,p_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare row private.assistant_visitors;cid uuid;msg jsonb;plan jsonb;tasks jsonb;
begin
  select * into row from private.assistant_visitors where token_hash=p_hash and lease=p_lease and lease_until>now() and expires_at>now() for update;
  if not found or not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.portal_accounts where user_id=p_user and not active) then raise exception 'PORTAL_DENIED';end if;
  cid:=(row.state->>'conversationId')::uuid;
  insert into public.conversations(id,owner_id,title) values(cid,p_user,'Imported care conversation');
  for msg in select value from jsonb_array_elements(row.state->'messages') loop
    insert into public.conversation_messages(conversation_id,role,content,metadata,created_at) values(cid,msg->>'role',msg->>'content',coalesce(msg->'metadata','{}'),(msg->>'createdAt')::timestamptz);
  end loop;
  if row.state ? 'plan' then
    plan:=jsonb_set(row.state->'plan','{userId}',to_jsonb(p_user::text));
    select coalesce(jsonb_agg(value-'runId'-'agentTaskId'),'[]') into tasks from jsonb_array_elements(plan->'tasks');
    plan:=jsonb_set(plan,'{tasks}',tasks);
    if not public.acquire_assistant_turn(cid,p_user,p_lease) then raise exception 'VISITOR_BUSY';end if;
    perform public.save_care_plan(plan,p_lease);perform public.release_assistant_turn(cid,p_lease);
  end if;
  delete from private.assistant_visitors where token_hash=p_hash;
  return cid;
end $$;
revoke all on function public.experience_import_visitor(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.experience_import_visitor(text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
