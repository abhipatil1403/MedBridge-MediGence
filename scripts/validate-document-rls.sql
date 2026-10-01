-- Disposable migrated PostgreSQL harness; rollback leaves no validation records.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000041'),('10000000-0000-4000-8000-000000000042');
insert into public.conversations(id,owner_id) values
 ('30000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000041'),
 ('30000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000042'),
 ('30000000-0000-4000-8000-000000000044','10000000-0000-4000-8000-000000000041');
do $$ declare hid uuid; a jsonb; b jsonb; begin
 select id into hid from public.hospitals limit 1;
 if hid is null then raise exception 'Seed catalog needed for validation'; end if;
 a=jsonb_build_object('id','40000000-0000-4000-8000-000000000041','ownerId','10000000-0000-4000-8000-000000000041',
   'conversationId','30000000-0000-4000-8000-000000000041','hospitalId',hid,'serviceId',null,'serviceLabel','Selected service','revision',0,
   'requirements','[]'::jsonb,'documents','[{"id":"50000000-0000-4000-8000-000000000041","uploadStatus":"uploaded"},{"id":"50000000-0000-4000-8000-000000000043","uploadStatus":"removed"}]'::jsonb);
 b=jsonb_set(jsonb_set(jsonb_set(a,'{id}','"40000000-0000-4000-8000-000000000042"'),'{ownerId}','"10000000-0000-4000-8000-000000000042"'),'{conversationId}','"30000000-0000-4000-8000-000000000042"');
 perform public.save_document_workspace(a,-1,'validation_start'); perform public.save_document_workspace(b,-1,'validation_start');
 begin
   perform public.save_document_workspace(jsonb_set(a,'{ownerId}','"10000000-0000-4000-8000-000000000042"'),0,'invalid_owner');
   raise exception 'Owner mutation accepted';
 exception when raise_exception then if sqlerrm<>'document scope mismatch' then raise; end if; end;
 begin
   perform public.save_document_workspace(jsonb_set(a,'{revision}','2'),0,'invalid_revision');
   raise exception 'Stale revision accepted';
 exception when raise_exception then if sqlerrm<>'document revision conflict' then raise; end if; end;
 perform public.save_document_workspace(jsonb_set(a,'{revision}','1'),0,'validation_update');
 if (select count(*) from public.document_coordination_audit where workspace_id=(a->>'id')::uuid)<>2 then raise exception 'Atomic audit missing';end if;
 begin
   perform public.save_document_workspace(jsonb_set(jsonb_set(jsonb_set(a,'{id}','"40000000-0000-4000-8000-000000000044"'),'{ownerId}','"10000000-0000-4000-8000-000000000042"'),'{conversationId}','"30000000-0000-4000-8000-000000000044"'),-1,'cross_conversation');
   raise exception 'Cross-owner conversation accepted';
 exception when foreign_key_violation then null; end;
 if has_table_privilege('authenticated','public.document_workspaces','insert') or has_table_privilege('authenticated','public.document_workspaces','update')
   or has_table_privilege('authenticated','public.document_checklists','insert') then raise exception 'Browser write grant'; end if;
 if has_table_privilege('anon','public.document_workspaces','select') or has_table_privilege('anon','public.document_coordination_audit','select') then raise exception 'Anonymous document access'; end if;
 if has_function_privilege('authenticated','public.save_document_workspace(jsonb,integer,text)','execute')
   or has_function_privilege('anon','public.save_document_workspace(jsonb,integer,text)','execute') then raise exception 'Public mutation RPC'; end if;
 if (select public from storage.buckets where id='care-documents') then raise exception 'Public medical document bucket'; end if;
 if (select file_size_limit from storage.buckets where id='care-documents')<>3145728 then raise exception 'Wrong size limit';end if;
end $$;
insert into storage.objects(bucket_id,name) values
 ('care-documents','10000000-0000-4000-8000-000000000041/40000000-0000-4000-8000-000000000041/50000000-0000-4000-8000-000000000041.pdf'),
 ('care-documents','10000000-0000-4000-8000-000000000042/40000000-0000-4000-8000-000000000042/50000000-0000-4000-8000-000000000041.pdf'),
 ('care-documents','10000000-0000-4000-8000-000000000041/40000000-0000-4000-8000-000000000041/50000000-0000-4000-8000-000000000043.pdf');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000041';
do $$ begin
 if (select count(*) from public.document_workspaces)<>1 then raise exception 'Owner workspace isolation';end if;
 if (select count(*) from public.document_coordination_audit)<>2 then raise exception 'Owner audit isolation';end if;
 if (select count(*) from storage.objects where bucket_id='care-documents')<>1 then raise exception 'Private storage owner/active-file isolation';end if;
 if exists(select 1 from public.document_workspaces where owner_id<>'10000000-0000-4000-8000-000000000041') then raise exception 'Other owner leak';end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000042';
do $$ begin
 if (select count(*) from public.document_workspaces)<>1 then raise exception 'Second account workspace isolation';end if;
 if (select count(*) from public.document_coordination_audit)<>1 then raise exception 'Second account audit isolation';end if;
 if (select count(*) from storage.objects where bucket_id='care-documents')<>1 then raise exception 'Second account storage isolation';end if;
end $$;
reset role;
rollback;
