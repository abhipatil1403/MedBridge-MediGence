import { z } from 'zod';

export const failureCategories = ['timeout','rate_limit','execution_limit','tool_validation','permission','consent','validation','persistence','database_unavailable','integration_unavailable','configuration','unknown'] as const;
export type FailureCategory = typeof failureCategories[number];
export function failureCategory(code: unknown): FailureCategory {
  const value = typeof code === 'string' ? code : '';
  if (/TIMEOUT|^57014$|AbortError|TimeoutError/.test(value)) return 'timeout';
  if (/RATE_LIMIT|^429$/.test(value)) return 'rate_limit';
  if (/BUDGET|EXECUTION_LIMIT|LOOP_LIMIT/.test(value)) return 'execution_limit';
  if (/TOOL_(INPUT|OUTPUT|UNKNOWN|VERSION)/.test(value)) return 'tool_validation';
  if (/CONSENT|CONFIRMATION/.test(value)) return 'consent';
  if (/DENIED|AUTH_REQUIRED|AUTH_FAILURE|^42501$/.test(value)) return 'permission';
  if (/CONFIGURATION/.test(value)) return 'configuration';
  if (/INVALID|CONFLICT|NOT_FOUND|^22|^23/.test(value)) return 'validation';
  if (/PERSISTENCE/.test(value)) return 'persistence';
  if (/DATABASE|^08|PGRST000|PGRST001|PGRST002/.test(value)) return 'database_unavailable';
  if (/UNAVAILABLE|TOOL_FAILURE|REQUEST_FAILED/.test(value)) return 'integration_unavailable';
  return 'unknown';
}
export const transientFailures = new Set<FailureCategory>(['timeout','rate_limit','database_unavailable','integration_unavailable','persistence']);
export const recoveryLimit = 3;
export function retryDelayMs(attempt: number) { return Math.min(120000, 30000 * 2 ** Math.max(0, attempt - 1)); }
export function retryAllowed(category: FailureCategory, attempts: number, nextAt: number, now: number) {
  return transientFailures.has(category) && attempts < recoveryLimit && now >= nextAt;
}

export const policySchema = z.object({unassignedHours:z.number().int().min(1).max(720),supportHours:z.number().int().min(1).max(720),providerHours:z.number().int().min(1).max(720),patientHours:z.number().int().min(1).max(1440)}).strict();
export const defaultPolicy = {unassignedHours:24,supportHours:48,providerHours:72,patientHours:168};
export function inquiryAttention(row:{status:string;assigned_to:string|null;last_operational_activity_at:string}, now:number, policy=defaultPolicy) {
  if (['resolved','closed','cancelled'].includes(row.status)) return null;
  const activity=Date.parse(row.last_operational_activity_at);
  if(!Number.isFinite(activity)) return null;
  const kind=row.status==='waiting_provider'?'provider':row.status==='waiting_patient'?'patient':!row.assigned_to?'unassigned':'support';
  const threshold=policy[`${kind}Hours` as keyof typeof policy];
  const elapsedHours=Math.max(0,(now-activity)/3600000);
  return {kind,thresholdHours:threshold,elapsedHours,overdue:elapsedHours>=threshold};
}

