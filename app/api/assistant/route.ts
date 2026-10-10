import { NextRequest, NextResponse } from 'next/server';
import { SupabaseVerificationStore } from '@/lib/verification/store';
import { defaultToolDependencies } from '@/lib/agents/tools';
import { z } from 'zod';
import { recoveryContext } from '@/lib/experience/recovery';
import { readOwnInquiries } from '@/lib/inquiries/server';
import { coordinationSchema } from '@/lib/experience/coordination-schema';
import { recordRequest } from '@/lib/operations/server';
import { executionOutcome, failureCategory, type FailureCategory } from '@/lib/operations/contracts';
import { configuredProvider } from '@/lib/agents/cloudflare-provider';
import { AgentError } from '@/lib/agents/errors';
import { createAdminClient, createUserClient, isAgentConfigured, SupabaseAgentStore, SupabaseCaseAccess, verifyUser } from '@/lib/agents/persistence';
import { orchestrate } from '@/lib/agents/orchestrator';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { assistantResponseSchema, userRequestSchema } from '@/lib/agents/schemas';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  const known = error instanceof AgentError ? error : new AgentError('REQUEST_FAILED', 'The assistant could not complete this request.');
  const status = known.code === 'AUTH_REQUIRED' ? 401 : known.code.includes('DENIED') ? 403 : known.code === 'CONFIGURATION_MISSING' ? 503 : 400;
  return NextResponse.json({ error: known.publicMessage, code: known.code }, { status });
}
function bearer(request: NextRequest) {
  const match = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new AgentError('AUTH_REQUIRED', 'Sign in to use the MedBridge AI.');
  return match[1];
}

