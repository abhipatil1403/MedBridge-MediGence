create table public.catalog_drafts (
  id uuid primary key default gen_random_uuid(), entity text not null check(entity in ('treatments','specialties','countries','cities','healthcare_services','hospitals','doctors','packages')),
  target_id uuid, name text not null, data jsonb not null check(jsonb_typeof(data)='object'),
  revision integer not null default 1, expected_updated_at timestamptz,
  status text not null default 'draft' check(status in ('draft','approved','published','archived')),
  created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.catalog_drafts enable row level security;
revoke all on public.catalog_drafts from anon,authenticated;grant select on public.catalog_drafts to authenticated;grant all on public.catalog_drafts to service_role;
create policy catalog_drafts_admin on public.catalog_drafts for select to authenticated using(private.portal_admin());
alter table public.specialties add column publication_status text not null default 'published' check(publication_status in ('draft','published','archived'));
alter table public.cities add column publication_status text not null default 'published' check(publication_status in ('draft','published','archived'));
drop policy specialties_public on public.specialties;
create policy specialties_public on public.specialties for select to anon,authenticated using(publication_status='published');
drop policy cities_public on public.cities;
create policy cities_public on public.cities for select to anon,authenticated using(publication_status='published' and exists(select 1 from public.countries co where co.id=country_id and co.publication_status='published'));
grant select on public.source_records to authenticated;
create policy source_records_admin on public.source_records for select to authenticated using(private.portal_admin());

create function public.portal_catalog_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.catalog_drafts;old_row jsonb;payload jsonb;current_row jsonb;result jsonb;target uuid;allowed text[];k text;
begin
  if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
  if p_action='create_source' then
    if p_input->>'sourceKind' not in ('synthetic','external','first_party') or length(coalesce(p_input->>'name',''))<3 then raise exception 'PORTAL_INVALID';end if;
    if p_input->>'sourceKind'<>'synthetic' and coalesce(p_input->>'url','') !~ '^https://[^[:space:]]+$' then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
    insert into public.source_records(source_kind,source_name,source_url,retrieved_at,notes) values(p_input->>'sourceKind',p_input->>'name',nullif(p_input->>'url',''),now(),coalesce(p_input->>'notes','')) returning to_jsonb(source_records.*) into result;
    perform private.portal_audit('source.recorded','source',(result->>'id')::uuid,null,null,result);return result;
  elsif p_action='save_catalog_draft' then
    if p_input->>'entity' not in ('treatments','specialties','countries','cities','healthcare_services','hospitals','doctors','packages') then raise exception 'PORTAL_INVALID';end if;
    target:=nullif(p_input->>'targetId','')::uuid;
    if target is not null then execute format('select to_jsonb(x) from public.%I x where id=$1',p_input->>'entity') into current_row using target;if current_row is null then raise exception 'PORTAL_NOT_FOUND';end if;end if;
    if nullif(p_input->>'draftId','') is null then
      insert into public.catalog_drafts(entity,target_id,name,data,expected_updated_at,created_by) values(p_input->>'entity',target,p_input->>'name',p_input->'data',(current_row->>'updated_at')::timestamptz,auth.uid()) returning * into d;
    else
      select * into d from public.catalog_drafts where id=(p_input->>'draftId')::uuid for update;
      if not found or d.entity<>p_input->>'entity' or d.status in ('published','archived') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      if d.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
      old_row:=to_jsonb(d);update public.catalog_drafts set name=p_input->>'name',data=p_input->'data',revision=revision+1,status='draft',approved_by=null,updated_at=now() where id=d.id returning * into d;
    end if;
    perform private.portal_audit('catalog.draft_saved',d.entity,d.id,null,old_row,to_jsonb(d));return to_jsonb(d);
  elsif p_action in ('approve_catalog','archive_catalog_draft','publish_catalog') then
    select * into d from public.catalog_drafts where id=(p_input->>'draftId')::uuid for update;
    if not found then raise exception 'PORTAL_NOT_FOUND';end if;
    if d.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
    old_row:=to_jsonb(d);
    if p_action='approve_catalog' then
      if d.status<>'draft' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      update public.catalog_drafts set status='approved',approved_by=auth.uid(),updated_at=now() where id=d.id returning * into d;
    elsif p_action='archive_catalog_draft' then
      if p_input->>'confirmed'<>'true' then raise exception 'PORTAL_CONFIRM_REQUIRED';end if;
      update public.catalog_drafts set status='archived',updated_at=now() where id=d.id returning * into d;
    else
      if d.status<>'approved' or p_input->>'confirmed'<>'true' then raise exception 'PORTAL_TRANSITION_INVALID';end if;
      target:=coalesce(d.target_id,gen_random_uuid());
      if d.target_id is not null then
        execute format('select to_jsonb(x) from public.%I x where id=$1 for update',d.entity) into current_row using d.target_id;
        if current_row is null or (current_row->>'updated_at')::timestamptz is distinct from d.expected_updated_at then raise exception 'PORTAL_CONFLICT';end if;
      else
        if d.entity in ('hospitals','doctors','packages') then raise exception 'PORTAL_USE_PROVIDER_WORKFLOW';end if;
        current_row:=jsonb_build_object('id',target,'aliases','[]'::jsonb,'created_at',now(),'updated_at',now(),'source_kind','synthetic','publication_status','draft','faqs','[]'::jsonb,'steps','[]'::jsonb,'description','','travel_note','','status','draft');
      end if;
      allowed:=case d.entity
        when 'treatments' then array['slug','name','specialty_id','category','description','overview','procedure_summary','indications','diagnostics','recovery','typical_stay_days','faqs','aliases','source_kind','source_record_id']
        when 'specialties' then array['slug','name','aliases','source_kind','source_record_id']
        when 'countries' then array['slug','name','iso_code','description','aliases','travel_note','source_kind','source_record_id']
        when 'cities' then array['slug','name','country_id','aliases']
        when 'healthcare_services' then array['slug','name','description','aliases','href','category','steps','source_kind','source_record_id']
        when 'hospitals' then array['name','description','city_id','aliases','bed_count','infrastructure','accreditation_note','source_record_id']
        when 'doctors' then array['name','description','home_city_id','experience_years','languages','consultation_mode','qualifications_note','aliases','source_record_id']
        else array['name','description','duration_days','currency','estimated_min','estimated_max','valid_from','valid_until','benefits','source_record_id'] end;
      payload:=current_row;
      for k in select jsonb_object_keys(d.data) loop if not k=any(allowed) then raise exception 'PORTAL_INVALID_FIELD';end if;payload:=jsonb_set(payload,array[k],d.data->k);end loop;
      payload:=payload||jsonb_build_object('name',d.name,'updated_at',now());
      if d.entity in ('hospitals','doctors','packages') and exists(select 1 from public.provider_records where canonical_id=target) then raise exception 'PORTAL_USE_PROVIDER_WORKFLOW';end if;
      if d.entity='healthcare_services' then
        if coalesce(payload->>'href','') !~ '^/[a-zA-Z0-9/_-]+$' then raise exception 'PORTAL_INVALID';end if;
        payload:=payload||'{"status":"published"}'::jsonb;
      elsif d.entity='packages' then payload:=payload||'{"publication_status":"published","status":"active"}'::jsonb;
      else payload:=payload||'{"publication_status":"published"}'::jsonb;end if;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I,$1)).* on conflict(id) do update set (%2$s)=(select %2$s from jsonb_populate_record(null::public.%1$I,$1))',d.entity,
        (select string_agg(quote_ident(column_name),',') from information_schema.columns where table_schema='public' and table_name=d.entity and column_name<>'id')) using payload;
      update public.catalog_drafts set target_id=target,status='published',updated_at=now() where id=d.id returning * into d;
      perform private.portal_audit('catalog.published',d.entity,target,null,current_row,payload);
    end if;
    perform private.portal_audit('catalog.'||d.status,d.entity,d.id,null,old_row,to_jsonb(d));return to_jsonb(d);
  elsif p_action='unpublish_catalog' then
    if p_input->>'entity' not in ('treatments','specialties','countries','cities','healthcare_services','hospitals','doctors','packages') or p_input->>'confirmed'<>'true' then raise exception 'PORTAL_INVALID';end if;
    target:=(p_input->>'targetId')::uuid;
    if exists(select 1 from public.provider_records where canonical_id=target and kind in ('organization','doctor','package')) then raise exception 'PORTAL_USE_PROVIDER_WORKFLOW';end if;
    if (p_input->>'entity'='treatments' and (exists(select 1 from public.hospital_treatments where treatment_id=target) or exists(select 1 from public.packages where treatment_id=target and status='active')))
      or (p_input->>'entity'='specialties' and (exists(select 1 from public.treatments where specialty_id=target and publication_status='published') or exists(select 1 from public.hospital_specialties where specialty_id=target) or exists(select 1 from public.doctor_specialties where specialty_id=target)))
      or (p_input->>'entity'='cities' and (exists(select 1 from public.hospitals where city_id=target and publication_status='published') or exists(select 1 from public.doctors where home_city_id=target and publication_status='published')))
      or (p_input->>'entity'='countries' and exists(select 1 from public.cities where country_id=target and publication_status='published')) then raise exception 'PORTAL_REFERENCED_CONTENT';end if;
    execute format('select to_jsonb(x) from public.%I x where id=$1 for update',p_input->>'entity') into current_row using target;
    if current_row is null then raise exception 'PORTAL_NOT_FOUND';end if;
    if (current_row->>'updated_at')::timestamptz is distinct from (p_input->>'expectedUpdatedAt')::timestamptz then raise exception 'PORTAL_CONFLICT';end if;
    execute format('update public.%I set %I=$1,updated_at=now() where id=$2',p_input->>'entity',case when p_input->>'entity'='healthcare_services' then 'status' else 'publication_status' end) using 'draft',target;
    perform private.portal_audit('catalog.unpublished',p_input->>'entity',target,null,current_row);return '{}';
  end if;raise exception 'PORTAL_ACTION_INVALID';
