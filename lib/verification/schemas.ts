import { z } from 'zod';
import { researchSourceSchema } from '@/lib/research/schemas';
import { sourceTypes } from '@/lib/research/schemas';
import { approvedSources } from '@/lib/research/collection';

export const verificationFields = ['name','address','city','country','website','phone','email','services','treatments','facilities','emergency','teleconsultation','international_patients','accreditation','profile','specialty','affiliations','credentials','registration','consultation_mode'] as const;
export const verificationFieldSchema = z.enum(verificationFields);
export function normalizedFact(value:string,field?:string){const text=value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.]$/,'');return field==='phone'?text.replace(/[ ()-]/g,''):text;}
export const verificationStatusSchema = z.enum(['verified','unverified','conflicting','stale','not_found','not_applicable','internal_only']);
export const freshnessSchema = z.enum(['current','aging','stale','unknown']);
export const providerSchema = z.object({ id:z.guid(),type:z.enum(['hospital','clinic','doctor','healthcare_provider','package']),name:z.string().min(1).max(160),location:z.string().max(100),slug:z.string().max(200).optional(),sourceKind:z.enum(['medbridge_catalog','external_source']),catalogSourceKind:z.enum(['synthetic','external','first_party']).optional(),hospitalId:z.guid().optional() }).strict();
export type VerificationProvider = z.infer<typeof providerSchema>;
export const fieldEvidenceSchema = z.object({sourceId:z.guid(),entityId:z.guid(),field:verificationFieldSchema,value:z.string().min(1).max(240),snippet:z.string().min(1).max(240),officialSourceConfirmed:z.union([z.boolean(),z.literal('unknown')])}).strict();
export const verificationFieldResultSchema = z.object({field:verificationFieldSchema,internalValue:z.string().max(500).nullable(),externalValues:z.array(z.string().max(240)).max(12),status:verificationStatusSchema,evidence:z.array(fieldEvidenceSchema).max(12),checkedAt:z.iso.datetime().nullable(),freshness:freshnessSchema,explanation:z.string().max(300)}).strict();
export const verificationReportSchema = z.object({id:z.uuid(),ownerId:z.uuid(),conversationId:z.uuid(),provider:providerSchema,scope:z.array(verificationFieldSchema).min(1).max(20),startedAt:z.iso.datetime(),completedAt:z.iso.datetime(),status:z.enum(['completed','partial','verification_incomplete']),outcomes:z.array(z.enum(['timeout','rate_limit','source_unavailable','unsupported_source','provider_not_resolved'])).max(8),sources:z.array(researchSourceSchema).max(4),fields:z.array(verificationFieldResultSchema).max(20),freshness:freshnessSchema,counts:z.object({verified:z.number().int().nonnegative(),conflicting:z.number().int().nonnegative(),stale:z.number().int().nonnegative(),unresolved:z.number().int().nonnegative()}).strict(),activity:z.array(z.string().max(120)).max(8),warnings:z.array(z.string().max(240)).max(8)}).strict().superRefine((r,ctx)=>{
  if(r.provider.catalogSourceKind==='synthetic'&&(r.sources.length||r.fields.some(f=>f.evidence.length||['verified','stale','conflicting'].includes(f.status))))ctx.addIssue({code:'custom',message:'Synthetic records cannot acquire authoritative verification evidence'});
  const sources=new Map(r.sources.map(s=>[s.id,s]));
  for(const s of r.sources){const reviewed=approvedSources.find(a=>a.url===s.url&&a.type===s.sourceType&&[a.provider,...a.aliases].some(n=>n.toLowerCase()===r.provider.name.toLowerCase())&&a.location.toLowerCase()===r.provider.location.toLowerCase()&&(a.entityType??'hospital')===r.provider.type);
    if(!reviewed||s.authorityLevel!==sourceTypes.indexOf(s.sourceType)+1||new URL(s.url).hostname!==s.domain||s.entityId!==r.provider.id)ctx.addIssue({code:'custom',message:'Source identity and authority must match the reviewed research collection'});}
  if(sources.size!==r.sources.length||new Set(r.sources.map(s=>s.url)).size!==r.sources.length||new Set(r.scope).size!==r.scope.length||r.fields.length!==r.scope.length||r.fields.some(f=>!r.scope.includes(f.field))||new Set(r.fields.map(f=>f.field)).size!==r.fields.length) ctx.addIssue({code:'custom',message:'Unique sources and scoped fields required'});
  for(const f of r.fields){
    if(f.evidence.some(e=>e.entityId!==r.provider.id||e.field!==f.field||!sources.has(e.sourceId)||sources.get(e.sourceId)!.entityId!==r.provider.id||!e.snippet.includes(e.value)||e.officialSourceConfirmed!== (sources.get(e.sourceId)!.sourceType==='official_provider'?true:'unknown'))||JSON.stringify(f.externalValues)!==JSON.stringify([...new Set(f.evidence.map(e=>e.value))])) ctx.addIssue({code:'custom',message:'Values need exact linked entity/field evidence'});
    if(['verified','stale','conflicting'].includes(f.status)&&!f.evidence.length) ctx.addIssue({code:'custom',message:'Supported statuses need evidence'});
    if(f.status==='verified'&&f.freshness==='stale') ctx.addIssue({code:'custom',message:'Stale facts cannot be verified current'});
    if(['credentials','registration'].includes(f.field)&&f.evidence.some(e=>!['health_authority','regulator'].includes(sources.get(e.sourceId)?.sourceType??'')))ctx.addIssue({code:'custom',message:'Professional credentials require authority or registry evidence'});
    const conflict=new Set([...f.externalValues,...(f.internalValue?[f.internalValue]:[])].map(v=>normalizedFact(v,f.field))).size>1;
    if(f.evidence.length&&conflict&&f.status!=='conflicting')ctx.addIssue({code:'custom',message:'Conflicting facts cannot be silently resolved'});
    if(f.status==='conflicting'&&!conflict)ctx.addIssue({code:'custom',message:'Conflicts require disagreeing values'});
  }
  const count=(s:string)=>r.fields.filter(f=>f.status===s).length;
  const expectedStatus=r.outcomes.length&&!r.fields.some(f=>f.evidence.length)?'verification_incomplete':r.outcomes.length||r.fields.some(f=>!['verified','not_applicable'].includes(f.status))?'partial':'completed';
  if(r.status!==expectedStatus)ctx.addIssue({code:'custom',message:'Run status must describe the actual evidence and unresolved fields'});
  if(r.counts.verified!==count('verified')||r.counts.conflicting!==count('conflicting')||r.counts.stale!==count('stale')||r.counts.unresolved!==r.fields.filter(f=>!['verified','not_applicable'].includes(f.status)).length) ctx.addIssue({code:'custom',message:'Counts must describe actual field results'});
});
export type VerificationReport=z.infer<typeof verificationReportSchema>;
export type VerificationField=typeof verificationFields[number];
export type FieldEvidence=z.infer<typeof fieldEvidenceSchema>;
const input=z.object({provider:providerSchema,scope:z.array(verificationFieldSchema).min(1).max(20)}).strict();
export const verificationToolSchemas={verify_provider_information:input,refresh_provider_verification:input,get_provider_verification_status:input,get_provider_verification_history:input,compare_provider_evidence:input.extend({providers:z.array(providerSchema).min(2).max(3).optional()}).strict()};
export type VerificationTool=keyof typeof verificationToolSchemas;
export const verificationResultSchema=z.object({report:verificationReportSchema.optional(),peers:z.array(verificationReportSchema).max(3).optional(),history:z.array(verificationReportSchema).max(20),message:z.string().max(500),reused:z.boolean()}).strict();
export type VerificationResult=z.infer<typeof verificationResultSchema>;