export const requestEventSchema=z.object({correlationId:z.uuid(),operationId:z.uuid().optional(),executionId:z.uuid().optional(),kind:z.enum(['ai','inquiry']),action:z.enum(['read_messages','withdraw_document','create','message','update','request_information','cancel','revoke_support','share_provider','revoke_provider','provider_response','request_document','share_document','review_document','revoke_document','save_task','link_recovery','execute']),outcome:z.enum(['completed','partially_completed','failed']),category:z.enum(failureCategories).optional(),durationMs:z.number().int().min(0).max(300000),retryCount:z.number().int().min(0).max(32),modelFailures:z.array(z.enum(failureCategories)).max(32),recovered:z.boolean()}).strict().refine(event=>event.outcome!=='failed'||Boolean(event.category),{message:'Failed requests require a sanitized category.'});
export type RequestEvent=z.infer<typeof requestEventSchema>;
export const healthResultSchema=z.object({checkedAt:z.iso.datetime(),status:z.enum(['ready','not_ready']),database:z.enum(['available','unavailable','timeout']),storage:z.enum(['private_bucket_present','not_configured','not_measured']),ai:z.enum(['configured_not_probed','not_configured']),externalDelivery:z.literal('not_configured'),externalMonitoring:z.literal('not_configured'),durationMs:z.number().int().min(0).max(30000),attempts:z.number().int().min(1).max(2),category:z.enum(failureCategories).optional()}).strict();
export type HealthResult=z.infer<typeof healthResultSchema>;
const confirmation={operationId:z.uuid(),confirmed:z.literal(true)};
export const incidentCategories=['application','database','ai','inquiry','notification','provider_activation'] as const;
export const resolutionCodes=['service_restored','policy_reviewed','access_reviewed','external_setup_required','duplicate','investigation_completed'] as const;
export const operationsActions=['operations_accept_pilot','operations_health_check','operations_policy','operations_incident_create','operations_incident_update','operations_escalate','operations_reconcile'] as const;
export const operationsCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('operations_accept_pilot'),input:z.object({...confirmation,organizationId:z.uuid(),caseId:z.uuid(),realParticipantConfirmed:z.literal(true)}).strict()}),
  z.object({action:z.literal('operations_health_check'),input:z.object(confirmation).strict()}),
  z.object({action:z.literal('operations_policy'),input:z.object({...confirmation,...policySchema.shape}).strict()}),
  z.object({action:z.literal('operations_incident_create'),input:z.object({...confirmation,category:z.enum(incidentCategories),severity:z.enum(['low','medium','high','critical']),ownerId:z.preprocess(v=>v===''?undefined:v,z.uuid().optional()),correlationId:z.preprocess(v=>v===''?undefined:v,z.uuid().optional())}).strict()}),
  z.object({action:z.literal('operations_incident_update'),input:z.object({...confirmation,incidentId:z.uuid(),expectedRevision:z.number().int().min(1),status:z.enum(['acknowledged','investigating','resolved','closed']),ownerId:z.preprocess(v=>v===''?undefined:v,z.uuid().optional()),resolution:z.enum(resolutionCodes).optional()}).strict()}),
  z.object({action:z.literal('operations_escalate'),input:z.object({...confirmation,caseId:z.uuid(),expectedRevision:z.number().int().min(1)}).strict()}),
  z.object({action:z.literal('operations_reconcile'),input:z.object({...confirmation,eventId:z.uuid()}).strict()}),
]);
export type OperationsInquiry={id:string;status:string;revision:number;lastActivityAt:string;assigned:boolean;attention:string;thresholdHours:number;elapsedHours:number;overdue:boolean;providerStatus:string};
export type OperationsOverview={asOf:string;windowStart:string;policy:typeof defaultPolicy;health:HealthResult|null;lastSuccessfulCheck:string|null;healthHistory:HealthResult[];inquiries:Record<string,number>;notifications:{created:number;read:number;unread:number;channel:'in_app';externalDelivery:'not_configured'};providers:Record<string,number>;pilotRows:Array<{organizationId:string;acceptanceRecorded:boolean;notificationCreated:boolean;responseObserved:boolean}>;ai:{runs:number;finished:number;failed:number;stalled:number;requestEvents:number;requestFailures:number;recovered:number};incidents:Record<string,number>;events:Array<RequestEvent&{id:string;occurredAt:string}>;failures:Array<RequestEvent&{id:string;occurredAt:string}>;runs:Array<{id:string;status:string;createdAt:string;finishedAt:string|null;durationMs:number|null;category:FailureCategory|null}>;tools:Array<{id:string;runId:string;tool:string;status:string;createdAt:string;category:FailureCategory}>;incidentRows:Array<{id:string;category:string;severity:string;status:string;revision:number;owner_id:string|null;created_at:string;resolution_note:string|null}>;recoveries:Array<{id:string;kind:string;status:string;attempt_count:number;last_attempt_at:string;next_attempt_at:string|null;result_code:string;source_event_id:string|null}>};
