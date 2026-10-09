-- Operational metadata only. Reuse existing state machines, receipts and audit.
create table if not exists public.operational_incidents (
 id uuid primary key default gen_random_uuid(), category text not null check(category in ('application','database','ai','inquiry','notification','provider_activation')),
 severity text not null check(severity in ('low','medium','high','critical')),status text not null default 'open' check(status in ('open','acknowledged','investigating','resolved','closed')),
 owner_id uuid references auth.users(id),created_by uuid not null references auth.users(id),correlation_id uuid,
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),resolved_at timestamptz,
 resolution_note text check(resolution_note in ('service_restored','policy_reviewed','access_reviewed','external_setup_required','duplicate','investigation_completed'))
);
create table if not exists public.operational_recovery_attempts (
 id uuid primary key default gen_random_uuid(), source_event_id uuid not null unique references public.audit_events(id),kind text not null default 'receipt_reconciliation' check(kind='receipt_reconciliation'),
 status text not null check(status in ('completed','unknown','permanent_failed')),attempt_count integer not null check(attempt_count between 1 and 3),
 last_attempt_at timestamptz not null default now(),next_attempt_at timestamptz,result_code text not null check(result_code in ('commit_confirmed','commit_unconfirmed','not_retryable','attempt_limit')),
 last_actor_id uuid not null references auth.users(id)
);
alter table public.operational_incidents enable row level security;
alter table public.operational_recovery_attempts enable row level security;
revoke all on public.operational_incidents,public.operational_recovery_attempts from anon,authenticated;
grant select on public.operational_incidents,public.operational_recovery_attempts to authenticated;
grant all on public.operational_incidents,public.operational_recovery_attempts to service_role;
drop policy if exists operations_incident_admin on public.operational_incidents;
create policy operations_incident_admin on public.operational_incidents for select to authenticated using(private.portal_admin() and private.portal_active());
drop policy if exists operations_recovery_admin on public.operational_recovery_attempts;
create policy operations_recovery_admin on public.operational_recovery_attempts for select to authenticated using(private.portal_admin() and private.portal_active());
create index if not exists operations_incident_queue on public.operational_incidents(status,updated_at desc);
create index if not exists operations_audit_window on public.audit_events(occurred_at desc) where event_name like 'operations.%';
create unique index if not exists operations_command_once on public.audit_events(actor_id,(metadata->>'operationId')) where event_name like 'operations.command.%';
create unique index if not exists operations_request_once on public.audit_events((metadata->>'correlationId')) where event_name='operations.request';
create index if not exists operations_request_window on public.audit_events(occurred_at desc) where event_name='operations.request';
create index if not exists operations_pilot_evidence on public.audit_events((metadata->'result'->>'organizationId')) where event_name='operations.command.operations_accept_pilot';
create index if not exists operations_health_window on public.audit_events(occurred_at desc) where event_name='operations.command.health_check';
create index if not exists operations_tool_window on public.agent_actions(created_at desc) where status='failed';
create index if not exists operations_inquiry_current on public.support_cases(created_at desc,id) where inquiry_source<>'legacy' and consent_revoked_at is null and status not in ('resolved','closed','cancelled');
create index if not exists operations_ai_window on public.agent_runs(created_at desc);
create index if not exists operations_notification_window on public.portal_notifications(created_at desc);
create index if not exists operations_case_activity on public.support_case_events(case_id,created_at desc)
 where action in ('inquiry.submitted','inquiry.message_sent','inquiry.status_changed','inquiry.information_requested','inquiry.provider_shared','inquiry.provider_response','inquiry.document_requested','inquiry.document_uploaded','inquiry.document_replaced','inquiry.document_reviewed');
alter table public.portal_settings drop constraint if exists portal_settings_key_check;
alter table public.portal_settings add constraint portal_settings_key_check check(key in ('provider_required_fields','publication_requires_identity_evidence','operations.policy','operations.health'));
insert into public.portal_settings(key,value) values('operations.policy','{"unassignedHours":24,"supportHours":48,"providerHours":72,"patientHours":168}') on conflict(key) do nothing;

