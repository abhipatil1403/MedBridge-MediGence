\set ON_ERROR_STOP on
begin;
do $$begin if current_database() not like 'production_catalog_%' then raise exception 'Isolated local database required';end if;end;$$;
create function pg_temp.read_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',msg;end if;raise notice 'PASS: %',msg;end;$$;
-- Frozen pre-optimization predicate, including source freshness, exact values,
-- latest review, review/source agreement and approved document conditions.
create function pg_temp.original_claims(p_record uuid,p_revision integer,p_reviewed boolean)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.provider_revisions v where v.record_id=p_record and v.revision=p_revision) and not exists(
    select 1 from public.provider_revisions v cross join lateral jsonb_each(v.data||jsonb_build_object('name',v.name)) f
    where v.record_id=p_record and v.revision=p_revision and f.value not in ('null'::jsonb,'""'::jsonb,'[]'::jsonb)
    and not exists(select 1 from public.provider_reference_claims c join public.source_records s on s.id=c.source_record_id
      where c.record_id=p_record and c.revision=p_revision and c.organization_id=v.organization_id and c.field=f.key and c.supported_value=f.value
      and s.source_kind='external' and s.source_type is not null and private.catalog_public_url(s.source_url) is not null
      and s.retrieved_at is not null and s.retrieved_at<=now()+interval '5 minutes' and s.verification_status not in ('rejected','conflicting','stale')
      and (not p_reviewed or (s.review_after is null or s.review_after>=current_date))
      and (not p_reviewed or exists(select 1 from public.provider_field_reviews r where r.record_id=c.record_id and r.revision=c.revision and r.field=c.field
        and r.status in ('approved','verified') and r.source_url=s.source_url and (r.expires_on is null or r.expires_on>=current_date)
        and not exists(select 1 from public.provider_field_reviews later where later.record_id=r.record_id and later.revision=r.revision and later.field=r.field and later.sequence>r.sequence)
        and (r.document_id is null or exists(select 1 from public.provider_documents doc where doc.id=r.document_id and doc.status='approved' and (doc.expires_on is null or doc.expires_on>=current_date)))))));
$$;
select pg_temp.read_assert(not exists(
 select 1 from public.provider_revisions v cross join (values(true),(false),(null::boolean)) reviewed(value)
 where private.reference_claims_complete(v.record_id,v.revision,reviewed.value) is distinct from pg_temp.original_claims(v.record_id,v.revision,reviewed.value)
),'all frozen revisions retain the exact original claim predicate');
select pg_temp.read_assert(not private.reference_claims_complete(gen_random_uuid(),1,true),'unknown revision denied');
-- Negative mutations are transaction-local. Original and optimized predicates
-- must agree when a latest decision invalidates one exact published field.
do $$declare selected public.provider_reference_claims; latest public.provider_field_reviews;begin
 select c.* into selected from public.provider_reference_claims c join public.provider_records r on r.id=c.record_id
 where r.kind='organization' and r.published_revision=c.revision order by c.record_id,c.field limit 1;
 if selected.id is null then return;end if;
 select * into latest from public.provider_field_reviews r where r.record_id=selected.record_id and r.revision=selected.revision and r.field=selected.field order by r.sequence desc limit 1;
 if latest.id is null then return;end if;
 insert into public.provider_field_reviews(organization_id,record_id,revision,field,status,source_url,evidence,reviewed_by)
 values(latest.organization_id,latest.record_id,latest.revision,latest.field,'rejected',latest.source_url,'LOCAL ONLY negative performance regression',latest.reviewed_by);
 perform pg_temp.read_assert(not private.reference_claims_complete(selected.record_id,selected.revision,true),'latest rejection invalidates a formerly supported field');
 perform pg_temp.read_assert(private.reference_claims_complete(selected.record_id,selected.revision,true) is not distinct from pg_temp.original_claims(selected.record_id,selected.revision,true),'latest rejection preserves old predicate semantics');
 perform pg_temp.read_assert(not private.catalog_public_visible('hospitals',(select canonical_id from public.provider_records where id=selected.record_id)),'latest rejection immediately removes the public hospital');
 perform pg_temp.read_assert(not exists(select 1 from public.provider_records r where r.organization_id=selected.organization_id and r.kind='doctor' and private.catalog_public_visible('doctors',r.canonical_id)),'invalid parent immediately hides associated doctors');
 perform pg_temp.read_assert(not exists(select 1 from public.provider_records r where r.organization_id=selected.organization_id and r.kind='package' and private.catalog_public_visible('packages',r.canonical_id)),'invalid parent immediately hides associated packages');
end;$$;
rollback;
\echo Reference query optimization equivalence and latest-review rejection passed.
