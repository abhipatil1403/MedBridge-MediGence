alter table public.packages add column publication_status text not null default 'draft' check(publication_status in ('draft','published','archived'));
update public.packages set publication_status='published' where status='active';
create function private.portal_published(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_records r join public.organizations o on o.id=r.organization_id
    where r.canonical_id=p_id and r.kind=case when p_kind='hospital' then 'organization' else p_kind end and r.published_revision is not null and o.status='active'
    and exists(select 1 from public.provider_records profile where profile.organization_id=o.id and profile.kind='organization' and profile.published_revision is not null));
$$;
create function private.portal_not_suppressed(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.provider_records r where r.canonical_id=p_id and r.kind=case when p_kind='hospital' then 'organization' else p_kind end) or private.portal_published(p_kind,p_id);
$$;
drop policy hospitals_public on public.hospitals;
create policy hospitals_public on public.hospitals for select to anon,authenticated using(publication_status='published' and (source_kind='synthetic' or verification_status='verified' or private.portal_published('hospital',id)) and private.portal_not_suppressed('hospital',id));
drop policy doctors_public on public.doctors;
create policy doctors_public on public.doctors for select to anon,authenticated using(publication_status='published' and (source_kind='synthetic' or verification_status='verified' or private.portal_published('doctor',id)) and private.portal_not_suppressed('doctor',id));
drop policy packages_public on public.packages;
create policy packages_public on public.packages for select to anon,authenticated using(publication_status='published' and status='active' and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date)
  and private.portal_not_suppressed('package',id) and exists(select 1 from public.treatments t where t.id=treatment_id and t.publication_status='published')
  and exists(select 1 from public.countries co where co.id=country_id and co.publication_status='published') and (hospital_id is null or exists(select 1 from public.hospitals h where h.id=hospital_id)));
drop policy hospital_specialties_public on public.hospital_specialties;
create policy hospital_specialties_public on public.hospital_specialties for select to anon,authenticated using(exists(select 1 from public.hospitals h where h.id=hospital_id));
drop policy hospital_treatments_public on public.hospital_treatments;
create policy hospital_treatments_public on public.hospital_treatments for select to anon,authenticated using(exists(select 1 from public.hospitals h where h.id=hospital_id) and exists(select 1 from public.treatments t where t.id=treatment_id));
drop policy hospital_doctors_public on public.hospital_doctors;
create policy hospital_doctors_public on public.hospital_doctors for select to anon,authenticated using(exists(select 1 from public.hospitals h where h.id=hospital_id) and exists(select 1 from public.doctors d where d.id=doctor_id));
drop policy doctor_specialties_public on public.doctor_specialties;
create policy doctor_specialties_public on public.doctor_specialties for select to anon,authenticated using(exists(select 1 from public.doctors d where d.id=doctor_id));
drop policy doctor_treatments_public on public.doctor_treatments;
create policy doctor_treatments_public on public.doctor_treatments for select to anon,authenticated using(exists(select 1 from public.doctors d where d.id=doctor_id) and exists(select 1 from public.treatments t where t.id=treatment_id));