create or replace function private.operations_policy() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select value from public.portal_settings where key='operations.policy'),'{"unassignedHours":24,"supportHours":48,"providerHours":72,"patientHours":168}'::jsonb);
$$;
create or replace function private.operations_cases() returns table(id uuid,status text,revision integer,last_activity_at timestamptz,assigned boolean,attention text,threshold_hours integer,elapsed_hours numeric,overdue boolean,provider_status text) language sql stable security definer set search_path='' as $$
 with policy as materialized(select private.operations_policy() as p), current_cases as (
  select c.id,c.status,c.revision,c.assigned_to,c.provider_response_status,c.created_at,coalesce(e.created_at,c.created_at) as activity,case when c.status='waiting_provider' then 'provider' when c.status='waiting_patient' then 'patient' when c.assigned_to is null then 'unassigned' else 'support' end as kind
  from public.support_cases c left join lateral(select ev.created_at from public.support_case_events ev where ev.case_id=c.id
   and ev.action in ('inquiry.submitted','inquiry.message_sent','inquiry.status_changed','inquiry.information_requested','inquiry.provider_shared','inquiry.provider_response','inquiry.document_requested','inquiry.document_uploaded','inquiry.document_replaced','inquiry.document_reviewed') order by ev.created_at desc limit 1)e on true
  where c.inquiry_source<>'legacy' and c.consent_revoked_at is null and c.status not in ('resolved','closed','cancelled')
 ), measured as(select cc.*,greatest(0,extract(epoch from (now()-cc.activity))/3600) as age, (policy.p->>(cc.kind||'Hours'))::integer as threshold from current_cases cc cross join policy)
 select m.id,m.status,m.revision,m.activity,m.assigned_to is not null,m.kind,m.threshold,m.age,m.age>=m.threshold,m.provider_response_status from measured m;
$$;
create or replace function public.operations_inquiries(p_filter text default 'overdue') returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare rows jsonb;begin
 if not private.portal_active() or not coalesce(private.portal_role() in ('admin','super_admin','support_agent','support_manager'),false) then raise exception 'PORTAL_DENIED';end if;
 if p_filter not in ('all','overdue','unassigned','support','provider','patient') then raise exception 'PORTAL_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'status',q.status,'revision',q.revision,'lastActivityAt',q.last_activity_at,'assigned',q.assigned,'attention',q.attention,'thresholdHours',q.threshold_hours,'elapsedHours',round(q.elapsed_hours,1),'overdue',q.overdue,'providerStatus',q.provider_status)),'[]') into rows
 from(select s.* from private.operations_cases() s where private.portal_case_staff(s.id) and (p_filter='all' or (p_filter='overdue' and s.overdue) or s.attention=p_filter or (p_filter='unassigned' and not s.assigned)) order by s.overdue desc,s.last_activity_at,s.id limit 50)q;
 return jsonb_build_object('asOf',now(),'rows',rows,'limit',50);
 end;$$;

create or replace function public.operations_probe() returns jsonb language plpgsql stable security definer set search_path='' as $$
 begin if not private.portal_active() or not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
 return jsonb_build_object('database',true,'storage',exists(select 1 from storage.buckets where id='care-documents' and not public));end;$$;

-- A human acceptance attestation supplements, rather than replaces, current authority.
create or replace function private.operations_pilot_valid(p_case uuid,p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.support_cases c where c.id=p_case and c.organization_id=p_org and c.inquiry_source<>'legacy' and c.consent_revoked_at is null and c.share_with_provider
  and c.provider_responded_at is not null and private.provider_organization_approved(p_org) and private.inquiry_connected_org(c.entity_snapshot->>'kind',(c.entity_snapshot->>'id')::uuid)=p_org
  and exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=c.provider_responded_by and m.active and not exists(select 1 from public.portal_accounts a where a.user_id=m.user_id and not a.active))
  and exists(select 1 from public.support_case_provider_consents g where g.case_id=c.id and g.organization_id=p_org and g.owner_id=c.patient_id and g.revoked_at is null)
  and exists(select 1 from public.portal_notifications n join public.organization_members m on m.user_id=n.user_id and m.organization_id=p_org and m.active where n.resource_id=c.id and n.created_at>=c.consent_granted_at));
