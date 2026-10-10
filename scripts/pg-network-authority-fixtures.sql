-- Disposable QA only. Explicitly execute real submit/review commands, never
-- a trigger or production shortcut. This is not evidence of provider participation.
create or replace function pg_temp.qa_approve_authority(p_org uuid,p_provider uuid,p_admin uuid,p_hospital uuid default null) returns void language plpgsql as $$
declare doc uuid:=gen_random_uuid();req uuid;previous text:=current_setting('request.jwt.claim.sub',true);begin
  if current_database() not like 'production_catalog_%' or not exists(select 1 from auth.users where id=p_provider and email like '%@qa.invalid') then raise exception 'Disposable QA actor required';end if;
  insert into storage.objects(bucket_id,name) values('provider-documents',p_org::text||'/'||doc::text);
  -- Metadata-only clean contract fixture in this already guarded disposable QA DB.
  insert into public.document_security_jobs(bucket,object_path,checksum,size_bytes,mime_type,state,ready,engine_version,signature_version,signature_at,scanned_at)
  values('provider-documents',p_org::text||'/'||doc::text,repeat('0',64),20,'application/pdf','clean',true,'1.4.6','1',now(),now());
  perform set_config('request.jwt.claim.sub',p_provider::text,true);
  perform public.portal_command('register_document',jsonb_build_object('organizationId',p_org,'documentId',doc,'name','LOCAL ONLY authority fixture.pdf','documentType','supporting_evidence','storagePath',p_org::text||'/'||doc::text,'mimeType','application/pdf','sizeBytes',20));
  req:=(public.portal_network_command('submit_organization_verification',jsonb_build_object('organizationId',p_org,'operationId',gen_random_uuid(),'documentId',doc,'hospitalId',p_hospital,'legalName','LOCAL QA authority fixture','contactName','Local QA representative','contactEmail','authority@qa.invalid','contactPhone','00000000','declaration','Disposable local authority test. No real organization is represented.','confirmed',true))->>'requestId')::uuid;
  perform set_config('request.jwt.claim.sub',p_admin::text,true);
  perform public.portal_command('review_document',jsonb_build_object('documentId',doc,'status','approved','message','Disposable local authority evidence only.'));
  perform public.portal_network_command('review_organization_verification',jsonb_build_object('organizationId',p_org,'operationId',gen_random_uuid(),'requestId',req,'status','approved','reason','Disposable local authority decision only.','contactConfirmation','Simulated contact confirmation in isolated QA only.','confirmed',true));
  perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
end;$$;
