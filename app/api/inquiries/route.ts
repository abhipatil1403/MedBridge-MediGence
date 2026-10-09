import { NextRequest } from 'next/server';
import { z } from 'zod';
import { portalSession,portalResponse,portalFailure,checked,PortalError } from '@/lib/portals/server';
import { entityKind,inquiryCommandSchema } from '@/lib/inquiries/schemas';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{
  const {db,user,portal}=await portalSession(request);const params=request.nextUrl.searchParams;
  if(params.has('id')){
    const id=z.uuid().parse(params.get('id'));
    if(portal==='patient'){
      const own=await db.from('support_cases').select('id').eq('id',id).eq('patient_id',user.id).maybeSingle();
      if(own.error||!own.data)throw new PortalError(403,'This request is unavailable in your account.');
    }
    return portalResponse(checked(await db.rpc('inquiry_context',{p_case_id:id})));
  }
  if(params.has('entityId'))return portalResponse(checked(await db.rpc('inquiry_target',{p_kind:entityKind.parse(params.get('kind')),p_id:z.uuid().parse(params.get('entityId'))})));
  const page=z.coerce.number().int().min(0).max(1000).parse(params.get('page')??0);
  let query=db.from('support_cases').select('id,title,status,updated_at,inquiry_source,entity_snapshot,provider_response_status,consent_revoked_at',{count:'exact'}).order('updated_at',{ascending:false}).range(page*25,page*25+24);
  if(portal==='patient')query=query.eq('patient_id',user.id);
  const {data,error,count}=await query;if(error)throw new PortalError(400,'Your requests could not be loaded. Please retry.');
  return portalResponse({items:data,total:count,page});
}catch(error){return portalFailure(error);}}
export async function POST(request:NextRequest){try{
  const {db}=await portalSession(request);
  if(Number(request.headers.get('content-length')??0)>20000)throw new PortalError(413,'This request is too large.');
  const parsed=inquiryCommandSchema.parse(await request.json());
  return portalResponse(checked(await db.rpc('inquiry_command',{p_action:parsed.action,p_input:parsed.input})));
}catch(error){return portalFailure(error);}}
