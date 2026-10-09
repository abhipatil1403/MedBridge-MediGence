-- Disposable QA: publish an independently sourced canonical listing through
-- the established reference submission, review and explicit publication path.
create function pg_temp.qa_network_reference(p_admin uuid) returns jsonb language plpgsql as $$
declare org uuid;source uuid;profile uuid;location uuid;doctor uuid;package uuid;submission uuid;r record;previous text:=current_setting('request.jwt.claim.sub',true);begin
  if current_database() not like 'production_catalog_%' then raise exception 'Disposable database required';end if;
  perform set_config('request.jwt.claim.sub',p_admin::text,true);
  org:=(public.portal_reference_command('create_reference_organization',jsonb_build_object('name','LOCAL NETWORK REFERENCE '||gen_random_uuid(),'providerType','hospital'))->>'id')::uuid;
  source:=(public.portal_reference_command('create_reference_source',jsonb_build_object('name','LOCAL source fixture','url','https://qa.invalid/network-reference','sourceType','provider_website','collectedAt',now(),'reviewAfter',current_date+90))->>'id')::uuid;
  profile:=(public.portal_command('save_record',jsonb_build_object('organizationId',org,'kind','organization','name','LOCAL NETWORK REFERENCE '||org,'data',jsonb_build_object('cityId',(select id from public.cities where slug='mumbai'),'description','Disposable local independently sourced reference fixture.','website','https://qa.invalid/network-reference')))->>'id')::uuid;
  location:=(public.portal_command('save_record',jsonb_build_object('organizationId',org,'kind','location','name','Local branch','data',jsonb_build_object('cityId',(select id from public.cities where slug='mumbai'),'address','Local fixture address')))->>'id')::uuid;
  perform public.portal_command('save_record',jsonb_build_object('organizationId',org,'kind','treatment','name','Local procedure','data',jsonb_build_object('treatmentId',(select id from public.treatments where slug='knee-replacement'),'locationId',location,'description','Local procedure scope.')));
  doctor:=(public.portal_command('save_record',jsonb_build_object('organizationId',org,'kind','doctor','name','LOCAL NETWORK Doctor '||org,'data',jsonb_build_object('specialtyId',(select id from public.specialties where slug='orthopedics'),'locationId',location,'biography','Local fixture, not a real clinician.')))->>'id')::uuid;
  package:=(public.portal_command('save_record',jsonb_build_object('organizationId',org,'kind','package','name','LOCAL NETWORK Package '||org,'data',jsonb_build_object('treatmentId',(select id from public.treatments where slug='knee-replacement'),'locationId',location,'description','Local fixture, not a real offer.','priceType','contact_provider')))->>'id')::uuid;
  for r in select pr.id,pr.revision,f.key from public.provider_records pr cross join lateral jsonb_each(pr.data||jsonb_build_object('name',pr.name)) f where pr.organization_id=org loop
    perform public.portal_reference_command('attach_reference_claim',jsonb_build_object('recordId',r.id,'expectedRevision',r.revision,'field',r.key,'sourceId',source,'evidence','LOCAL source fixture only.'));
  end loop;
  submission:=(public.portal_command('submit',jsonb_build_object('organizationId',org))->>'id')::uuid;
  for r in select * from public.provider_submission_items where submission_id=submission loop
    perform public.portal_review_command('review_section',jsonb_build_object('submissionId',submission,'recordId',r.record_id,'expectedRevision',r.revision,'status','approved'));
  end loop;
  for r in select c.record_id,c.field from public.provider_reference_claims c where c.organization_id=org loop
    perform public.portal_command('review_field',jsonb_build_object('submissionId',submission,'recordId',r.record_id,'field',r.field,'status',case when r.record_id=profile and r.field='name' then 'verified' else 'approved' end,'sourceUrl','https://qa.invalid/network-reference','evidence','LOCAL reviewed reference fixture only.'));
  end loop;
  perform public.portal_command('review_submission',jsonb_build_object('submissionId',submission,'status','approved'));
  perform public.portal_publication_command('publish_submission',jsonb_build_object('submissionId',submission));
  perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
  return jsonb_build_object('organizationId',org,'hospitalId',(select hospital_id from public.organizations where id=org),'doctorId',(select canonical_id from public.provider_records where id=doctor),'packageId',(select canonical_id from public.provider_records where id=package));
end;$$;
