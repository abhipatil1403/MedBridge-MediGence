import { verificationReportSchema, normalizedFact, type FieldEvidence, type VerificationField, type VerificationProvider, type VerificationReport } from './schemas';
import type { ResearchSource } from '@/lib/research/schemas';
import { classifyFreshness, type FreshnessPolicy } from './policy';
export function classifyReport(input:{id:string;ownerId:string;conversationId:string;provider:VerificationProvider;scope:VerificationField[];internal:Partial<Record<VerificationField,string>>;sources:ResearchSource[];evidence:FieldEvidence[];outcomes:VerificationReport['outcomes'];startedAt:string;completedAt:string;policy:FreshnessPolicy;warnings:string[]}):VerificationReport{
  const fields=input.scope.map(field=>{
    const internalValue=input.internal[field]??null;
    const evidence=input.evidence.filter(e=>e.field===field);
    const externalValues=[...new Set(evidence.map(e=>e.value))];
    const conflict=new Set([...externalValues, ...(internalValue?[internalValue]:[])].map(v=>normalizedFact(v,field))).size>1;
    const fresh=evidence.map(e=>{const s=input.sources.find(s=>s.id===e.sourceId)!;return classifyFreshness(s.publishedAt??s.retrievedAt,field,input.policy,Date.parse(input.completedAt));});
    const freshness=fresh.includes('stale')?'stale':fresh.includes('aging')?'aging':fresh.length&&fresh.every(f=>f==='current')?'current':'unknown';
    const applicable=input.provider.type==='doctor'||field==='affiliations'&&input.provider.type==='package'||!['specialty','affiliations','credentials','registration','consultation_mode'].includes(field);
    const status=!applicable?'not_applicable':evidence.length?conflict?'conflicting':freshness==='stale'?'stale':'verified':internalValue?'internal_only':input.outcomes.length?'unverified':'not_found';
    return {field,internalValue,externalValues,status,evidence,checkedAt:input.sources.length?input.completedAt:null,freshness,
      explanation:status==='conflicting'?'Sources disagree; manual confirmation may be required. No value was selected.':status==='verified'?'Supported by the exact retrieved statement; no clinical quality or suitability is established.':status==='stale'?'Evidence exceeds the configured freshness policy.':status==='internal_only'?'Catalog information only; no authoritative external evidence was collected.':status==='not_applicable'?'This field does not apply to this provider type.':input.outcomes.length?'Verification could not be completed for this field. This is not a judgment about the provider.':'No explicit statement was found in the checked sources.'};
  });
  return verificationReportSchema.parse({id:input.id,ownerId:input.ownerId,conversationId:input.conversationId,provider:input.provider,scope:input.scope,startedAt:input.startedAt,completedAt:input.completedAt,
    status:input.outcomes.length&&!input.evidence.length?'verification_incomplete':fields.some(f=>!['verified','not_applicable'].includes(f.status))||input.outcomes.length?'partial':'completed',outcomes:input.outcomes,sources:input.sources,fields,
    freshness:classifyFreshness(input.completedAt,'report',input.policy,Date.parse(input.completedAt)),
    counts:{verified:fields.filter(f=>f.status==='verified').length,conflicting:fields.filter(f=>f.status==='conflicting').length,stale:fields.filter(f=>f.status==='stale').length,unresolved:fields.filter(f=>!['verified','not_applicable'].includes(f.status)).length},
    activity:['Provider resolved','Internal information loaded',`${input.sources.length} approved sources retrieved`,'Facts and conflicts evaluated','Verification saved'],warnings:input.warnings});
}
