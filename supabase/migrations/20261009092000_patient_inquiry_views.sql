create function public.inquiry_target(p_kind text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n text;s text;r integer;oid uuid;oname text;begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_kind is null or p_kind not in ('hospital','doctor','package') or not private.catalog_public_visible(p_kind,p_id) then raise exception 'INQUIRY_ENTITY_UNAVAILABLE';end if;
  if p_kind='hospital' then select name,slug into n,s from public.hospitals where id=p_id;
  elsif p_kind='doctor' then select name,slug into n,s from public.doctors where id=p_id;
  else select name,slug into n,s from public.packages where id=p_id;end if;
  select pr.published_revision into r from public.provider_records pr where pr.canonical_id=p_id and pr.kind=case p_kind when 'hospital' then 'organization' else p_kind end and pr.published_revision is not null order by pr.id limit 1;
  select o.id,o.name into oid,oname from public.provider_records pr join public.organizations o on o.id=pr.organization_id where pr.canonical_id=p_id and pr.kind=case p_kind when 'hospital' then 'organization' else p_kind end and pr.published_revision is not null and o.status='active' and o.onboarding_origin='provider_submitted' and o.source_kind<>'synthetic' order by pr.id limit 1;
  if oid is not null and not exists(select 1 from public.organization_members m where m.organization_id=oid and m.active and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active)) then oid:=null;oname:=null;end if;
  return jsonb_build_object('kind',p_kind,'id',p_id,'name',n,'href','/'||case p_kind when 'hospital' then 'hospitals' when 'doctor' then 'doctors' else 'packages' end||'/'||s,'publishedRevision',r,'organizationId',oid,'organizationName',oname);
end;$$;

create function public.inquiry_context(p_case_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.support_cases;own boolean;staff boolean;prov boolean;result jsonb;begin
  if not private.portal_case_access(p_case_id) then raise exception 'PORTAL_DENIED';end if;
  select * into c from public.support_cases where id=p_case_id;
  own:=c.patient_id=auth.uid();staff:=private.portal_case_staff(c.id);prov:=not own and not staff;
  result:=jsonb_build_object(
    'case',jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'status',c.status,'priority',c.priority,'assigned_to',case when staff then c.assigned_to end,'due_at',c.due_at,'revision',c.revision,'created_at',c.created_at,'updated_at',c.updated_at,'inquiry_source',c.inquiry_source,'entity_snapshot',c.entity_snapshot,'share_with_provider',c.share_with_provider,'consent_revoked_at',c.consent_revoked_at,'consent_granted_at',c.consent_granted_at,'resolution_summary',c.resolution_summary,'provider_response_status',c.provider_response_status,'provider_responded_at',c.provider_responded_at,'recovery_journey_id',case when own then c.recovery_journey_id end),
    'role',case when own then 'patient' when staff then 'support' else 'provider' end,
    'patient',jsonb_build_object('displayName',(select display_name from public.profiles where id=c.patient_id)),
    'organization',case when c.organization_id is not null then (select jsonb_build_object('id',id,'name',name) from public.organizations where id=c.organization_id) end,
    'messages',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select id,body,visibility,created_at,case when actor_id=c.patient_id then 'Patient' when exists(select 1 from public.staff_roles sr where sr.user_id=m.actor_id and sr.active) then 'Support' else 'Provider' end as sender from public.support_case_messages m where case_id=c.id and private.portal_case_visibility(c.id,visibility) order by created_at desc limit 200) x),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,action,summary,visibility,created_at from public.support_case_events where case_id=c.id and private.portal_case_visibility(c.id,visibility) order by created_at desc limit 200) x),'[]'),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'filename',d.filename,'mime_type',d.mime_type,'size_bytes',d.size_bytes,'status',d.status,'uploaded_at',d.uploaded_at,'request_id',d.request_id,'review_note',d.review_note,'reviewed_at',d.reviewed_at,'grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'recipient',g.recipient,'purpose',g.purpose,'granted_at',g.granted_at,'revoked_at',g.revoked_at)) from public.support_document_grants g where g.document_id=d.id and (own or (g.revoked_at is null and ((staff and g.recipient='support') or (prov and g.recipient='provider'))))),'[]')) order by d.created_at desc) from public.support_case_documents d where d.case_id=c.id and private.inquiry_document_access(d.id)),'[]'),
    'documentRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'purpose',purpose,'requesting_party',requesting_party,'status',status,'created_at',created_at) order by created_at desc) from public.support_document_requests where case_id=c.id and private.portal_case_visibility(c.id,visibility)),'[]'),
    'consents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'purpose',purpose,'granted_at',granted_at,'revoked_at',revoked_at) order by granted_at desc) from public.support_case_provider_consents where case_id=c.id),'[]'),
    'staffDirectory',case when staff then public.portal_staff_directory() else '[]'::jsonb end,
    'tasks',case when staff then coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.support_tasks t where t.case_id=c.id),'[]') else '[]'::jsonb end,
    'journeys',case when own then coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from public.recovery_journeys where owner_id=auth.uid() and stage<>'archived'),'[]') else '[]'::jsonb end,
    'unread', (select count(*) from public.support_case_messages m where case_id=c.id and actor_id<>auth.uid() and private.portal_case_visibility(c.id,visibility) and created_at>coalesce((select read_at from public.support_message_reads where case_id=c.id and user_id=auth.uid()),'-infinity'::timestamptz))
  );
  if staff then perform private.portal_audit('inquiry.staff_viewed','support_case',c.id,null,null,null);end if;
  return result;
end;$$;

-- Access is checked afresh at every file delivery, including after revocation.
create function public.inquiry_document_delivery(p_document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.support_case_documents;begin
  if not private.inquiry_document_access(p_document_id) then raise exception 'PORTAL_DENIED';end if;
  select * into d from public.support_case_documents where id=p_document_id;
  if d.status in ('pending_upload','withdrawn') then raise exception 'PORTAL_DENIED';end if;
  perform private.portal_audit('inquiry.document_downloaded','support_case',d.case_id,null,null,jsonb_build_object('documentId',d.id));
  return jsonb_build_object('id',d.id,'owner_id',d.owner_id,'case_id',d.case_id,'filename',d.filename,'mime_type',d.mime_type);
end;$$;

revoke all on function public.inquiry_target(text,uuid),public.inquiry_context(uuid),public.inquiry_document_delivery(uuid) from public,anon;
grant execute on function public.inquiry_target(text,uuid),public.inquiry_context(uuid),public.inquiry_document_delivery(uuid) to authenticated;
