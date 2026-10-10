import { z } from 'zod';
export const inquiryPreparationSchema=z.object({state:z.literal('review_required'),name:z.string().max(300),
  href:z.string().regex(/^\/request-assistance\?kind=(hospital|doctor|package)&entityId=[a-f0-9-]{36}&source=ai_finding&conversation=[a-f0-9-]{36}$/)}).strict();
export const inquiryAgentSchema=z.object({
  selectedId:z.uuid().nullable(),
  requests:z.array(z.object({id:z.uuid(),title:z.string().max(180),status:z.string().max(40),providerStatus:z.string().max(40),nextStep:z.string().max(600).optional(),updatedAt:z.string(),supportConsentActive:z.boolean(),providerAuthorized:z.boolean(),linkedListing:z.object({kind:z.string(),name:z.string().max(300),href:z.string().regex(/^\/(hospitals|doctors|packages)\/[a-z0-9-]+$/)}),outstanding:z.array(z.object({title:z.string().max(180),purpose:z.string().max(800),status:z.string().max(40)})).max(30)}).strict()).max(20),
}).strict();
export type InquiryAgentContext=z.infer<typeof inquiryAgentSchema>;
export function wantsInquiryPreparation(content:string){
  return /\b(?:make|create|submit|start|send|prepare|raise)\b[^.!?]{0,80}\b(?:inquiry|enquiry|care request)\b|\brequest assistance\b/i.test(content);
}
export function inquiryIntent(content:string,previous?:InquiryAgentContext){
  const named=/\b(?:inquir(?:y|ies)|care requests?|support requests?|my requests)\b/i.test(content);
  const followUp=!!previous?.selectedId&&/\b(?:its?|this request|that request)\b/i.test(content)&&/\b(?:status|update|document|need|outstanding|support|provider|cancel|share|message)\b/i.test(content);
  if(!named&&!followUp)return null;
  const ids=content.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/ig)??[];
  if(ids.length>1)return {ambiguous:true as const};
  return {caseId:ids[0]??(followUp?previous?.selectedId??undefined:undefined),ambiguous:false as const};
}
