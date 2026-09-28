-- Run only against a disposable migrated validation database.
begin;
insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000011'),
  ('10000000-0000-0000-0000-000000000012');
insert into public.conversations(id, owner_id, title) values
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'Owner conversation'),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000012', 'Other conversation');
insert into public.conversation_messages(conversation_id, role, visibility, content) values
  ('30000000-0000-0000-0000-000000000011', 'user', 'user', 'Owner message'),
  ('30000000-0000-0000-0000-000000000011', 'system', 'internal', 'Internal instruction'),
  ('30000000-0000-0000-0000-000000000012', 'user', 'user', 'Other message');

set role anon;
do $$ begin
  if has_table_privilege('anon', 'public.conversations', 'select') then raise exception 'Anonymous conversation read grant'; end if;
  if has_table_privilege('anon', 'public.conversation_messages', 'select') then raise exception 'Anonymous message read grant'; end if;
end $$;
reset role;

insert into public.cases(id, owner_id, title) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000012', 'Shared validation case');
insert into public.case_members(case_id, user_id, role, granted_by) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'caregiver', '10000000-0000-0000-0000-000000000012');
insert into public.conversations(id, owner_id, case_id, title) values
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000011',
   '20000000-0000-0000-0000-000000000011', 'Shared case conversation');

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000011';
do $$ begin
  if (select count(*) from public.conversations) <> 2 then raise exception 'Case member conversation access failed'; end if;
  if (select count(*) from public.conversation_messages) <> 1 then raise exception 'User message/internal isolation failed'; end if;
  if has_table_privilege('authenticated', 'public.conversations', 'insert') then raise exception 'Direct conversation insert grant'; end if;
  if has_table_privilege('authenticated', 'public.conversation_messages', 'update') then raise exception 'Direct message update grant'; end if;
  if has_table_privilege('authenticated', 'public.agent_approvals', 'update') then raise exception 'Direct approval update grant'; end if;
end $$;
reset role;

update public.case_members set revoked_at = now()
where case_id = '20000000-0000-0000-0000-000000000011' and user_id = '10000000-0000-0000-0000-000000000011';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000011';
do $$ begin
  if (select count(*) from public.conversations) <> 1 then raise exception 'Revoked case member retained conversation'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000012';
do $$ begin
  if (select count(*) from public.conversations) <> 1 then raise exception 'Other owner conversation isolation failed'; end if;
  if (select count(*) from public.conversation_messages) <> 1 then raise exception 'Other owner message isolation failed'; end if;
end $$;
reset role;
rollback;
