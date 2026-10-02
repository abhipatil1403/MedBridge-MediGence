import { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { checked, portalFailure, portalResponse, portalSession, PortalError } from '@/lib/portals/server';
import { createAdminClient } from '@/lib/agents/persistence';
import { catalogRepository } from '@/lib/catalog/repository';
import { verifyProviderTool } from '@/lib/verification/service';
import { SupabaseVerificationStore } from '@/lib/verification/store';
import type { Json } from '@/types/database';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(request:NextRequest) {
  try {
    const {db,user,context}=await portalSession(request);
    if(!['admin','super_admin','support_agent','support_manager'].includes(context.role??''))throw new PortalError(403,'Verification checks require an assigned reviewer.');
    const input=z.object({organizationId:z.uuid()}).strict().parse(await request.json());
    const org=checked(await db.from('organizations').select('*').eq('id',input.organizationId).single()) as import('@/types/database').Database['public']['Tables']['organizations']['Row'];
    if(!['admin','super_admin'].includes(context.role??'')) {
      const assigned=checked(await db.from('provider_submissions').select('id').eq('organization_id',input.organizationId).eq('reviewer_id',user.id));
      if(!assigned.length)throw new PortalError(403,'You must be assigned to review this provider.');
    }
    const snapshot=await catalogRepository.loadSnapshot!();
    const hospital=snapshot.hospitals.find(item=>item.recordId===org.hospital_id);
    if(!hospital)throw new PortalError(400,'Publish the reviewed provider before running a catalog verification check.');
    const admin=createAdminClient();
    const conversation=checked(await admin.from('conversations').insert({id:randomUUID(),owner_id:user.id,title:`Provider review: ${hospital.name}`}).select('id').single()) as {id:string};
    const toolInput={provider:{id:hospital.recordId!,type:'hospital' as const,name:hospital.name,location:hospital.city,slug:hospital.slug,sourceKind:'medbridge_catalog' as const,catalogSourceKind:hospital.sourceKind},scope:['name','city','country','phone','email','website','accreditation'] as const};
    const result=await verifyProviderTool('verify_provider_information',toolInput,user.id,{ownerId:user.id,conversationId:conversation.id,tool:'verify_provider_information',input:toolInput},new SupabaseVerificationStore(admin,db),snapshot);
    if(!result.report)throw new PortalError(400,'The verification check did not return a report.');
    const report=Object.fromEntries(Object.entries(result.report).filter(([key])=>!['ownerId','conversationId'].includes(key)));
    checked(await admin.rpc('record_portal_verification',{p_actor:user.id,p_organization_id:org.id,p_provider_id:hospital.recordId!,p_report:report as Json}));
    return portalResponse({message:result.message});
  }catch(error){return portalFailure(error);}
}