$$;
revoke all on function private.operations_pilot_valid(uuid,uuid) from public,anon,authenticated;
create or replace function private.operations_failure_category(code text) returns text language sql immutable set search_path='' as $$
 select case when code ~ 'TIMEOUT|^57014$' then 'timeout' when code ~ 'RATE_LIMIT' then 'rate_limit' when code ~ 'BUDGET|EXECUTION_LIMIT|LOOP_LIMIT' then 'execution_limit'
 when code ~ 'TOOL_(INPUT|OUTPUT|UNKNOWN|VERSION)' then 'tool_validation' when code ~ 'CONSENT|CONFIRMATION' then 'consent' when code ~ 'DENIED|AUTH_REQUIRED|AUTH_FAILURE|^42501$' then 'permission'
 when code ~ 'CONFIGURATION' then 'configuration' when code ~ 'INVALID|CONFLICT|NOT_FOUND|^22|^23' then 'validation' when code ~ 'PERSISTENCE|DATABASE|^08|PGRST00[012]' then 'persistence'
 when code ~ 'UNAVAILABLE|TOOL_FAILURE|REQUEST_FAILED' then 'integration_unavailable' else 'unknown' end;
$$;
revoke all on function private.operations_failure_category(text) from public,anon,authenticated;
create or replace function public.operations_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb;begin
 if not private.portal_active() or not private.portal_admin() then raise exception 'PORTAL_DENIED';end if;
 with current_cases as materialized(select * from private.operations_cases()), recent_runs as materialized(select id,status,created_at,started_at,finished_at,metadata from public.agent_runs where created_at>=now()-interval '24 hours'), events as materialized(select id,occurred_at,metadata from public.audit_events where event_name='operations.request' and occurred_at>=now()-interval '24 hours'), readiness as materialized(select v from jsonb_array_elements(public.portal_network_readiness(null)->'rows') v where v->>'origin'='provider_submitted')
 select jsonb_build_object('asOf',now(),'windowStart',now()-interval '24 hours','policy',private.operations_policy(),'health',(select value from public.portal_settings where key='operations.health'),'lastSuccessfulCheck',(select max(occurred_at) from public.audit_events where event_name='operations.command.health_check' and metadata->'result'->>'status'='ready'),'healthHistory',coalesce((select jsonb_agg(metadata->'result') from(select metadata from public.audit_events where event_name='operations.command.health_check' order by occurred_at desc limit 10)h),'[]'),
  'inquiries',jsonb_build_object('new24h',(select count(*) from public.support_cases where inquiry_source<>'legacy' and consent_revoked_at is null and created_at>=now()-interval '24 hours'),'active',(select count(*) from current_cases),'unassigned',(select count(*) from current_cases where not assigned),'support',(select count(*) from current_cases where attention='support'),'provider',(select count(*) from current_cases where attention='provider'),'patient',(select count(*) from current_cases where attention='patient'),'overdue',(select count(*) from current_cases where overdue)),
  'notifications',jsonb_build_object('created',(select count(*) from public.portal_notifications where created_at>=now()-interval '24 hours'),'read',(select count(*) from public.portal_notifications where created_at>=now()-interval '24 hours' and read_at is not null),'unread',(select count(*) from public.portal_notifications where created_at>=now()-interval '24 hours' and read_at is null),'channel','in_app','externalDelivery','not_configured'),
  'providers',jsonb_build_object('registered',(select count(*) from readiness),'awaitingVerification',(select count(*) from readiness where v->>'verificationStatus' in ('submitted','changes_requested','not_submitted','rejected')),'awaitingOwnership',(select count(*) from readiness where (v->>'ownershipApproved')::boolean and (v->>'ownedListings')::integer=0),'withoutTeam',(select count(*) from readiness where (v->>'ownershipApproved')::boolean and (v->>'activeMembers')::integer=0),'withPublishedListings',(select count(*) from readiness where (v->>'publishedListings')::integer>0),'connected',(select count(*) from readiness where (v->>'canReceiveInquiries')::boolean),
   'responseObserved',(select count(distinct c.organization_id) from public.support_cases c where c.provider_responded_at is not null and c.consent_revoked_at is null and c.share_with_provider and private.provider_organization_approved(c.organization_id) and exists(select 1 from public.organization_members m where m.organization_id=c.organization_id and m.user_id=c.provider_responded_by and m.active))),
  'pilotRows',coalesce((select jsonb_agg(jsonb_build_object('organizationId',v->>'id','acceptanceRecorded',exists(select 1 from public.audit_events e where e.event_name='operations.command.operations_accept_pilot' and e.metadata->'result'->>'organizationId'=v->>'id' and private.operations_pilot_valid((e.metadata->'result'->>'caseId')::uuid,(v->>'id')::uuid) and (v->>'canReceiveInquiries')::boolean),'notificationCreated',exists(select 1 from public.portal_notifications n join public.organization_members m on m.user_id=n.user_id and m.organization_id=(v->>'id')::uuid and m.active where n.resource_type='support_case' and exists(select 1 from public.support_cases c where c.id=n.resource_id and c.organization_id=m.organization_id)),'responseObserved',exists(select 1 from public.support_cases c where c.organization_id=(v->>'id')::uuid and private.operations_pilot_valid(c.id,c.organization_id)))) from readiness),'[]'),
  'ai',jsonb_build_object('runs',(select count(*) from recent_runs),'finished',(select count(*) from recent_runs where finished_at is not null),'failed',(select count(*) from recent_runs where status='failed'),'stalled',(select count(*) from recent_runs where finished_at is null and created_at<now()-interval '5 minutes'),'requestEvents',(select count(*) from events where metadata->>'kind'='ai'),'requestFailures',(select count(*) from events where metadata->>'kind'='ai' and metadata->>'outcome'='failed'),'recovered',(select count(*) from events where metadata->>'kind'='ai' and metadata->>'recovered'='true')),
  'incidents',coalesce((select jsonb_object_agg(status,n) from(select status,count(*) n from public.operational_incidents group by status)i),'{}'),
  'events',coalesce((select jsonb_agg(metadata||jsonb_build_object('id',id,'occurredAt',occurred_at)) from(select * from events order by occurred_at desc limit 30)e),'[]'),
  'failures',coalesce((select jsonb_agg(metadata||jsonb_build_object('id',id,'occurredAt',occurred_at)) from(select * from events where metadata->>'outcome'='failed' order by occurred_at desc limit 30)e),'[]'),
  'runs',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'createdAt',r.created_at,'finishedAt',r.finished_at,'durationMs',case when r.finished_at>=r.started_at then round(extract(epoch from (r.finished_at-r.started_at))*1000) end,'category',case when r.status='failed' then private.operations_failure_category(r.metadata->>'errorCode') end)) from(select * from recent_runs order by created_at desc limit 30)r),'[]'),
  'tools',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'runId',a.run_id,'tool',case when a.tool_name in ('get_inquiry_context','get_recovery_context','verify_provider_information','refresh_provider_verification','get_provider_verification_status','get_provider_verification_history','compare_provider_evidence','get_document_requirements','get_document_package','upload_document','match_document_to_requirement','remove_document','prepare_document_package','add_document_requirement','research_healthcare_information','search_treatments','search_hospitals','search_doctors','search_packages','search_countries','search_services','get_treatment','get_hospital','get_doctor','get_package','get_country','compare_treatment_options','get_hospital_details','get_doctor_details','get_treatment_details','get_package_details','search_locations','check_requirements','compare_providers','get_case_context','get_case_documents_metadata','create_case','update_case','create_agent_task','request_user_information','request_external_action') then a.tool_name else 'registered_tool' end,'status',a.status,'createdAt',a.created_at,'category',private.operations_failure_category(a.metadata->>'errorCode'))) from(select id,run_id,tool_name,status,created_at,metadata from public.agent_actions where status='failed' and created_at>=now()-interval '24 hours' order by created_at desc limit 30)a),'[]'),
  'incidentRows',coalesce((select jsonb_agg(to_jsonb(i)) from(select id,category,severity,status,revision,owner_id,created_at,resolution_note from public.operational_incidents order by (status in ('closed','resolved')),updated_at desc limit 30)i),'[]'),
  'recoveries',coalesce((select jsonb_agg(to_jsonb(j)) from(select id,kind,status,attempt_count,last_attempt_at,next_attempt_at,result_code,source_event_id from public.operational_recovery_attempts order by last_attempt_at desc limit 30)j),'[]')) into result;
 return result;end;$$;

