-- Extend the canonical package projection. No parallel catalog or publication path.
alter table public.packages alter column estimated_min drop not null;
alter table public.packages alter column estimated_max drop not null;
alter table public.packages alter column currency drop not null;
alter table public.packages alter column duration_days drop not null;
alter table public.packages drop constraint packages_price_type_check;
alter table public.packages add constraint packages_price_type_check check(price_type in ('estimate','package_price','quoted','historical','starting_price','published_price','contact_provider','not_published'));
alter table public.packages add constraint package_price_shape check(
  (price_type in ('contact_provider','not_published') and estimated_min is null and estimated_max is null) or
  (price_type not in ('contact_provider','not_published') and estimated_min is not null and estimated_max is not null and currency is not null and currency ~ '^[A-Z]{3}$'));
alter table public.packages add column price_valid_from date;
alter table public.packages add column price_valid_until date;
alter table public.packages add constraint package_price_dates check(price_valid_until is null or price_valid_from is null or price_valid_until>=price_valid_from);

-- Preserve validation for every other record kind and the generic draft bounds.
alter function private.portal_validate_record(text,jsonb,boolean) rename to portal_validate_record_before_packages;
create function private.portal_validate_record(p_kind text,p_data jsonb,p_submit boolean default false) returns void language plpgsql set search_path='' as $$
declare k text;pt text:=coalesce(nullif(p_data->>'priceType',''),'estimate');
begin
  perform private.portal_validate_record_before_packages(p_kind,p_data,case when p_kind='package' then false else p_submit end);
  if p_kind<>'package' then return;end if;
  if pt not in ('estimate','package_price','quoted','historical','starting_price','published_price','contact_provider','not_published') then raise exception 'PORTAL_INVALID';end if;
  if nullif(p_data->>'priceMax','') is not null and ((p_data->>'priceMax')::numeric<0 or (p_data->>'priceMax')::numeric<coalesce((p_data->>'price')::numeric,0)) then raise exception 'PORTAL_INVALID';end if;
  if pt in ('contact_provider','not_published') and (nullif(p_data->>'price','') is not null or nullif(p_data->>'priceMax','') is not null) then raise exception 'PORTAL_INVALID';end if;
  foreach k in array array['procedure','hospitalStay','rehabilitation','localTransport','visaAssistance','accommodation','transfer','interpreter','consultation','diagnostics','followUp'] loop
    if nullif(p_data->>(k||'Status'),'') is not null and p_data->>(k||'Status') not in ('included','excluded','conditional','not_confirmed') then raise exception 'PORTAL_INVALID';end if;
    if p_submit and p_data->>(k||'Status')='conditional' and length(trim(coalesce(p_data->>(k||'Info'),'')))<5 then raise exception 'PORTAL_PACKAGE_CONDITIONS_REQUIRED';end if;
  end loop;
  if nullif(p_data->>'priceSourceUrl','') is not null and private.catalog_public_url(p_data->>'priceSourceUrl') is null then raise exception 'PORTAL_INVALID';end if;
  if nullif(p_data->>'priceCheckedAt','') is not null and ((p_data->>'priceCheckedAt')::date>current_date or (p_data->>'priceCheckedAt')::date<date '2000-01-01') then raise exception 'PORTAL_INVALID';end if;
  if nullif(p_data->>'priceValidUntil','') is not null and (p_data->>'priceValidUntil')::date<coalesce(nullif(p_data->>'priceValidFrom','')::date,date '2000-01-01') then raise exception 'PORTAL_INVALID';end if;
  if p_submit and (length(coalesce(p_data->>'description',''))<10 or not exists(select 1 from public.treatments where id=nullif(p_data->>'treatmentId','')::uuid and publication_status='published')
    or (pt not in ('contact_provider','not_published') and (nullif(p_data->>'price','') is null or coalesce(p_data->>'currency','')!~'^[A-Z]{3}$'))) then raise exception 'PORTAL_PACKAGE_REQUIRED';end if;
end;$$;
revoke all on function private.portal_validate_record(text,jsonb,boolean),private.portal_validate_record_before_packages(text,jsonb,boolean) from public,anon,authenticated;

-- Change the existing projector's package branch only. Its callers retain all
-- role, section, source, immutable revision, identity and parent checks.
do $$declare d text;begin
  d:=pg_get_functiondef('private.portal_project_record_previous(uuid,integer)'::regprocedure);
  d:=replace(d,'''estimate'',''active'',nullif(v.data->>''validFrom''','coalesce(v.data->>''priceType'',''estimate''),''active'',nullif(v.data->>''validFrom''');
  d:=replace(d,'(v.data->>''price'')::numeric,(v.data->>''price'')::numeric','nullif(v.data->>''price'','''')::numeric,coalesce(nullif(v.data->>''priceMax'',''''),nullif(v.data->>''price'',''''))::numeric');
  d:=replace(d,'(v.data->>''durationDays'')::integer','nullif(v.data->>''durationDays'','''')::integer');
  d:=replace(d,'estimated_max=excluded.estimated_max,valid_from=excluded.valid_from','estimated_max=excluded.estimated_max,price_type=excluded.price_type,valid_from=excluded.valid_from');
  execute d;
end;$$;

