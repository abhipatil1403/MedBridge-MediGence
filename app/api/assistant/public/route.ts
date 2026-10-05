import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GET as authenticatedHistory, POST as authenticatedTurn } from '../route';
import { createAdminClient, createUserClient, verifyUser, SupabaseAgentStore, SupabaseCaseAccess } from '@/lib/agents/persistence';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { defaultToolDependencies } from '@/lib/agents/tools';
import { orchestrate, type OrchestratorContext } from '@/lib/agents/orchestrator';
import { userRequestSchema } from '@/lib/agents/schemas';
import { visitorSchema, visitorStores, freshVisitor, type VisitorState } from '@/lib/experience/visitor-store';
import { pageContextSchema, seedPageContext } from '@/lib/experience/page-context';
import { AgentError } from '@/lib/agents/errors';
import { configuredProvider } from '@/lib/agents/cloudflare-provider';
import { recoveryContext } from '@/lib/experience/recovery';
import { coordinationSchema } from '@/lib/experience/coordination-schema';
import { SupabaseVerificationStore } from '@/lib/verification/store';
import type { Json } from '@/types/database';
export const runtime='nodejs';export const maxDuration=120;export const dynamic='force-dynamic';
const cookie='medbridge_visitor';
const schema=userRequestSchema.omit({caseId:true}).extend({page:pageContextSchema.optional(),action:z.enum(['send','adopt','reset']).default('send')});
function visitorToken(request:NextRequest){const token=request.cookies.get(cookie)?.value;return token&&/^[a-f0-9]{64}$/.test(token)?token:undefined;}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function ipHash(request:NextRequest){
  // Vercel sets this header. Local deployments share a conservative fallback quota.
  const ip=process.env.VERCEL?request.headers.get('x-vercel-forwarded-for')?.split(',')[0]??'unknown':'local';
  return createHmac('sha256',process.env.SUPABASE_SECRET_KEY??'unconfigured').update(ip).digest('hex');
}
const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
function failure(error:unknown){const known=error instanceof AgentError?error:null;return NextResponse.json({error:known?.publicMessage??'The assistant is temporarily unavailable. Please try again.',code:known?.code??'REQUEST_FAILED'},{status:known?.code==='AUTH_REQUIRED'?401:known?.code==='VISITOR_LIMIT'?429:known?.code==='INVALID_REQUEST'?400:503,headers:{'Cache-Control':'no-store'}});}
export async function GET(request:NextRequest){
  if(request.headers.has('authorization'))return authenticatedHistory(request);
  try{const token=visitorToken(request);if(!token)return json({messages:[],temporary:true});
    const raw=await createAdminClient().rpc('experience_guest_session',{p_action:'read',p_hash:hash(token)});
    if(raw.error)throw new AgentError('DATABASE_FAILURE','Temporary conversations are unavailable.');
    const parsed=visitorSchema.safeParse(raw.data);
    return json(parsed.success?{messages:parsed.data.messages.map(m=>({...m,created_at:m.createdAt})),conversationId:parsed.data.conversationId,plan:parsed.data.plan,temporary:true}:{messages:[],temporary:true});
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
  let token=visitorToken(request),lease:string|undefined;
  try {
    const origin=request.headers.get('origin');
    const originUrl=origin?URL.parse(origin):null;
    // Next can normalize a loopback hostname internally. The browser Origin must
    // still match the incoming Host and protocol; cross-site POSTs are rejected.
    if(!originUrl||originUrl.host!==request.headers.get('host')||originUrl.protocol!==request.nextUrl.protocol)throw new AgentError('INVALID_REQUEST','Open the assistant on MedBridge to continue.');
    const body=schema.safeParse(await request.json());if(!body.success)throw new AgentError('INVALID_REQUEST','Enter a request of up to 2,000 characters.');
    const admin=createAdminClient();
    const access=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')?.[1];
    if(request.headers.has('authorization')&&!access)throw new AgentError('AUTH_REQUIRED','Sign in to continue.');
    if(access&&body.data.action==='send'&&!body.data.page) {
      const forwarded=new NextRequest(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({content:body.data.content,conversationId:body.data.conversationId,displayCurrency:body.data.displayCurrency})});
      return authenticatedTurn(forwarded);
    }
    if(access&&body.data.action==='send') {
      const user=await verifyUser(access),db=createUserClient(access);
      const context:OrchestratorContext={userId:user.id,store:new SupabaseAgentStore(admin,db),planningStore:new SupabasePlanningStore(admin,db),caseAccess:new SupabaseCaseAccess(db),provider:configuredProvider(),tools:{...defaultToolDependencies,verificationStore:new SupabaseVerificationStore(admin,db),recoveryRead:async id=>{if(id!==user.id)throw new AgentError('TOOL_SCOPE_DENIED','This context is unavailable.');return coordinationSchema.parse(await recoveryContext(db,id));}}};
      const conversationId=body.data.conversationId??await context.store.createConversation(user.id);
      await context.store.assertConversation(conversationId,user.id);
      // Resolve current published page context within the existing conversation turn lease.
      if(body.data.page)context.prepareTurn=async turn=>{await seedPageContext(body.data.page!,conversationId,turn);};
      return json(await orchestrate({content:body.data.content,conversationId,displayCurrency:body.data.displayCurrency},context));
    }
    token??=randomBytes(32).toString('hex');lease=randomUUID();
    const acquired=await admin.rpc('experience_guest_session',{p_action:'acquire',p_hash:hash(token),p_ip_hash:ipHash(request),p_lease:lease});
    if(acquired.error)throw new AgentError(acquired.error.message.includes('VISITOR_LIMIT')?'VISITOR_LIMIT':'VISITOR_BUSY',acquired.error.message.includes('VISITOR_LIMIT')?'Temporary assistant usage has reached its limit. Please sign in or try later.':'This conversation is unavailable or still working. Please try again.');
    if(body.data.action==='adopt') {
      if(!access)throw new AgentError('AUTH_REQUIRED','Sign in to keep this conversation.');
      const user=await verifyUser(access);visitorSchema.parse(acquired.data);
      const result=await admin.rpc('experience_import_visitor',{p_hash:hash(token),p_lease:lease,p_user:user.id});
      if(result.error)throw new AgentError('DATABASE_FAILURE','This conversation could not be imported. Please try again.');
      const response=json({conversationId:result.data});response.cookies.delete(cookie);return response;
    }
    if(body.data.action==='reset') {await admin.rpc('experience_guest_session',{p_action:'delete',p_hash:hash(token),p_lease:lease});const response=json({messages:[],temporary:true});response.cookies.delete(cookie);return response;}
    const parsed=visitorSchema.safeParse(acquired.data);const state:VisitorState=parsed.success?parsed.data:freshVisitor();
    if(body.data.conversationId&&body.data.conversationId!==state.conversationId)throw new AgentError('CONVERSATION_ACCESS_DENIED','This conversation is unavailable.');
    const stores=visitorStores(state);
    const deny=async()=>{throw new AgentError('AUTH_REQUIRED','Sign in to manage private care coordination.');};
    const context:OrchestratorContext={...stores,userId:state.userId,caseAccess:{readContext:deny,readDocumentMetadata:deny},provider:configuredProvider(),tools:{...defaultToolDependencies,publicSession:true}};
    const page=body.data.page?`${body.data.page.kind}:${body.data.page.slug}`:undefined;
    if(page&&page!==state.page){await seedPageContext(body.data.page!,state.conversationId,context);state.page=page;}
    const result=await orchestrate({content:body.data.content,conversationId:state.conversationId,displayCurrency:body.data.displayCurrency},context);
    const saved=await admin.rpc('experience_guest_session',{p_action:'save',p_hash:hash(token),p_lease:lease,p_state:visitorSchema.parse(state) as unknown as Json});
    if(saved.error)throw new AgentError('DATABASE_FAILURE','The temporary conversation could not be saved. Please try again.');
    const response=json({...result,temporary:true});response.cookies.set(cookie,token,{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'strict',path:'/',maxAge:86400});return response;
  }catch(error){if(token&&lease)try{await createAdminClient().rpc('experience_guest_session',{p_action:'release',p_hash:hash(token),p_lease:lease});}catch{/* Return only the original public failure. */}return failure(error);}
}