create or replace function public.operations_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
 declare uid uuid:=auth.uid();op uuid:=nullif(p_input->>'operationId','')::uuid;request_hash text:=md5(p_action||p_input::text);prior public.audit_events;result jsonb;inc public.operational_incidents;c public.support_cases;source public.audit_events;job public.operational_recovery_attempts;receipt public.support_operation_receipts;target uuid;ns text;count_attempts integer;category text;
 begin
 if not private.portal_active() or not private.portal_admin() or op is null then raise exception 'PORTAL_DENIED';end if;
 if p_input->'confirmed' is distinct from 'true'::jsonb then raise exception 'PORTAL_CONFIRMATION_REQUIRED';end if;
 if jsonb_typeof(p_input)<>'object' or length(p_input::text)>4000 then raise exception 'PORTAL_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||op::text,0));
 select * into prior from public.audit_events where actor_id=uid and event_name like 'operations.command.%' and metadata->>'operationId'=op::text;
 if found then if prior.metadata->>'requestHash'<>request_hash then raise exception 'INQUIRY_RETRY_CONFLICT';end if;return prior.metadata->'result';end if;
 if p_action='operations_accept_pilot' then
  target:=(p_input->>'organizationId')::uuid;
  if p_input->'realParticipantConfirmed' is distinct from 'true'::jsonb or not private.operations_pilot_valid((p_input->>'caseId')::uuid,target)
   or not exists(select 1 from jsonb_array_elements(public.portal_network_readiness(target)->'rows') r where r->>'origin'='provider_submitted' and (r->>'canReceiveInquiries')::boolean) then raise exception 'PORTAL_EVIDENCE_REQUIRED';end if;
  result:=jsonb_build_object('organizationId',target,'caseId',(p_input->>'caseId')::uuid,'acceptance','admin_attested','inAppNotification','created','externalDelivery','not_configured');
 elsif p_action='operations_policy' then
  if not coalesce(jsonb_typeof(p_input->'unassignedHours')='number' and jsonb_typeof(p_input->'supportHours')='number' and jsonb_typeof(p_input->'providerHours')='number' and jsonb_typeof(p_input->'patientHours')='number',false) then raise exception 'PORTAL_INVALID';end if;
  if (p_input->>'unassignedHours')::integer not between 1 and 720 or (p_input->>'supportHours')::integer not between 1 and 720 or (p_input->>'providerHours')::integer not between 1 and 720 or (p_input->>'patientHours')::integer not between 1 and 1440 or not(p_input ?& array['unassignedHours','supportHours','providerHours','patientHours']) then raise exception 'PORTAL_INVALID';end if;
  result:=jsonb_build_object('unassignedHours',(p_input->>'unassignedHours')::integer,'supportHours',(p_input->>'supportHours')::integer,'providerHours',(p_input->>'providerHours')::integer,'patientHours',(p_input->>'patientHours')::integer);
  insert into public.portal_settings(key,value,updated_by) values('operations.policy',result,uid) on conflict(key) do update set value=excluded.value,updated_by=uid,updated_at=now();
 elsif p_action='operations_incident_create' then
  target:=coalesce(nullif(p_input->>'ownerId','')::uuid,uid);
  if target is not null and not exists(select 1 from public.staff_roles sr where sr.user_id=target and sr.active and sr.role in ('admin','super_admin') and not exists(select 1 from public.portal_accounts a where a.user_id=target and not a.active)) then raise exception 'PORTAL_DENIED';end if;
  insert into public.operational_incidents(category,severity,owner_id,created_by,correlation_id) values(p_input->>'category',p_input->>'severity',target,uid,nullif(p_input->>'correlationId','')::uuid) returning * into inc;
  result:=jsonb_build_object('id',inc.id,'status',inc.status,'ownerId',inc.owner_id,'severity',inc.severity,'category',inc.category,'correlationId',inc.correlation_id);perform private.portal_notify_staff('Operational incident opened','Review Operations for the actual operational impact and owner.','operational_incident',inc.id);
 elsif p_action='operations_incident_update' then
  select * into inc from public.operational_incidents where id=(p_input->>'incidentId')::uuid for update;
  if not found or inc.revision<>coalesce((p_input->>'expectedRevision')::integer,-1) then raise exception 'PORTAL_CONFLICT';end if;
  ns:=p_input->>'status';
  if not coalesce((inc.status='open' and ns='acknowledged') or (inc.status='acknowledged' and ns='investigating') or (inc.status='investigating' and ns='resolved') or (inc.status='resolved' and ns='closed'),false) then raise exception 'PORTAL_TRANSITION_INVALID';end if;
  target:=coalesce(nullif(p_input->>'ownerId','')::uuid,inc.owner_id);
  if target is null or not exists(select 1 from public.staff_roles sr where sr.user_id=target and sr.active and sr.role in ('admin','super_admin') and not exists(select 1 from public.portal_accounts a where a.user_id=target and not a.active)) then raise exception 'PORTAL_DENIED';end if;
  if ns in ('resolved','closed') and (p_input->>'resolution' is null or p_input->>'resolution' not in ('service_restored','policy_reviewed','access_reviewed','external_setup_required','duplicate','investigation_completed')) then raise exception 'PORTAL_REVIEW_REASON_REQUIRED';end if;
  update public.operational_incidents set status=ns,owner_id=target,revision=revision+1,updated_at=now(),resolved_at=case when ns='resolved' then now() else resolved_at end,resolution_note=case when ns in ('resolved','closed') then p_input->>'resolution' else resolution_note end where id=inc.id;
  result:=jsonb_build_object('id',inc.id,'previousStatus',inc.status,'status',ns,'previousOwnerId',inc.owner_id,'ownerId',target,'resolution',p_input->>'resolution','revision',inc.revision+1);
 elsif p_action='operations_escalate' then
  select * into c from public.support_cases where id=(p_input->>'caseId')::uuid for update;
  if not found or c.consent_revoked_at is not null or not private.portal_case_staff(c.id) then raise exception 'PORTAL_DENIED';end if;
  if not exists(select 1 from private.operations_cases() s where s.id=c.id and s.overdue) then raise exception 'PORTAL_TRANSITION_INVALID';end if;
  result:=public.inquiry_command('update',jsonb_build_object('operationId',op,'caseId',c.id,'expectedRevision',(p_input->>'expectedRevision')::integer,'status','escalated','reason','Administrative workflow threshold exceeded; review coordination. No medical severity is inferred.'));
 elsif p_action='operations_reconcile' then
  select * into source from public.audit_events where id=(p_input->>'eventId')::uuid and event_name='operations.request' and metadata->>'kind'='inquiry' and metadata->>'outcome'='failed';
  if not found or source.actor_id is null or nullif(source.metadata->>'operationId','') is null then raise exception 'PORTAL_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended(source.id::text,0));
  select * into job from public.operational_recovery_attempts where source_event_id=source.id for update;
  if job.status in ('completed','permanent_failed') then raise exception 'PORTAL_TRANSITION_INVALID';end if;
  if job.attempt_count>=3 or job.next_attempt_at>now() then raise exception 'OPERATIONS_RETRY_WAIT';end if;
  category:=coalesce(source.metadata->>'category','unknown');count_attempts:=coalesce(job.attempt_count,0)+1;
  select * into receipt from public.support_operation_receipts where actor_id=source.actor_id and operation_id=(source.metadata->>'operationId')::uuid and action=source.metadata->>'action';
  ns:=case when receipt.operation_id is not null then 'completed' when category not in ('timeout','rate_limit','database_unavailable','integration_unavailable','persistence') then 'permanent_failed' when count_attempts=3 then 'permanent_failed' else 'unknown' end;
  result:=jsonb_build_object('status',ns,'resultCode',case when receipt.operation_id is not null then 'commit_confirmed' when category not in ('timeout','rate_limit','database_unavailable','integration_unavailable','persistence') then 'not_retryable' when count_attempts=3 then 'attempt_limit' else 'commit_unconfirmed' end,'attemptCount',count_attempts);
  insert into public.operational_recovery_attempts(source_event_id,status,attempt_count,next_attempt_at,result_code,last_actor_id) values(source.id,ns,count_attempts,case when ns='unknown' then now()+make_interval(secs=>least(120,30*power(2,count_attempts-1)::integer)) end,result->>'resultCode',uid)
   on conflict(source_event_id) do update set status=ns,attempt_count=count_attempts,last_attempt_at=now(),next_attempt_at=excluded.next_attempt_at,result_code=excluded.result_code,last_actor_id=uid;
 else raise exception 'PORTAL_INVALID';end if;
 insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,entity_id,metadata) values(uid,'staff',private.portal_role(),'operations.command.'||p_action,'operations',coalesce(inc.id,c.id,source.id),jsonb_build_object('operationId',op,'requestHash',request_hash,'result',result));
 return result;end;$$;

