-- Actual PostgreSQL roles/RLS; synthetic fixtures rolled back.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000061'),('10000000-0000-4000-8000-000000000062');
insert into public.conversations(id,owner_id) values
 ('30000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000061'),
 ('30000000-0000-4000-8000-000000000062','10000000-0000-4000-8000-000000000062');
insert into public.provider_verification_runs(id,owner_id,conversation_id,provider_id,provider_type,completed_at,report)
select ('40000000-0000-4000-8000-00000000006'||n)::uuid,('10000000-0000-4000-8000-00000000006'||n)::uuid,
 ('30000000-0000-4000-8000-00000000006'||n)::uuid,'50000000-0000-4000-8000-000000000061','hospital',now(),
 jsonb_build_object('id','40000000-0000-4000-8000-00000000006'||n,'ownerId','10000000-0000-4000-8000-00000000006'||n,
 'conversationId','30000000-0000-4000-8000-00000000006'||n,'provider',jsonb_build_object('id','50000000-0000-4000-8000-000000000061','type','hospital')) from generate_series(1,2) n;
do $$ begin
 begin
  update public.provider_verification_runs set owner_id='10000000-0000-4000-8000-000000000062',report=jsonb_set(report,'{ownerId}','"10000000-0000-4000-8000-000000000062"') where id='40000000-0000-4000-8000-000000000061';
  raise exception 'Cross-owner conversation accepted';
 exception when foreign_key_violation then null;end;
 if has_table_privilege('authenticated','public.provider_verification_runs','insert') or has_table_privilege('authenticated','public.provider_verification_runs','update') or has_table_privilege('authenticated','public.provider_verification_runs','delete') then raise exception 'Browser mutation privilege';end if;
 if has_table_privilege('anon','public.provider_verification_runs','select') then raise exception 'Anonymous report access';end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000061';
do $$ begin
 if(select count(*) from public.provider_verification_runs)<>1 then raise exception 'Owner A isolation failed';end if;
 if exists(select 1 from public.provider_verification_runs where owner_id<>'10000000-0000-4000-8000-000000000061')then raise exception 'Other owner leak';end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000062';
do $$ begin if(select count(*) from public.provider_verification_runs)<>1 then raise exception 'Owner B isolation failed';end if;end $$;
reset role;
rollback;
