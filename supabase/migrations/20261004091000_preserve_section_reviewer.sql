-- A section decision starts review without silently reassigning the submission.
-- Approval permissions and current-evidence gates are preserved.
create or replace function public.portal_review_command(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  s public.provider_submissions;
  i public.provider_submission_items;
  r public.provider_records;
  result jsonb;
  previous jsonb;
  st text;
  doc uuid;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  select * into s from public.provider_submissions where id=(p_input->>'submissionId')::uuid for update;
  if not found then raise exception 'PORTAL_NOT_FOUND';end if;
  if not private.portal_reviewer(s.id) then raise exception 'PORTAL_DENIED';end if;
  if p_action='open_submission' then
    perform private.portal_audit('submission.opened','submission',s.id,s.organization_id,null,jsonb_build_object('status',s.status));
    return jsonb_build_object('id',s.id);
  elsif p_action='review_section' then
    if s.status not in ('submitted','under_review') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    st:=p_input->>'status';
    if st is null or st not in ('under_review','approved','changes_requested','evidence_required','rejected') then raise exception 'PORTAL_INVALID';end if;
    if st='approved' and not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    if st in ('changes_requested','evidence_required','rejected') and length(trim(coalesce(p_input->>'comment','')))<5 then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
    select * into i from public.provider_submission_items where submission_id=s.id and record_id=(p_input->>'recordId')::uuid;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    select * into r from public.provider_records where id=i.record_id for update;
    if r.revision<>i.revision or i.revision is distinct from (p_input->>'expectedRevision')::integer then raise exception 'PORTAL_CONFLICT';end if;
    doc:=nullif(p_input->>'documentId','')::uuid;
    if st='approved' and not private.portal_section_evidence_current(r.id,i.revision,s.organization_id,doc) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    if doc is not null and not exists(select 1 from public.provider_documents where id=doc and organization_id=s.organization_id and (record_id is null or record_id=i.record_id) and status not in ('archived','expired') and (st<>'approved' or status='approved') and (expires_on is null or expires_on>=current_date)) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    if s.status='submitted' then
      previous:=to_jsonb(s);
      update public.provider_records pr set status='under_review',updated_at=now()
        from public.provider_submission_items item
        where item.submission_id=s.id and item.record_id=pr.id and item.revision=pr.revision;
      update public.provider_submissions set status='under_review',updated_at=now() where id=s.id returning * into s;
      perform private.portal_audit('submission.under_review','submission',s.id,s.organization_id,previous,to_jsonb(s));
      perform private.portal_notify_org(s.organization_id,'Submission under review','Section review has started.','submission',s.id);
    end if;
    insert into public.provider_section_reviews(submission_id,record_id,revision,organization_id,status,comment,reason,document_id,reviewed_by)
      values(s.id,i.record_id,i.revision,s.organization_id,st,coalesce(p_input->>'comment',''),coalesce(p_input->>'reason',''),doc,auth.uid())
      returning to_jsonb(provider_section_reviews.*) into result;
    perform private.portal_audit('section.'||st,r.kind,r.id,s.organization_id,null,result);
    perform private.portal_notify_org(s.organization_id,'Review: '||r.name,replace(st,'_',' ')||case when coalesce(p_input->>'comment','')<>'' then ': '||(p_input->>'comment') else '' end,'submission',s.id);
    return result;
  end if;
  raise exception 'PORTAL_ACTION_INVALID';
end;$$;
revoke all on function public.portal_review_command(text,jsonb) from public,anon;
grant execute on function public.portal_review_command(text,jsonb) to authenticated;