alter function private.portal_project_record(uuid,integer) rename to portal_project_record_before_package_scope;
create function private.portal_project_record(p_record uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.provider_records;v public.provider_revisions;ci uuid;begin
  select * into r from public.provider_records where id=p_record;
  select * into v from public.provider_revisions where record_id=p_record and revision=p_revision;
  if r.kind='package' and nullif(v.data->>'locationId','') is not null and not exists(select 1 from public.provider_records l where l.id=(v.data->>'locationId')::uuid and l.organization_id=r.organization_id and l.kind='location' and
    (private.portal_snapshot_published(l.id) or (l.status='published' and exists(select 1 from public.provider_submission_items li join public.provider_submission_items pi on pi.submission_id=li.submission_id join public.provider_submissions s on s.id=li.submission_id where li.record_id=l.id and li.revision=l.published_revision and pi.record_id=r.id and pi.revision=p_revision and s.status='approved')))) then raise exception 'PORTAL_REFERENCE_LOCATION_REQUIRED';end if;
  perform private.portal_project_record_before_package_scope(p_record,p_revision);
  if r.kind='package' then
    if nullif(v.data->>'locationId','') is not null then
      select (lv.data->>'cityId')::uuid into ci from public.provider_records l join public.provider_revisions lv on lv.record_id=l.id and lv.revision=l.published_revision where l.id=(v.data->>'locationId')::uuid;
    else select h.city_id into ci from public.organizations o join public.hospitals h on h.id=o.hospital_id where o.id=r.organization_id;end if;
    update public.packages set city_id=ci,country_id=(select country_id from public.cities where id=ci),price_type=coalesce(v.data->>'priceType','estimate'),
      price_valid_from=nullif(v.data->>'priceValidFrom','')::date,price_valid_until=nullif(v.data->>'priceValidUntil','')::date where id=(select canonical_id from public.provider_records where id=p_record);
  end if;
end;$$;
revoke all on function private.portal_project_record(uuid,integer),private.portal_project_record_before_package_scope(uuid,integer) from public,anon,authenticated;

create or replace function private.portal_package_details(p_data jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}';k text;begin
  foreach k in array array['procedure','hospitalStay','rehabilitation','localTransport','visaAssistance','accommodation','transfer','interpreter','consultation','diagnostics','followUp'] loop
    result:=result||jsonb_build_object(k,jsonb_build_object('status',case when p_data->>(k||'Status') in ('included','excluded','conditional','not_confirmed') then p_data->>(k||'Status') else 'not_confirmed' end,'information',nullif(p_data->>(k||'Info'),'')));
  end loop;return result;
end;$$;
revoke all on function private.portal_package_details(jsonb) from public,anon,authenticated;

-- Public evidence is a deliberately bounded read of the published revision.
-- Document contents, paths, actor IDs, private comments and draft data stay private.
create function public.public_package_evidence(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('field',f.field,'status',f.status,'sourceUrl',private.catalog_public_url(f.source_url),'checkedAt',f.created_at,'expiresOn',f.expires_on)),'[]')
  from public.provider_records r join public.provider_field_reviews f on f.record_id=r.id and f.revision=r.published_revision
  where r.kind='package' and r.canonical_id=p_id and private.catalog_public_visible('packages',p_id)
    and not exists(select 1 from public.provider_field_reviews later where later.record_id=f.record_id and later.revision=f.revision and later.field=f.field and later.sequence>f.sequence);
$$;
revoke all on function public.public_package_evidence(uuid) from public;
grant execute on function public.public_package_evidence(uuid) to anon,authenticated;

create function private.package_evidence_current(p_record uuid,p_revision integer) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_revisions where record_id=p_record and revision=p_revision)
    and not exists(select 1 from public.provider_revisions v cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) claim
      where v.record_id=p_record and v.revision=p_revision
        and claim.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb,'"not_confirmed"'::jsonb)
        and claim.key not in ('documentIds','priceSourceUrl','priceSourceName','priceCheckedAt')
        and not exists(select 1 from public.provider_field_reviews review where review.record_id=p_record and review.revision=p_revision and review.field=claim.key
          and review.status in ('approved','verified') and (review.expires_on is null or review.expires_on>=current_date)
          and (private.catalog_public_url(review.source_url) is not null or exists(select 1 from public.provider_documents doc where doc.id=review.document_id and doc.organization_id=v.organization_id and (doc.record_id is null or doc.record_id=p_record) and doc.status='approved' and (doc.expires_on is null or doc.expires_on>=current_date)))
          and not exists(select 1 from public.provider_field_reviews later where later.record_id=review.record_id and later.revision=review.revision and later.field=review.field and later.sequence>review.sequence)));
$$;
create function private.package_submission_evidence_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;begin
  if new.status in ('approved','published') and new.status is distinct from old.status then
    for item in select i.record_id,i.revision from public.provider_submission_items i join public.provider_records r on r.id=i.record_id join public.organizations o on o.id=r.organization_id
      where i.submission_id=new.id and r.kind='package' and o.source_kind<>'synthetic' loop
      if not private.package_evidence_current(item.record_id,item.revision) then raise exception 'PORTAL_PACKAGE_EVIDENCE_REQUIRED';end if;
    end loop;
  end if;return new;
end;$$;
create trigger package_submission_evidence_gate before update on public.provider_submissions for each row execute function private.package_submission_evidence_guard();
revoke all on function private.package_evidence_current(uuid,integer),private.package_submission_evidence_guard() from public,anon,authenticated;
