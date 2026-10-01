import { verificationReportSchema, type VerificationReport } from './schemas';
/** Expose sourced facts for coordination, never convert them into document requirements. */
export function verifiedServiceSources(raw:VerificationReport,ownerId:string,conversationId:string,hospitalId:string,serviceLabel:string){
  const r=verificationReportSchema.parse(raw);
  if(r.ownerId!==ownerId||r.conversationId!==conversationId||r.provider.id!==hospitalId||r.provider.type!=='hospital')return [];
  return r.fields.filter(f=>['services','treatments'].includes(f.field)&&f.status==='verified'&&f.freshness!=='stale').flatMap(f=>f.evidence.filter(e=>e.value.split(/;|,/).some(v=>v.trim().toLowerCase()===serviceLabel.toLowerCase())).map(e=>({field:f.field,value:e.value,snippet:e.snippet,source:r.sources.find(s=>s.id===e.sourceId)!})));
}
