import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { AgentError } from '@/lib/agents/errors';
import { inquiryAgentSchema,type InquiryAgentContext } from './agent';
import { inquiryNextStep,projectInquiryContext,type InquiryContext } from './schemas';
export async function readOwnInquiries(db:SupabaseClient<Database>,userId:string,caseId?:string):Promise<InquiryAgentContext>{
  let query=db.from('support_cases').select('id').eq('patient_id',userId).neq('inquiry_source','legacy').order('updated_at',{ascending:false}).limit(20);
  if(caseId)query=query.eq('id',caseId);
  const result=await query;
  if(result.error||caseId&&!result.data?.length)throw new AgentError('INQUIRY_ACCESS_DENIED','This request is unavailable in your account.');
  const contexts=await Promise.all((result.data??[]).map(async row=>{
    const result=await db.rpc('inquiry_context',{p_case_id:row.id});
    if(result.error||!result.data)throw new AgentError('INQUIRY_ACCESS_DENIED','This request is unavailable in your account.');
    const context=projectInquiryContext(result.data as unknown as InquiryContext);
    if(context.role!=='patient')throw new AgentError('INQUIRY_ACCESS_DENIED','Only your own inquiries are available to the assistant.');
    return {id:row.id,title:context.case.title,status:context.case.status,providerStatus:context.case.provider_response_status,nextStep:inquiryNextStep(context),updatedAt:context.case.updated_at,supportConsentActive:!context.case.consent_revoked_at,providerAuthorized:context.case.share_with_provider,linkedListing:{kind:context.case.entity_snapshot.kind,name:context.case.entity_snapshot.name,href:context.case.entity_snapshot.href},outstanding:context.documentRequests.filter(d=>['requested','replacement_requested'].includes(d.status)).slice(0,30).map(d=>({title:d.title,purpose:d.purpose,status:d.status}))};
  }));
  return inquiryAgentSchema.parse({selectedId:caseId??null,requests:contexts});
}
