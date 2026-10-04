alter table public.packages add column city_id uuid references public.cities(id);
alter table public.packages drop constraint packages_price_type_check;
alter table public.packages add constraint packages_price_type_check check(price_type in ('estimate','package_price','quoted','historical','starting_price','published_price'));

-- Stale/unresolved reference children cannot remain visible through an old
-- association or a profile projection. First-party behavior is preserved.
do $$declare d text;begin
  d:=pg_get_functiondef('private.portal_snapshot_published(uuid)'::regprocedure);
  d:=replace(d,'where r.id=p_record','where (o.onboarding_origin<>''admin_reference'' or private.reference_claims_complete(r.id,r.published_revision,true)) and r.id=p_record');execute d;
  d:=pg_get_functiondef('private.catalog_source_allowed(text,uuid)'::regprocedure);
  d:=replace(d,'and s.verification_status not in','and (s.source_identifier is null or s.source_identifier not like ''provider-record:%'' or p_kind<>''external'' or exists(select 1 from public.provider_records r join public.organizations o on o.id=r.organization_id where o.onboarding_origin=''admin_reference'' and s.source_identifier=''provider-record:''||r.id||'':revision:''||r.published_revision and private.reference_claims_complete(r.id,r.published_revision,true))) and s.verification_status not in');execute d;
  d:=pg_get_functiondef('private.portal_project_record(uuid,integer)'::regprocedure);
  d:=replace(d,'if r.kind=''doctor'' then','if r.kind in (''doctor'',''package'') then');
  d:=replace(d,'update public.doctors set home_city_id=ci where id=(select canonical_id from public.provider_records where id=p_record);','if r.kind=''doctor'' then update public.doctors set home_city_id=ci where id=(select canonical_id from public.provider_records where id=p_record); else update public.packages set city_id=ci,country_id=(select country_id from public.cities where id=ci),price_type=coalesce(v.data->>''priceType'',''estimate'') where id=(select canonical_id from public.provider_records where id=p_record);end if;');execute d;
  d:=pg_get_functiondef('public.public_provider_profile(uuid)'::regprocedure);
  d:=replace(d,'select lv.data->>''cityId'' from','select (select name from public.cities where id=(lv.data->>''cityId'')::uuid) from');execute d;
end;$$;

-- Reference membership is prohibited even through a service-side invite.
create function private.reference_membership_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin if private.portal_reference(new.organization_id) then raise exception 'PORTAL_DENIED';end if;return new;end;$$;
create trigger reference_no_provider_members before insert or update on public.organization_members for each row execute function private.reference_membership_guard();
create trigger reference_no_provider_invites before insert or update on public.organization_invites for each row execute function private.reference_membership_guard();
revoke all on function private.reference_membership_guard() from public,anon,authenticated;

-- Explicit, bounded multi-claim review. Each decision still uses the existing
-- append-only field-review RPC, evidence checks and audit event. Accreditation
-- body verification remains a separate, independently evidenced decision.
alter function public.portal_reference_command(text,jsonb) set schema private;
alter function private.portal_reference_command(text,jsonb) rename to portal_reference_command_before_scope;
create function public.portal_reference_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.provider_records;c record;count_value integer:=0;begin
  if p_action<>'review_reference_claims' then return private.portal_reference_command_before_scope(p_action,p_input);end if;
  if not private.portal_active() or not private.portal_admin() or p_input->>'confirmed' is distinct from 'true' then raise exception 'PORTAL_DENIED';end if;
  select * into r from public.provider_records where id=(p_input->>'recordId')::uuid for update;
  if not private.portal_reference(r.organization_id) or r.revision is distinct from (p_input->>'expectedRevision')::integer or not exists(select 1 from public.provider_submission_items where submission_id=(p_input->>'submissionId')::uuid and record_id=r.id and revision=r.revision) then raise exception 'PORTAL_CONFLICT';end if;
  if not private.reference_claims_complete(r.id,r.revision,false) then raise exception 'PORTAL_REFERENCE_CLAIMS_REQUIRED';end if;
  for c in select claim.field,claim.evidence_summary,s.source_url from public.provider_reference_claims claim join public.source_records s on s.id=claim.source_record_id where claim.record_id=r.id and claim.revision=r.revision order by claim.field loop
    perform public.portal_command('review_field',jsonb_build_object('submissionId',p_input->>'submissionId','recordId',r.id,'field',c.field,'sourceUrl',c.source_url,'status',case when r.kind='organization' and c.field='name' and p_input->>'identityChecked'='true' then 'verified' else 'approved' end,'evidence',c.evidence_summary));count_value:=count_value+1;
  end loop;
  return jsonb_build_object('id',r.id,'reviewedClaims',count_value);
end;$$;
revoke all on function private.portal_reference_command_before_scope(text,jsonb) from public,anon,authenticated;
revoke all on function public.portal_reference_command(text,jsonb) from public;
grant execute on function public.portal_reference_command(text,jsonb) to authenticated;