end;$$;

create function public.portal_analytics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
  return jsonb_build_object('organizations',(select count(*) from public.organizations),'publishedProviders',(select count(*) from public.provider_records where kind='organization' and published_revision is not null),
    'pendingSubmissions',(select count(*) from public.provider_submissions where status in ('submitted','under_review')),'publishedPackages',(select count(*) from public.provider_records where kind='package' and published_revision is not null),
    'openCases',(select count(*) from public.support_cases where status not in ('resolved','closed') and consent_revoked_at is null),'escalations',(select count(*) from public.support_cases where status='escalated' and consent_revoked_at is null),
    'conflicts',(select count(*) from public.provider_field_reviews f where f.status='conflicting' and not exists(select 1 from public.provider_field_reviews newer where newer.record_id=f.record_id and newer.field=f.field and newer.sequence>f.sequence)),
    'agentRuns',(select count(*) from public.agent_runs),'submissionStates',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from(select status,count(*) n from public.provider_submissions group by status)x),
    'caseStates',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from(select status,count(*) n from public.support_cases where consent_revoked_at is null group by status)x));
end;$$;
revoke all on function public.portal_catalog_command(text,jsonb),public.portal_analytics() from public,anon;
grant execute on function public.portal_catalog_command(text,jsonb),public.portal_analytics() to authenticated;
