\set ON_ERROR_STOP on
begin;
do $$begin if current_database() not like 'production_catalog_personal_%' then raise exception 'Disposable personal QA database required';end if;end $$;
create function pg_temp.visitor_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end $$;
create function pg_temp.visitor_denied(stmt text,msg text) returns void language plpgsql as $$begin begin execute stmt;exception when others then raise notice 'PASS: denied %',msg;return;end;raise exception 'FAIL: permitted %',msg;end $$;
create temporary table vq(k text primary key,id uuid default gen_random_uuid());insert into vq(k) values('lease'),('otherlease'),('patient'),('visitor'),('conversation'),('plan');grant all on vq to service_role;
insert into auth.users(id,email) select id,'visitor-import@qa.invalid' from vq where k='patient';
set local role anon;
select pg_temp.visitor_denied($s$select public.experience_guest_session('read',repeat('a',64))$s$,'anonymous visitor RPC access');
select pg_temp.visitor_denied($s$select public.experience_import_visitor(repeat('a',64),gen_random_uuid(),gen_random_uuid())$s$,'anonymous import RPC access');
reset role;
set local role authenticated;
select pg_temp.visitor_denied($s$select public.experience_guest_session('read',repeat('a',64))$s$,'authenticated visitor RPC access');
select pg_temp.visitor_denied($s$select public.experience_rate_cache(null)$s$,'authenticated raw rate cache access');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.visitor_assert(public.experience_guest_session('acquire',repeat('a',64),repeat('b',64),(select id from vq where k='lease'))='{}','visitor initial state is empty');
select pg_temp.visitor_denied($s$select public.experience_guest_session('acquire',repeat('a',64),repeat('c',64),(select id from vq where k='otherlease'))$s$,'concurrent visitor turn');
select pg_temp.visitor_denied($s$select public.experience_guest_session('save',repeat('a',64),null,(select id from vq where k='otherlease'),'{}')$s$,'wrong lease writer');
select public.experience_guest_session('save',repeat('a',64),null,(select id from vq where k='lease'),
  jsonb_build_object('userId',(select id from vq where k='visitor'),'conversationId',(select id from vq where k='conversation'),
  'messages',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'role','user','content','Coordinate follow-up questions','metadata','{}'::jsonb,'createdAt',now())),
  'traces','[]'::jsonb,'plan',jsonb_build_object('id',(select id from vq where k='plan'),'userId',(select id from vq where k='visitor'),'conversationId',(select id from vq where k='conversation'),
    'title','QA imported coordination plan','goal','Coordinate follow-up questions','status','draft','context',jsonb_build_object('goalType','treatment','requestedTargets','[]'::jsonb),'findings','[]'::jsonb,'tasks','[]'::jsonb,'createdAt',now(),'updatedAt',now())));
select pg_temp.visitor_assert(public.experience_guest_session('read',repeat('a',64))->'messages'->0->>'content'='Coordinate follow-up questions','temporary transcript persists');
select pg_temp.visitor_assert(public.experience_guest_session('read',repeat('d',64)) is null,'other visitor cannot find state');
select pg_temp.visitor_denied($s$select public.experience_guest_session('acquire',repeat('a',64),repeat('b',64),gen_random_uuid())$s$,'per-subject short interval limit');
select public.experience_guest_session('acquire',repeat('a',64),repeat('e',64),(select id from vq where k='lease'));
select pg_temp.visitor_assert(public.experience_import_visitor(repeat('a',64),(select id from vq where k='lease'),(select id from vq where k='patient'))=(select id from vq where k='conversation'),'explicit import returns existing conversation identity');
select pg_temp.visitor_assert(public.experience_guest_session('read',repeat('a',64)) is null,'import removes temporary visitor state');
reset role;
select pg_temp.visitor_assert(exists(select 1 from public.care_plans where user_id=(select id from vq where k='patient') and conversation_id=(select id from vq where k='conversation')),'import reuses actual owner care plan');
select pg_temp.visitor_assert(exists(select 1 from public.conversation_messages where conversation_id=(select id from vq where k='conversation') and content='Coordinate follow-up questions'),'import retains actual conversation history');
update private.assistant_visitor_limits set turns=50 where subject_hash=repeat('e',64);
set local role service_role;
select pg_temp.visitor_denied($s$select public.experience_guest_session('acquire',repeat('f',64),repeat('e',64),gen_random_uuid())$s$,'daily visitor limit');
reset role;
insert into private.assistant_visitors(token_hash,expires_at,state) values(repeat('0',64),now()-interval '1 hour','{"private":"expired"}');
set local role service_role;
select pg_temp.visitor_assert(public.experience_guest_session('read',repeat('0',64)) is null,'expired visitor records are not read');
reset role;
select pg_temp.visitor_assert(not exists(select 1 from private.assistant_visitors where token_hash=repeat('0',64)),'expired state is purged');
rollback;
