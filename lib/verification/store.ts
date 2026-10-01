import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { AgentError } from '@/lib/agents/errors';
import { verificationReportSchema, type VerificationReport } from './schemas';
export interface VerificationStore{history(ownerId:string,conversationId:string,providerId:string):Promise<VerificationReport[]>;save(report:VerificationReport):Promise<void>}
export class SupabaseVerificationStore implements VerificationStore{
  constructor(private readonly admin:SupabaseClient<Database>,private readonly user:SupabaseClient<Database>){}
  private async owned(ownerId:string,conversationId:string){const {data,error}=await this.user.from('conversations').select('id').eq('id',conversationId).eq('owner_id',ownerId).maybeSingle();if(error||!data)throw new AgentError('VERIFICATION_ACCESS_DENIED','This verification conversation is unavailable.');}
  async history(ownerId:string,conversationId:string,providerId:string){await this.owned(ownerId,conversationId);const {data,error}=await this.user.from('provider_verification_runs').select('report').eq('owner_id',ownerId).eq('conversation_id',conversationId).eq('provider_id',providerId).order('completed_at',{ascending:false}).limit(20);
    if(error)throw new AgentError('VERIFICATION_STORAGE_UNAVAILABLE','Verification history is unavailable. Apply the provider verification migration.');
    return (data??[]).map(r=>verificationReportSchema.parse(r.report)).filter(r=>r.ownerId===ownerId&&r.conversationId===conversationId&&r.provider.id===providerId);}
  async save(raw:VerificationReport){const r=verificationReportSchema.parse(raw);await this.owned(r.ownerId,r.conversationId);const {error}=await this.admin.from('provider_verification_runs').insert({id:r.id,owner_id:r.ownerId,conversation_id:r.conversationId,provider_id:r.provider.id,provider_type:r.provider.type,completed_at:r.completedAt,report:r as unknown as Json});if(error)throw new AgentError('VERIFICATION_SAVE_FAILED','Verification could not be saved. Please retry.');}
}