export async function GET(request: NextRequest) {
  if (!isAgentConfigured()) return errorResponse(new AgentError('CONFIGURATION_MISSING', 'The assistant needs server configuration before it can run.'));
  try {
    const token = bearer(request);
    const user = await verifyUser(token);
    const db = createUserClient(token);
    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (conversationId && !z.uuid().safeParse(conversationId).success) throw new AgentError('INVALID_REQUEST', 'Invalid conversation.');
    const [conversationQuery, caseQuery, consentQuery] = await Promise.all([
      db.from('conversations').select('id,title,case_id,status,created_at,updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false }).limit(30),
      db.from('cases').select('id,title,status,owner_id').order('updated_at', { ascending: false }).limit(20),
      db.from('consents').select('case_id,subject_id,decision,created_at').eq('consent_type', 'agent_case_processing').order('created_at', { ascending: false }).limit(100),
    ]);
    if (conversationQuery.error || caseQuery.error || consentQuery.error) throw new AgentError('DATABASE_FAILURE', 'Workspace history is temporarily unavailable.');
    const consent = new Map<string, string>();
    const caseOwners = new Map((caseQuery.data ?? []).map((item) => [item.id, item.owner_id]));
    for (const item of consentQuery.data ?? []) if (item.case_id && item.subject_id === caseOwners.get(item.case_id) && !consent.has(item.case_id)) consent.set(item.case_id, item.decision);
    let messages: unknown[] = [];
    if (conversationId) {
      if (!(conversationQuery.data ?? []).some((item) => item.id === conversationId)) throw new AgentError('CONVERSATION_ACCESS_DENIED', 'This conversation is unavailable.');
      const query = await db.from('conversation_messages').select('id,role,content,metadata,created_at').eq('conversation_id', conversationId).order('created_at').limit(100);
      if (query.error) throw new AgentError('DATABASE_FAILURE', 'Conversation messages are temporarily unavailable.');
      messages = (query.data ?? []).map((message) => {
        const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata) ? message.metadata : {};
        if (!metadata.response) return message;
        const parsed = assistantResponseSchema.safeParse(metadata.response);
        return { ...message, metadata: parsed.success ? { ...metadata, response: parsed.data } : {} };
      });
      const actionIds = (messages as Array<{ metadata: { response?: { approvalId?: string } } }>).map((item) => item.metadata?.response?.approvalId).filter((id): id is string => Boolean(id));
      if (actionIds.length) {
        const actions = await createAdminClient().from('agent_actions').select('id,status').in('id', actionIds);
        if (!actions.error) {
          const statuses = new Map((actions.data ?? []).map((item) => [item.id, item.status]));
          messages = (messages as Array<{ metadata: { response?: { approvalId?: string } } }>).map((item) => ({
            ...item, metadata: item.metadata?.response?.approvalId ? { ...item.metadata, approvalStatus: statuses.get(item.metadata.response.approvalId) ?? 'proposed' } : item.metadata,
          }));
        }
      }
    }
    const selectedConversation = conversationQuery.data?.find((c) => c.id === conversationId);
    const activity = conversationId && selectedConversation ? await new SupabaseAgentStore(createAdminClient(), db).readActivity(conversationId, user.id, selectedConversation.case_id ?? undefined) : undefined;
    // An output may commit just before a process stops while adding its message.
    // Restore that authoritative artifact without invoking any tool on a GET.
    if(activity && ['completed','partially_completed','failed','waiting_for_input','awaiting_confirmation'].includes(activity.state)
      && !messages.some(raw=>(raw as {metadata?:{response?:{runId?:string}}}).metadata?.response?.runId===activity.runId)){
      const saved=await createAdminClient().from('agent_outputs').select('content').eq('run_id',activity.runId).eq('output_type','assistant_response').limit(1).maybeSingle();
      if(saved.error)throw new AgentError('DATABASE_FAILURE','Saved workflow results are unavailable.');
      const output=assistantResponseSchema.safeParse(saved.data?.content);
      if(output.success && output.data.conversationId===conversationId && output.data.runId===activity.runId)
        messages.push({id:`saved-${activity.runId}`,role:'assistant',content:output.data.summary,metadata:{response:output.data},created_at:activity.updatedAt});
    }
    const plan = conversationId ? await new SupabasePlanningStore(createAdminClient(), db).load(conversationId, user.id) : undefined;
    return NextResponse.json({ conversations: conversationQuery.data ?? [], cases: (caseQuery.data ?? []).map((item) => ({ ...item, canManageConsent: item.owner_id === user.id, agentConsent: consent.get(item.id) === 'granted' })), messages, plan, activity },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  const started=performance.now(), correlationId=crypto.randomUUID();
  let actor:string|undefined; const modelFailures:FailureCategory[]=[];let retryCount=0,modelRetryRecovered=false;
  if (!isAgentConfigured()) return errorResponse(new AgentError('CONFIGURATION_MISSING', 'The assistant needs server configuration before it can run.'));
  try {
    const token = bearer(request);
    const user = await verifyUser(token); actor=user.id;
    const body = userRequestSchema.safeParse(await request.json());
    if (!body.success) throw new AgentError('INVALID_REQUEST', 'Enter a request of up to 2,000 characters.');
    const userDb = createUserClient(token);
    const admin = createAdminClient();
    const response = await orchestrate(body.data, {
      userId: user.id,
      caseAccess: new SupabaseCaseAccess(userDb),
      store: new SupabaseAgentStore(admin, userDb),
      planningStore: new SupabasePlanningStore(admin, userDb),
      provider: configuredProvider(event=>{if(event.attempt>0){retryCount++;if(!event.category)modelRetryRecovered=true;}if(event.category&&modelFailures.length<32)modelFailures.push(event.category);}),
      tools:{...defaultToolDependencies,inquiryRead:async(id,caseId)=>{if(id!==user.id)throw new AgentError('INQUIRY_ACCESS_DENIED','This request is unavailable.');return readOwnInquiries(userDb,user.id,caseId);},verificationStore:new SupabaseVerificationStore(admin,userDb),recoveryRead:async(id)=>{if(id!==user.id)throw new AgentError('TOOL_SCOPE_DENIED','This coordination context is unavailable.');return coordinationSchema.parse(await recoveryContext(userDb,user.id));}},
    });
    const observed=executionOutcome(response);
    await recordRequest(user.id,{correlationId,executionId:response.runId,kind:'ai',action:'execute',...observed,durationMs:Math.min(300000,Math.round(performance.now()-started)),retryCount:Math.min(32,retryCount),modelFailures,recovered:modelRetryRecovered&&observed.outcome==='completed'});
    return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { if(actor)await recordRequest(actor,{correlationId,kind:'ai',action:'execute',outcome:'failed',category:failureCategory(error instanceof AgentError?error.code:'REQUEST_FAILED'),durationMs:Math.min(300000,Math.round(performance.now()-started)),retryCount:Math.min(32,retryCount),modelFailures,recovered:false}); return errorResponse(error); }
}
