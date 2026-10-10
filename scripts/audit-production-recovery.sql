-- Read-only metadata/aggregate evidence. No document content, object paths,
-- user identities, signed URLs, credentials or patient rows are returned.
-- Run with authorized database/operator access, never from a public API.
-- This audits prerequisites; it cannot prove backup completion or restoration.
begin read only;
select jsonb_build_object(
 'observedAt',now(),
 'databaseVersion',current_setting('server_version'),
 'latestMigration',(select max(version) from supabase_migrations.schema_migrations),
 'buckets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'private',not b.public,
   'sizeLimit',b.file_size_limit,'objectCount',(select count(*) from storage.objects o where o.bucket_id=b.id)))
   from storage.buckets b),'[]'::jsonb),
 'scanStates',coalesce((select jsonb_object_agg(state,n) from (select state,count(*) n from public.document_security_jobs group by state) s),'{}'::jsonb),
 'deletionStates',coalesce((select jsonb_object_agg(state,n) from (select state,count(*) n from public.document_deletion_jobs group by state) s),'{}'::jsonb),
 'activeHolds',(select count(*) from public.document_retention_holds where active),
 'unregisteredPrivateObjects',(select count(*) from storage.objects o where o.bucket_id in ('care-documents','provider-documents')
   and not exists(select 1 from public.document_security_jobs j where j.bucket=o.bucket_id and j.object_path=o.name)),
 'registeredObjectsMissingMetadata',(select count(*) from public.document_security_jobs j where j.failure_category is distinct from 'removed'
   and not exists(select 1 from storage.objects o where o.bucket_id=j.bucket and o.name=j.object_path)),
 'controls',jsonb_build_object(
   'requiredPrivateBuckets', (select count(*)=2 and bool_and(not public) from storage.buckets where id in ('care-documents','provider-documents')),
   'lifecycleRls', (select count(*)=3 and bool_and(relrowsecurity) from pg_class where oid in
     ('public.document_security_jobs'::regclass,'public.document_deletion_jobs'::regclass,'public.document_retention_holds'::regclass)),
   'browserLifecycleTablesDenied',not exists(select 1 from unnest(array['anon','authenticated']) r cross join
     unnest(array['public.document_security_jobs','public.document_deletion_jobs','public.document_retention_holds','private.document_recovery_gate']) t
     where has_table_privilege(r,t,'select,insert,update,delete')),
   'browserCleanupRpcsDenied',not exists(select 1 from unnest(array['anon','authenticated']) r cross join
     unnest(array['public.document_deletion_request(uuid,uuid,uuid)','public.document_deletion_claim(uuid)',
       'public.document_deletion_result(uuid,uuid,boolean,text)','public.document_deletion_reconcile()']) f where has_function_privilege(r,f,'execute')),
   'recoveryGatePresent',(select count(*)=1 from private.document_recovery_gate where id),
   'missingGateFailsClosed',not exists(select 1 from unnest(array['private.document_security_clean(text,text)',
     'private.can_access_case(uuid)','private.portal_case_access(uuid)']) f
     where position('coalesce(not (select blocked' in pg_get_functiondef(f::regprocedure))=0),
   'tombstoneGuardPresent',position('public.document_deletion_jobs' in pg_get_functiondef('private.document_security_clean(text,text)'::regprocedure))>0,
   'directStorageReadDenied',exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and not polpermissive
     and pg_get_expr(polqual,polrelid) like '%care-documents%' and pg_get_expr(polqual,polrelid) like '%provider-documents%'),
   'reconciliationRequiresBlockedGate',position('if (select blocked from private.document_recovery_gate where id) is distinct from true then' in pg_get_functiondef('public.document_deletion_reconcile()'::regprocedure))>0
 ),
 'recoveryGateBlocked',(select blocked from private.document_recovery_gate where id),
 'evidenceScope','database metadata only; managed backups, object bytes, operator access and restore completion require separate evidence'
) as evidence;
commit;
