-- Avoid alias ambiguity with the PL/pgSQL organization record in the no-owner
-- and pending-authority branches, including independently sourced public listings.
create or replace function private.provider_connectivity(p_kind text,p_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare owner uuid;o public.organizations;hospital uuid;begin
  if private.inquiry_connected_org(p_kind,p_id) is not null then return 'connected';end if;
  select organization_id into owner from public.provider_listing_ownership where entity_kind=p_kind and entity_id=p_id and revoked_at is null;
  if owner is not null then
    select * into o from public.organizations where id=owner;
    if o.status<>'active' then return 'access_suspended';end if;
    if not private.provider_organization_approved(owner) then return 'authority_pending';end if;
    if not exists(select 1 from public.organization_members m where m.organization_id=owner and m.active and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active)) then return 'no_authorized_team';end if;
    return 'listing_unavailable';
  end if;
  hospital:=case p_kind when 'hospital' then p_id when 'package' then (select hospital_id from public.packages where id=p_id) end;
  if exists(select 1 from public.organization_verification_requests v join public.organizations candidate_org on candidate_org.verification_request_id=v.id where v.requested_hospital_id=hospital and candidate_org.status='active' and v.status in ('submitted','changes_requested')) then return 'authority_pending';end if;
  if exists(select 1 from public.organization_verification_requests v join public.organizations candidate_org on candidate_org.verification_request_id=v.id where v.requested_hospital_id=hospital and private.provider_organization_approved(candidate_org.id)) then return 'ownership_pending';end if;
  return 'no_owner';
end;$$;
revoke all on function private.provider_connectivity(text,uuid) from public,anon,authenticated;
