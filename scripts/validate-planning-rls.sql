-- Disposable migrated validation database only; all test data is rolled back.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000031'),('10000000-0000-4000-8000-000000000032');
insert into public.conversations(id,owner_id) values
 ('30000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031'),
 ('30000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000032');
insert into public.care_plans(id,user_id,conversation_id,title,goal) values
 ('40000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000031','Owner plan','Catalog planning'),
 ('40000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000032','Other plan','Catalog planning');
insert into public.care_plan_tasks(care_plan_id,task_key,title,task_type) values
 ('40000000-0000-4000-8000-000000000031','review','Review options','review'),
 ('40000000-0000-4000-8000-000000000032','review','Review options','review');
do $$ begin
  if has_table_privilege('anon','public.care_plans','select') or has_table_privilege('anon','public.care_plan_tasks','select') then raise exception 'Anonymous plan grant'; end if;
  if has_table_privilege('authenticated','public.care_plans','insert') or has_table_privilege('authenticated','public.care_plan_tasks','update') then raise exception 'Patient write grant'; end if;
  if has_function_privilege('authenticated','public.save_care_plan(jsonb,uuid)','execute') or has_function_privilege('anon','public.acquire_assistant_turn(uuid,uuid,uuid)','execute') then raise exception 'Public planning RPC grant'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000031';
do $$ begin
  if (select count(*) from public.care_plans) <> 1 then raise exception 'Owner plan isolation failed'; end if;
  if (select count(*) from public.care_plan_tasks) <> 1 then raise exception 'Owner task isolation failed'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000032';
do $$ begin
  if (select count(*) from public.care_plans) <> 1 then raise exception 'Other owner isolation failed'; end if;
  if exists(select 1 from public.care_plan_tasks where care_plan_id='40000000-0000-4000-8000-000000000031') then raise exception 'Other task leaked'; end if;
end $$;
reset role;
do $$ begin
  begin
    insert into public.care_plans(user_id,conversation_id,title,goal) values ('10000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000031','Invalid','Invalid');
    raise exception 'Cross-owner plan accepted';
  exception when foreign_key_violation or unique_violation then null; end;
  begin
    insert into public.care_plan_tasks(care_plan_id,task_key,title,task_type) values ('40000000-0000-4000-8000-000000000031','review','Duplicate','review');
    raise exception 'Duplicate task accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.care_plan_tasks(care_plan_id,task_key,title,task_type,requires_approval,approval_status,status)
    values ('40000000-0000-4000-8000-000000000031','external','External','external_action',true,'pending','completed');
    raise exception 'Unapproved external completion accepted';
  exception when check_violation then null; end;
  begin
    insert into public.agent_runs(conversation_id,initiated_by,care_plan_id,agent_name,agent_version,purpose,status)
    values ('30000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000032','40000000-0000-4000-8000-000000000031','treatment_planning','1','test','running');
    raise exception 'Invalid execution linkage accepted';
  exception when raise_exception then if sqlerrm = 'Invalid execution linkage accepted' then raise; end if; end;
end $$;
set role service_role;
do $$ begin
  if not public.acquire_assistant_turn('30000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031','50000000-0000-4000-8000-000000000031') then raise exception 'Lease failed'; end if;
  if public.acquire_assistant_turn('30000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031','50000000-0000-4000-8000-000000000032') then raise exception 'Concurrent lease accepted'; end if;
  perform public.release_assistant_turn('30000000-0000-4000-8000-000000000031','50000000-0000-4000-8000-000000000032');
  if public.acquire_assistant_turn('30000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031','50000000-0000-4000-8000-000000000032') then raise exception 'Wrong lease release succeeded'; end if;
  perform public.save_care_plan(jsonb_build_object('id','40000000-0000-4000-8000-000000000031','userId','10000000-0000-4000-8000-000000000031',
    'conversationId','30000000-0000-4000-8000-000000000031','title','Updated plan','goal','Catalog planning','status','ready',
    'context',jsonb_build_object('goalType','treatment','requestedTargets',jsonb_build_array('hospitals')),'findings','[]'::jsonb,
    'tasks',jsonb_build_array(jsonb_build_object('id','60000000-0000-4000-8000-000000000031','key','search_hospitals','title','Find hospitals',
      'description','','taskType','discovery','status','completed','priority','normal','requiresUserAction',false,'requiresApproval',false,
      'approvalStatus','not_required','findings','[]'::jsonb))), '50000000-0000-4000-8000-000000000031');
  perform public.save_care_plan(jsonb_build_object('id','40000000-0000-4000-8000-000000000031','userId','10000000-0000-4000-8000-000000000031',
    'conversationId','30000000-0000-4000-8000-000000000031','title','Updated plan','goal','Catalog planning','status','ready',
    'context',jsonb_build_object('goalType','treatment','requestedTargets',jsonb_build_array('hospitals')),'findings','[]'::jsonb,
    'tasks',jsonb_build_array(jsonb_build_object('id','60000000-0000-4000-8000-000000000031','key','search_hospitals','title','Find hospitals',
      'description','','taskType','discovery','status','completed','priority','normal','requiresUserAction',false,'requiresApproval',false,
      'approvalStatus','not_required','findings','[]'::jsonb))), '50000000-0000-4000-8000-000000000031');
  if (select count(*) from public.care_plan_tasks where care_plan_id='40000000-0000-4000-8000-000000000031' and task_key='search_hospitals') <> 1 then raise exception 'RPC duplicated task'; end if;
  perform public.release_assistant_turn('30000000-0000-4000-8000-000000000031','50000000-0000-4000-8000-000000000031');
end $$;
reset role;
insert into public.cases(id, owner_id, title) values ('20000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000032','Shared case');
insert into public.case_members(case_id,user_id,role,granted_by) values ('20000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000031','caregiver','10000000-0000-4000-8000-000000000032');
update public.conversations set case_id='20000000-0000-4000-8000-000000000031' where id='30000000-0000-4000-8000-000000000031';
update public.case_members set revoked_at=now() where case_id='20000000-0000-4000-8000-000000000031';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000031';
do $$ begin
  if exists(select 1 from public.care_plans) or exists(select 1 from public.care_plan_tasks) then raise exception 'Revoked case member retained plan access'; end if;
end $$;
reset role;
rollback;