create or replace function private.operations_metadata_valid(m jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(m)='object' and m ?& array['correlationId','kind','action','outcome','durationMs','retryCount','modelFailures','recovered']
 and not exists(select 1 from jsonb_object_keys(m) k where k not in ('correlationId','operationId','executionId','kind','action','outcome','category','durationMs','retryCount','modelFailures','recovered'))
 and m->>'kind' in ('ai','inquiry') and m->>'outcome' in ('completed','partially_completed','failed')
 and m->>'action' in ('create','message','update','request_information','cancel','revoke_support','share_provider','revoke_provider','provider_response','request_document','share_document','review_document','revoke_document','withdraw_document','save_task','link_recovery','read_messages','execute')
 and jsonb_typeof(m->'recovered')='boolean' and jsonb_typeof(m->'durationMs')='number' and (m->>'durationMs') ~ '^[0-9]{1,6}$' and (m->>'durationMs')::integer between 0 and 300000
 and jsonb_typeof(m->'retryCount')='number' and (m->>'retryCount') ~ '^[0-9]{1,2}$' and (m->>'retryCount')::integer between 0 and 32
 and jsonb_typeof(m->'modelFailures')='array' and jsonb_array_length(m->'modelFailures')<=32
 and not exists(select 1 from jsonb_array_elements(m->'modelFailures') v where jsonb_typeof(v)<>'string' or trim(both '"' from v::text) not in ('timeout','rate_limit','execution_limit','tool_validation','permission','consent','validation','persistence','database_unavailable','integration_unavailable','configuration','unknown'))
 and (not(m ? 'category') or m->>'category' in ('timeout','rate_limit','execution_limit','tool_validation','permission','consent','validation','persistence','database_unavailable','integration_unavailable','configuration','unknown'))
 and (m->>'outcome'<>'failed' or m ? 'category');
$$;
revoke all on function private.operations_metadata_valid(jsonb) from public,anon,authenticated;

-- Only the verified server records measured probes/strict telemetry, not browser RPCs.
create or replace function public.operations_record_health(p_actor uuid,p_operation uuid,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare prior public.audit_events;begin
 if not exists(select 1 from public.staff_roles s where s.user_id=p_actor and s.active and s.role in ('admin','super_admin') and not exists(select 1 from public.portal_accounts a where a.user_id=p_actor and not a.active)) then raise exception 'PORTAL_DENIED';end if;
 if p_operation is null or jsonb_typeof(p_result)<>'object' or not(p_result ?& array['checkedAt','status','database','storage','ai','durationMs','attempts','externalDelivery','externalMonitoring'])
 or exists(select 1 from jsonb_object_keys(p_result) k where k not in ('checkedAt','status','database','storage','ai','durationMs','attempts','externalDelivery','externalMonitoring','category'))
 or not coalesce(p_result->>'status' in ('ready','not_ready') and p_result->>'database' in ('available','unavailable','timeout') and p_result->>'storage' in ('private_bucket_present','not_configured','not_measured') and p_result->>'ai' in ('configured_not_probed','not_configured') and p_result->>'externalDelivery'='not_configured' and p_result->>'externalMonitoring'='not_configured',false)
 or jsonb_typeof(p_result->'attempts') is distinct from 'number' or jsonb_typeof(p_result->'durationMs') is distinct from 'number' or (p_result->>'attempts') !~ '^[12]$' or (p_result->>'durationMs') !~ '^[0-9]{1,5}$'
 or (p_result->>'attempts')::integer not between 1 and 2 or (p_result->>'durationMs')::integer not between 0 and 30000
 or (p_result->>'status'='ready')<>(p_result->>'database'='available')
 or (p_result ? 'category' and p_result->>'category' not in ('timeout','rate_limit','execution_limit','tool_validation','permission','consent','validation','persistence','database_unavailable','integration_unavailable','configuration','unknown'))
 then raise exception 'PORTAL_INVALID';end if;
 if abs(extract(epoch from(now()-(p_result->>'checkedAt')::timestamptz)))>300 then raise exception 'PORTAL_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||p_operation::text,0));
 select * into prior from public.audit_events where actor_id=p_actor and event_name like 'operations.command.%' and metadata->>'operationId'=p_operation::text;
 if found then if prior.event_name<>'operations.command.health_check' then raise exception 'INQUIRY_RETRY_CONFLICT';end if;return prior.metadata->'result';end if;
 insert into public.portal_settings(key,value,updated_by) values('operations.health',p_result,p_actor) on conflict(key) do update set value=excluded.value,updated_by=p_actor,updated_at=now();
 insert into public.audit_events(actor_id,actor_type,actor_role,event_name,entity_type,metadata) values(p_actor,'staff','admin','operations.command.health_check','operations',jsonb_build_object('operationId',p_operation,'requestHash','health_check','result',p_result));return p_result;
 end;$$;
create or replace function public.operations_record_request(p_actor uuid,p_metadata jsonb) returns void language plpgsql security definer set search_path='' as $$
 begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'PORTAL_DENIED';end if;
 if length(p_metadata::text)>3000 or private.operations_metadata_valid(p_metadata) is distinct from true then raise exception 'PORTAL_INVALID';end if;
 if jsonb_typeof(p_metadata->'correlationId') is distinct from 'string' or (p_metadata ? 'operationId' and jsonb_typeof(p_metadata->'operationId') is distinct from 'string') or (p_metadata ? 'executionId' and jsonb_typeof(p_metadata->'executionId') is distinct from 'string') then raise exception 'PORTAL_INVALID';end if;
 perform (p_metadata->>'correlationId')::uuid;
 if p_metadata ? 'operationId' then perform (p_metadata->>'operationId')::uuid;end if;
 if p_metadata ? 'executionId' then perform (p_metadata->>'executionId')::uuid;end if;
 insert into public.audit_events(actor_id,actor_type,event_name,entity_type,metadata) values(p_actor,'system','operations.request','operations',p_metadata) on conflict do nothing;
 end;$$;
revoke all on function private.operations_policy(),private.operations_cases() from public,anon,authenticated;
revoke all on function public.operations_overview(),public.operations_inquiries(text),public.operations_probe(),public.operations_command(text,jsonb) from public,anon;
grant execute on function public.operations_overview(),public.operations_inquiries(text),public.operations_probe(),public.operations_command(text,jsonb) to authenticated;
revoke all on function public.operations_record_health(uuid,uuid,jsonb),public.operations_record_request(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.operations_record_health(uuid,uuid,jsonb),public.operations_record_request(uuid,jsonb) to service_role;

do $$begin
 if to_regprocedure('private.portal_command_before_operations(text,jsonb)') is null then
  alter function public.portal_command(text,jsonb) set schema private;
  alter function private.portal_command(text,jsonb) rename to portal_command_before_operations;
 end if;
end;$$;
create or replace function public.portal_command(p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action='save_setting' and lower(coalesce(p_input->>'key','')) like 'operations.%' then raise exception 'PORTAL_DENIED';end if;
 return private.portal_command_before_operations(p_action,p_input);
end;$$;
revoke all on function private.portal_command_before_operations(text,jsonb) from public,anon,authenticated;
revoke all on function public.portal_command(text,jsonb) from public,anon;
grant execute on function public.portal_command(text,jsonb) to authenticated;
