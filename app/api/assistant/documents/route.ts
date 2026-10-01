import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess, verifyUser } from '@/lib/agents/persistence';
import { AgentError } from '@/lib/agents/errors';
import { runAgent } from '@/lib/agents/runtime';
import { defaultToolDependencies } from '@/lib/agents/tools';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';
import { SupabaseDocumentStore } from '@/lib/documents/store';
import { documentExecution } from '@/lib/documents/agent';
import { documentMimeSchema, documentToolSchemas, MAX_DOCUMENT_BYTES, startDocumentsSchema, type DocumentTool } from '@/lib/documents/schemas';
import type { DocumentAuthorization } from '@/lib/documents/service';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store'};
async function context(request:NextRequest) {
  const token=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')?.[1];
  if(!token) throw new AgentError('AUTH_REQUIRED','Sign in to organize documents.');
  const user=await verifyUser(token), db=createUserClient(token), admin=createAdminClient();
  return {user,db,admin,store:new SupabaseDocumentStore(admin,db),agentStore:new SupabaseAgentStore(admin,db),planning:new SupabasePlanningStore(admin,db)};
}
function failure(error:unknown) {
  const known=error instanceof AgentError ? error : new AgentError('DOCUMENT_REQUEST_FAILED','The document request could not be completed. Refresh and retry.');
  return NextResponse.json({error:known.publicMessage,code:known.code},{status:known.code==='AUTH_REQUIRED'?401:known.code.includes('DENIED')?403:400,headers});
}
export async function GET(request:NextRequest) {
  try {
    const c=await context(request), conversation=request.nextUrl.searchParams.get('conversationId');
    if(conversation&&!z.uuid().safeParse(conversation).success) throw new AgentError('DOCUMENT_INVALID_REQUEST','Select a valid conversation.');
    const [hospitals,services]=await Promise.all([c.db.from('hospitals').select('id,name,source_kind').eq('publication_status','published').order('name').limit(100),
      c.db.from('healthcare_services').select('id,name').eq('status','published').order('name').limit(100)]);
    if(hospitals.error||services.error) throw new AgentError('DOCUMENT_OPTIONS_FAILED','Hospital/service choices are unavailable.');
    const workspace=conversation?await c.store.byConversation(conversation,c.user.id):undefined;
    return NextResponse.json({hospitals:hospitals.data,services:services.data,workspace},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:NextRequest) {
  let release:(()=>Promise<void>)|undefined;
  try {
    const c=await context(request);
    let file:DocumentAuthorization['file'],tool:DocumentTool,input:unknown,conversationId:string|undefined;
    if(request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      if(Number(request.headers.get('content-length'))>MAX_DOCUMENT_BYTES+20000) throw new AgentError('DOCUMENT_SIZE','Upload a file up to 3 MB.');
      const form=await request.formData(), selected=form.get('file');
      if(!(selected instanceof File)||selected.size>MAX_DOCUMENT_BYTES) throw new AgentError('DOCUMENT_SIZE','Choose a file up to 3 MB.');
      tool='upload_document'; input=documentToolSchemas.upload_document.parse({workspaceId:form.get('workspaceId'),replaces:form.get('replaces')||undefined});
      file={filename:selected.name,mimeType:documentMimeSchema.parse(selected.type),bytes:new Uint8Array(await selected.arrayBuffer())};
    } else {
      if(Number(request.headers.get('content-length'))>5000) throw new AgentError('DOCUMENT_INVALID_REQUEST','Document request is too large.');
      const body=z.object({action:z.enum(['start',...Object.keys(documentToolSchemas) as [DocumentTool,...DocumentTool[]]]),input:z.unknown(),conversationId:z.uuid().optional()}).strict().parse(await request.json());
      conversationId=body.conversationId;
      if(body.action==='start') {
        const target=startDocumentsSchema.parse(body.input);
        conversationId ??= await c.agentStore.createConversation(c.user.id);
        const conv=await c.db.from('conversations').select('case_id').eq('id',conversationId).eq('owner_id',c.user.id).maybeSingle();
        if(!conv.data||conv.error) throw new AgentError('DOCUMENT_ACCESS_DENIED','Select your own conversation.');
        const lease=randomUUID();
        if(!await c.planning.acquire(conversationId,c.user.id,lease)) throw new AgentError('TURN_IN_PROGRESS','This conversation is working. Try again shortly.');
        release=()=>c.planning.release(conversationId!,lease);
        const w=await c.store.start(c.user.id,conversationId,target);
        tool='get_document_requirements'; input={workspaceId:w.id};
      } else {tool=body.action;input=documentToolSchemas[tool].parse(body.input);}
    }
    const w=await c.store.load((input as {workspaceId:string}).workspaceId,c.user.id);
    conversationId=w.conversationId;
    if(!release) {
      const lease=randomUUID();
      if(!await c.planning.acquire(conversationId,c.user.id,lease)) throw new AgentError('TURN_IN_PROGRESS','This conversation is working. Try again shortly.');
      release=()=>c.planning.release(conversationId!,lease);
    }
    const conv=await c.db.from('conversations').select('case_id').eq('id',conversationId).eq('owner_id',c.user.id).single();
    if(conv.error) throw new AgentError('DOCUMENT_ACCESS_DENIED','This conversation is unavailable.');
    const auth:DocumentAuthorization={ownerId:c.user.id,conversationId,workspaceId:w.id,command:{tool,input},file};
    // The standard runtime records tasks, owner-scoped tool results, status and provenance.
    const response=await runAgent({content:'Organize the selected document workspace.',conversationId,caseId:conv.data.case_id??undefined},
      {userId:c.user.id,store:c.agentStore,caseAccess:new SupabaseCaseAccess(c.db),
        provider:{generateStructured:async()=>{throw new Error('Document contents and metadata never enter a model.');}},
        tools:{...defaultToolDependencies,documentStore:c.store},execution:documentExecution(tool,input,auth)});
    const fresh=await c.store.load(w.id,c.user.id);
    return NextResponse.json({response,workspace:fresh},{headers});
  }catch(error){return failure(error);}finally{await release?.();}
}
