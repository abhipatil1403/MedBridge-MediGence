import { z } from 'zod';
const uuid=z.uuid();
const text=(max:number,min=1)=>z.string().trim().min(min).max(max);
export const inquiryStatuses=['open','in_progress','waiting_patient','waiting_provider','escalated','resolved','closed','cancelled'] as const;
export const inquirySources=['hospital_detail','doctor_detail','package_detail','ai_finding','saved_item','help','recover'] as const;
export const entityKind=z.enum(['hospital','doctor','package']);
const common={operationId:uuid,caseId:uuid};
const command=<T extends z.ZodRawShape>(action:string,shape:T)=>z.object({action:z.literal(action),input:z.object({...common,...shape}).strict()}).strict();
export const inquiryCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),input:z.object({operationId:uuid,entityKind,entityId:uuid,expectedPublishedRevision:z.number().int().positive().nullable(),source:z.enum(inquirySources),title:text(180,3),objective:text(4000,5),consent:z.literal(true),reviewed:z.literal(true),conversationId:uuid.optional()}).strict()}).strict(),
  command('message',{body:text(8000),visibility:z.enum(['patient','provider','shared','internal'])}),
  command('update',{expectedRevision:z.number().int().positive(),status:z.enum(inquiryStatuses),assignedTo:uuid.nullable().optional(),priority:z.enum(['low','normal','high','urgent']).optional(),dueAt:z.iso.datetime({offset:true}).nullable().optional(),resolution:text(4000,5).optional(),reason:text(4000,5).optional()}),
  command('request_information',{body:text(8000,5)}),
  command('cancel',{}),command('revoke_support',{}),command('revoke_provider',{}),command('read_messages',{}),
  command('share_provider',{organizationId:uuid,purpose:text(400,5),confirmed:z.literal(true)}),
  command('provider_response',{status:z.enum(['information_requested','responded','accepted_for_coordination','unable_to_coordinate','further_review']),body:text(8000,5),confirmed:z.literal(true)}),
  command('request_document',{title:text(180,3),purpose:text(800,5),visibility:z.enum(['patient','shared'])}),
  command('share_document',{documentId:uuid,recipient:z.enum(['support','provider']),organizationId:uuid.optional(),purpose:text(400,5),confirmed:z.literal(true)}),
  command('revoke_document',{documentId:uuid,recipient:z.enum(['support','provider'])}),command('withdraw_document',{documentId:uuid}),
  command('review_document',{documentId:uuid,status:z.enum(['under_review','accepted_for_coordination','replacement_requested']),note:text(800).optional()}),
  command('link_recovery',{journeyId:uuid,eventId:uuid,title:text(160,3),confirmed:z.literal(true)}),
  command('save_task',{taskId:uuid.optional(),title:text(180,3),status:z.enum(['open','in_progress','completed','cancelled']),assignedTo:uuid.nullable().optional(),dueAt:z.iso.datetime({offset:true}).nullable().optional(),priority:z.enum(['low','normal','high','urgent']).optional(),expectedRevision:z.number().int().positive().optional()}),
]);
export type InquiryCommand=z.infer<typeof inquiryCommandSchema>;
export type InquiryTarget={kind:'hospital'|'doctor'|'package';id:string;name:string;href:string;publishedRevision:number|null;organizationId:string|null;organizationName:string|null};
export type InquiryRow={id:string;title:string;description:string;status:typeof inquiryStatuses[number];priority:string;revision:number;created_at:string;updated_at:string;due_at:string|null;assigned_to:string|null;inquiry_source:string;entity_snapshot:InquiryTarget;share_with_provider:boolean;consent_granted_at:string;consent_revoked_at:string|null;resolution_summary:string|null;provider_response_status:string;provider_responded_at:string|null;recovery_journey_id:string|null};
export type InquiryEvent={id:string;action:string;summary:string;visibility:string;created_at:string};
export type DocumentGrant={id:string;recipient:'support'|'provider';purpose:string;granted_at:string;revoked_at:string|null};
export type InquiryDocument={id:string;filename:string;mime_type:string;size_bytes:number;status:string;uploaded_at:string|null;request_id:string|null;review_note:string|null;reviewed_at:string|null;grants:DocumentGrant[]};
export type ProviderCoordination={readiness?:string|null;available:boolean;informationRequestedAt:string|null;informationAnsweredAt:string|null;latestResponse:{id:string;body:string;createdAt:string;responderName:string;organizationName:string}|null};
export type InquiryContext={case:InquiryRow;role:'patient'|'support'|'provider';patient:{displayName:string|null};organization:{id:string;name:string}|null;providerCoordination?:ProviderCoordination;messages:{id:string;body:string;visibility:string;created_at:string;sender:string}[];events:InquiryEvent[];documents:InquiryDocument[];documentRequests:{id:string;title:string;purpose:string;requesting_party:string;status:string;created_at:string}[];consents:{id:string;purpose:string;granted_at:string;revoked_at:string|null}[];staffDirectory:{id:string;name:string;role:string}[];tasks:{id:string;title:string;status:string;revision:number;assigned_to:string|null;due_at:string|null;priority:string}[];journeys:{id:string;title:string}[];unread:number};

