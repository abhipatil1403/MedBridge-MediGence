-- Synthetic metadata contract fixtures ONLY. Not evidence of a genuine scan.
-- Never install this helper in hosted Supabase. Real ClamAV tests run separately.
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Disposable catalog QA database required';end if;end;$$;
insert into public.document_security_jobs(bucket,object_path,checksum,size_bytes,mime_type,state,ready,engine_version,signature_version,signature_at,scanned_at)
select bucket_id,name,repeat('0',64),20,'application/pdf','clean',true,'1.4.6','1',now(),now()
from storage.objects where bucket_id in ('care-documents','provider-documents')
on conflict(bucket,object_path) do nothing;
