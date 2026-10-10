import { recordRequest } from '@/lib/operations/server';
import { failureCategory, requestEventSchema } from '@/lib/operations/contracts';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { portalSession,portalResponse,portalFailure,checked,PortalError } from '@/lib/portals/server';
import { entityKind,inquiryCommandSchema,projectInquiryContext,type InquiryContext } from '@/lib/inquiries/schemas';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{
  const {db,user,portal}=await portalSession(request);const params=request.nextUrl.searchParams;
  if(params.has('id')){
    const id=z.uuid().parse(params.get('id'));
    if(portal==='patient'){
      const own=await db.from('support_cases').select('id').eq('id',id).eq('patient_id',user.id).maybeSingle();
      if(own.error||!own.data)throw new PortalError(403,'This request is unavailable in your account.');
    }
    return portalResponse(projectInquiryContext(checked(await db.rpc('inquiry_context',{p_case_id:id})) as unknown as InquiryContext));
  }
  if(params.has('entityId'))return portalResponse(checked(await db.rpc('inquiry_target',{p_kind:entityKind.parse(params.get('kind')),p_id:z.uuid().parse(params.get('entityId'))})));
  const page=z.coerce.number().int().min(0).max(1000).parse(params.get('page')??0);
  let query=db.from('support_cases').select('id,title,status,updated_at,inquiry_source,entity_snapshot,provider_response_status,consent_revoked_at',{count:'exact'}).order('updated_at',{ascending:false}).range(page*25,page*25+24);
  if(portal==='patient')query=query.eq('patient_id',user.id);
  const {data,error,count}=await query;if(error)throw new PortalError(400,'Your requests could not be loaded. Please retry.');
  return portalResponse({items:data,total:count,page});
}catch(error){return portalFailure(error);}}
export async function POST(request:NextRequest){
 const started=performance.now(),correlationId=crypto.randomUUID();let actor:string|undefined;let parsed:z.infer<typeof inquiryCommandSchema>|undefined;
 try{
  const {db,user}=await portalSession(request);actor=user.id;
  if(Number(request.headers.get('content-length')??0)>20000)throw new PortalError(413,'This request is too large.');
  parsed=inquiryCommandSchema.parse(await request.json());
  const result=await db.rpc('inquiry_command',{p_action:parsed.action,p_input:parsed.input});
  if(result.error){
   const known=['CONSENT','CONFIRMATION','DENIED','INVALID','CONFLICT'].find(code=>result.error.message.includes(code));
   await recordRequest(user.id,{correlationId,operationId:parsed.input.operationId,kind:'inquiry',action:requestEventSchema.shape.action.parse(parsed.action),outcome:'failed',category:failureCategory(known?`INQUIRY_${known}`:result.error.code),durationMs:Math.min(300000,Math.round(performance.now()-started)),retryCount:0,modelFailures:[],recovered:false});
  }else await recordRequest(user.id,{correlationId,operationId:parsed.input.operationId,kind:'inquiry',action:requestEventSchema.shape.action.parse(parsed.action),outcome:'completed',durationMs:Math.min(300000,Math.round(performance.now()-started)),retryCount:0,modelFailures:[],recovered:false});
  return portalResponse(checked(result));
 }catch(error){
  if(actor&&parsed&&!(error instanceof PortalError))await recordRequest(actor,{correlationId,operationId:parsed.input.operationId,kind:'inquiry',action:requestEventSchema.shape.action.parse(parsed.action),outcome:'failed',category:'database_unavailable',durationMs:Math.min(300000,Math.round(performance.now()-started)),retryCount:0,modelFailures:[],recovered:false});
  return portalFailure(error);
 }
}