const responseStates=new Set(['information_requested','responded','accepted_for_coordination','further_review','unable_to_coordinate']);
/** The authenticated RPC links a same-case, provider-principal message. A status alone is not evidence. */
export function effectiveProviderStatus(context:InquiryContext):string {
  const status=context.case.provider_response_status,response=context.providerCoordination?.latestResponse;
  return responseStates.has(status)&&(!response||!z.uuid().safeParse(response.id).success||!response.body?.trim())?'unconfirmed_response':status;
}
export function projectInquiryContext(context:InquiryContext):InquiryContext {
  return {...context,case:{...context.case,provider_response_status:effectiveProviderStatus(context)}};
}
/** Queue rows have no attributable message projection; verify the response in the scoped detail. */
export function providerQueueStatusLabel(value:string):string {
  return responseStates.has(value)?'Open the request to verify its recorded provider response.':providerStatusLabel(value);
}

export function inquiryStatusLabel(value:string):string {
  const labels:Record<string,string>={open:'Submitted to Support',in_progress:'Coordination in progress',waiting_patient:'Awaiting patient information',waiting_provider:'Awaiting provider response',escalated:'Escalated to Support',resolved:'Resolved',closed:'Closed',cancelled:'Cancelled'};
  return labels[value]??'Status unavailable';
}
export function providerStatusLabel(value:string):string {
  const labels:Record<string,string>={unconfirmed_response:'Provider response not confirmed',not_requested:'Provider sharing not authorized',pending:'Awaiting provider response',information_requested:'Provider requested information',responded:'Provider responded',accepted_for_coordination:'Provider confirmed it can continue coordination',further_review:'Further coordination required',unable_to_coordinate:'Provider unable to proceed'};
  return labels[value]??'Coordination status unavailable';
}
export function inquiryNextStep(context:InquiryContext):string {
  if(context.case.consent_revoked_at)return 'Support consent is withdrawn. Your request remains available to you.';
  if(context.case.status==='cancelled')return 'You cancelled this request.';
  if(['resolved','closed'].includes(context.case.status))return context.case.resolution_summary??'This request is complete.';
  const providerStatus=effectiveProviderStatus(context);
  if(providerStatus==='unconfirmed_response'&&context.organization&&context.providerCoordination?.available!==false)return 'No attributable provider response is available. Ask Support to review the recorded status; no provider acceptance is confirmed.';
  if(context.role==='provider'){
    if(providerStatus==='information_requested')return 'Await the patient’s shared reply or an explicitly shared document. Private uploads remain unavailable until separately authorized.';
    if(providerStatus==='further_review')return 'Review this request with your team, then record an updated operational response.';
    return 'Review the authorized request and record your organization’s response. Coordination does not confirm a booking or treatment.';
  }
  if(context.documentRequests.some(d=>['requested','replacement_requested'].includes(d.status)))return 'Review the document request and its purpose. Uploading is private; sharing is a separate choice.';
  if(providerStatus==='information_requested'&&context.case.share_with_provider)return 'Review the provider’s information request. Choose Patient, Support and authorized provider when replying so the provider can read your answer.';
  if(context.case.status==='waiting_patient')return 'Support needs information. Review the messages and reply.';
  if(!context.organization||context.providerCoordination?.available===false)return 'Support will coordinate your question. Direct provider coordination is not available for this listing; no provider response is confirmed.';
  if(context.case.share_with_provider&&providerStatus==='unable_to_coordinate')return 'The provider cannot proceed with this request. Ask Support about the next coordination step.';
  if(context.case.share_with_provider&&providerStatus==='further_review')return 'The provider requires further coordination. Review its response and contact Support about the next step.';
  if(context.case.share_with_provider&&providerStatus==='accepted_for_coordination')return 'The provider confirmed it can continue coordination. Review its response; an appointment, price or treatment is not confirmed.';
  if(context.case.share_with_provider&&providerStatus==='responded')return 'A provider response is available below. Review it and reply to the authorized recipients if needed.';
  if(context.case.share_with_provider)return 'Your authorized provider team can review the shared request. Check here for its response.';
  return 'Support will review your request. Provider access requires your separate permission.';
}