create function private.portal_refresh_hospital(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
declare hid uuid;begin
  select hospital_id into hid from public.organizations where id=p_org;if hid is null then return;end if;
  delete from public.hospital_specialties where hospital_id=hid;
  insert into public.hospital_specialties(hospital_id,specialty_id)
    select distinct hid,(v.data->>'specialtyId')::uuid from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='specialty';
  delete from public.hospital_treatments where hospital_id=hid;
  insert into public.hospital_treatments(hospital_id,treatment_id,source_record_id)
    select distinct on(v.data->>'treatmentId') hid,(v.data->>'treatmentId')::uuid,
      (select id from public.source_records where source_identifier='provider-record:'||r.id||':revision:'||v.revision limit 1)
    from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='treatment';
  update public.hospitals set infrastructure=coalesce((select array_agg(v.name order by v.name) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind in ('facility','international_service')),'{}'),
    bed_count=(select nullif(v.data->>'quantity','')::integer from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='facility' and v.data->>'facilityType'='beds' limit 1),
    accreditation_note=(select string_agg(v.name,'; ' order by v.name) from public.provider_records r join public.provider_revisions v on v.record_id=r.id and v.revision=r.published_revision where r.organization_id=p_org and r.kind='accreditation') where id=hid;
end;$$;
create function private.portal_project_record(p_record uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.provider_records;v public.provider_revisions;o public.organizations;src uuid;canonical uuid;ci uuid;co uuid;
  slug_value text;key_value uuid;position_value integer;entry text;
begin
  select * into r from public.provider_records where id=p_record for update;
  select * into v from public.provider_revisions where record_id=p_record and revision=p_revision;
  select * into o from public.organizations where id=r.organization_id for update;
  if r.revision<>p_revision or r.status<>'approved' or o.status<>'active' then raise exception 'PORTAL_CONFLICT';end if;
  perform private.portal_validate_record(r.kind,v.data,true);
  canonical:=coalesce(r.canonical_id,gen_random_uuid());slug_value:='mb-'||left(regexp_replace(lower(v.name),'[^a-z0-9]+','-','g'),65)||'-'||left(replace(r.id::text,'-',''),12);
  insert into public.source_records(source_kind,source_name,source_identifier,source_url,verification_status,retrieved_at,notes)
    values(o.source_kind,o.name,'provider-record:'||r.id||':revision:'||p_revision,nullif(v.data->>'website',''),'unverified',now(),'Provider-submitted content. Publication review is distinct from factual or clinical verification.') returning id into src;
  if r.kind='organization' then
    ci:=(v.data->>'cityId')::uuid;
    insert into public.hospitals(id,slug,name,city_id,description,verification_status,source_kind,publication_status,source_record_id)
      values(canonical,slug_value,v.name,ci,v.data->>'description','pending_verification',o.source_kind,'published',src)
      on conflict(id) do update set name=excluded.name,city_id=excluded.city_id,description=excluded.description,publication_status='published',source_record_id=src,updated_at=now();
    update public.organizations set hospital_id=canonical,name=v.name,legal_name=coalesce(v.data->>'legalName',legal_name),updated_at=now() where id=o.id;
  else
    if o.hospital_id is null then raise exception 'PORTAL_PARENT_NOT_PUBLISHED';end if;
    select city_id into ci from public.hospitals where id=o.hospital_id;select country_id into co from public.cities where id=ci;
    if r.kind='specialty' then
      key_value:=(v.data->>'specialtyId')::uuid;insert into public.hospital_specialties(hospital_id,specialty_id) values(o.hospital_id,key_value) on conflict do nothing;canonical:=key_value;
    elsif r.kind='treatment' then
      key_value:=(v.data->>'treatmentId')::uuid;insert into public.hospital_treatments(hospital_id,treatment_id,source_record_id) values(o.hospital_id,key_value,src) on conflict(hospital_id,treatment_id) do update set source_record_id=src;canonical:=key_value;
    elsif r.kind='doctor' then
      insert into public.doctors(id,slug,name,description,home_city_id,experience_years,languages,consultation_mode,qualifications_note,verification_status,source_kind,publication_status,source_record_id)
        values(canonical,slug_value,v.name,v.data->>'biography',ci,nullif(v.data->>'experienceYears','')::integer,coalesce(array(select jsonb_array_elements_text(v.data->'languages')),'{}'),v.data->>'consultationMode',coalesce(v.data->>'credentials',''),'pending_verification',o.source_kind,'published',src)
        on conflict(id) do update set name=excluded.name,description=excluded.description,home_city_id=ci,experience_years=excluded.experience_years,languages=excluded.languages,consultation_mode=excluded.consultation_mode,qualifications_note=excluded.qualifications_note,publication_status='published',source_record_id=src,updated_at=now();
      delete from public.doctor_specialties where doctor_id=canonical;
      insert into public.doctor_specialties(doctor_id,specialty_id,is_primary) values(canonical,(v.data->>'specialtyId')::uuid,true);
      delete from public.doctor_treatments where doctor_id=canonical;
      for entry in select jsonb_array_elements_text(coalesce(v.data->'treatmentIds','[]')) loop
        if not exists(select 1 from public.treatments where id=entry::uuid and publication_status='published') then raise exception 'PORTAL_CATALOG_REQUIRED';end if;
        insert into public.doctor_treatments(doctor_id,treatment_id) values(canonical,entry::uuid) on conflict do nothing;
      end loop;
      insert into public.hospital_doctors(hospital_id,doctor_id,is_primary,source_record_id) values(o.hospital_id,canonical,true,src) on conflict(hospital_id,doctor_id) do update set source_record_id=src;
    elsif r.kind='package' then
      insert into public.packages(id,slug,name,description,treatment_id,hospital_id,country_id,duration_days,currency,estimated_min,estimated_max,price_type,status,valid_from,valid_until,source_kind,source_record_id,publication_status)
        values(canonical,slug_value,v.name,v.data->>'description',(v.data->>'treatmentId')::uuid,o.hospital_id,co,(v.data->>'durationDays')::integer,v.data->>'currency',(v.data->>'price')::numeric,(v.data->>'price')::numeric,'estimate','active',nullif(v.data->>'validFrom','')::date,nullif(v.data->>'validUntil','')::date,o.source_kind,src,'published')
        on conflict(id) do update set name=excluded.name,description=excluded.description,treatment_id=excluded.treatment_id,duration_days=excluded.duration_days,currency=excluded.currency,estimated_min=excluded.estimated_min,estimated_max=excluded.estimated_max,valid_from=excluded.valid_from,valid_until=excluded.valid_until,status='active',publication_status='published',source_record_id=src,updated_at=now();
      delete from public.package_inclusions where package_id=canonical;delete from public.package_exclusions where package_id=canonical;
      position_value:=0;for entry in select jsonb_array_elements_text(coalesce(v.data->'inclusions','[]')) loop insert into public.package_inclusions(package_id,position,description) values(canonical,position_value,entry);position_value:=position_value+1;end loop;
      position_value:=0;for entry in select jsonb_array_elements_text(coalesce(v.data->'exclusions','[]')) loop insert into public.package_exclusions(package_id,position,description) values(canonical,position_value,entry);position_value:=position_value+1;end loop;
    end if;
  end if;
  update public.provider_records set canonical_id=case when r.kind in ('organization','doctor','package','specialty','treatment') then canonical else null end,published_revision=p_revision,status='published',updated_at=now() where id=r.id;
  perform private.portal_audit('record.published',r.kind,r.id,o.id,null,to_jsonb(v));
end;$$;

create function public.portal_publication_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.provider_submissions;r public.provider_records;o public.organizations;i record;old_row jsonb;new_status text;
begin
  if not private.portal_active() then raise exception 'PORTAL_DENIED';end if;
  if p_action='publish_submission' then
    if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
    select * into s from public.provider_submissions where id=(p_input->>'submissionId')::uuid for update;
    if not found or s.status<>'approved' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
    select * into o from public.organizations where id=s.organization_id for update;
    for i in select item.*,pr.kind from public.provider_submission_items item join public.provider_records pr on pr.id=item.record_id where item.submission_id=s.id order by case pr.kind when 'organization' then 0 when 'doctor' then 2 when 'package' then 3 else 1 end loop
      if o.source_kind<>'synthetic' and i.kind in ('organization','accreditation') then
        if not exists(select 1 from public.provider_field_reviews f where f.record_id=i.record_id and f.revision=i.revision and f.field=case when i.kind='organization' then 'name' else 'body' end and f.status='verified' and (f.expires_on is null or f.expires_on>=current_date)
          and not exists(select 1 from public.provider_field_reviews later where later.record_id=f.record_id and later.revision=f.revision and later.field=f.field and later.sequence>f.sequence)
          and (f.document_id is null or exists(select 1 from public.provider_documents d where d.id=f.document_id and d.status='approved' and (d.expires_on is null or d.expires_on>=current_date)))) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
      end if;
      if exists(select 1 from public.provider_field_reviews f where f.record_id=i.record_id and f.revision=i.revision and f.status in ('conflicting','rejected','stale') and not exists(select 1 from public.provider_field_reviews later where later.record_id=f.record_id and later.revision=f.revision and later.field=f.field and later.sequence>f.sequence)) then raise exception 'PORTAL_REVIEW_UNRESOLVED';end if;
      perform private.portal_project_record(i.record_id,i.revision);
    end loop;
    perform private.portal_refresh_hospital(o.id);
    update public.provider_submissions set status='published',updated_at=now() where id=s.id returning * into s;
    perform private.portal_audit('submission.published','submission',s.id,o.id,null,to_jsonb(s));
    perform private.portal_notify_org(o.id,'Your information is published','Approved snapshots are now available in public discovery.','submission',s.id);return to_jsonb(s);
  elsif p_action in ('archive_record','unpublish_record','expire_record') then
    select * into r from public.provider_records where id=(p_input->>'recordId')::uuid for update;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if not private.portal_admin() and not(private.portal_member(r.organization_id) and r.published_revision is null and p_action='archive_record') then raise exception 'PORTAL_DENIED';end if;
    if r.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
    if p_input->>'confirmed'<>'true' then raise exception 'PORTAL_CONFIRM_REQUIRED';end if;
    old_row:=to_jsonb(r);new_status:=case p_action when 'archive_record' then 'archived' when 'expire_record' then 'expired' else 'approved' end;
    if r.kind='organization' then update public.hospitals set publication_status='draft' where id=r.canonical_id;
    elsif r.kind='doctor' then update public.doctors set publication_status='draft' where id=r.canonical_id;
    elsif r.kind='package' then update public.packages set publication_status='draft',status=case when new_status='expired' then 'expired' when new_status='archived' then 'archived' else 'paused' end where id=r.canonical_id;
    elsif r.kind='specialty' then delete from public.hospital_specialties where hospital_id=(select hospital_id from public.organizations where id=r.organization_id) and specialty_id=r.canonical_id;
    elsif r.kind='treatment' then delete from public.hospital_treatments where hospital_id=(select hospital_id from public.organizations where id=r.organization_id) and treatment_id=r.canonical_id;
    end if;
    update public.provider_records set published_revision=null,status=new_status,updated_at=now() where id=r.id returning * into r;
    perform private.portal_refresh_hospital(r.organization_id);perform private.portal_audit('record.'||new_status,r.kind,r.id,r.organization_id,old_row,to_jsonb(r));
    perform private.portal_notify_org(r.organization_id,'Publication changed',r.name||': '||new_status,'record',r.id);return to_jsonb(r);
  end if;raise exception 'PORTAL_ACTION_INVALID';
end;$$;
revoke all on function private.portal_published(text,uuid),private.portal_not_suppressed(text,uuid),private.portal_refresh_hospital(uuid),private.portal_project_record(uuid,integer) from public;
grant execute on function private.portal_published(text,uuid),private.portal_not_suppressed(text,uuid) to anon,authenticated;
revoke all on function public.portal_publication_command(text,jsonb) from public,anon;
grant execute on function public.portal_publication_command(text,jsonb) to authenticated;
