import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AgentError } from '@/lib/agents/errors';
import { createAdminClient,createUserClient,verifyUser } from '@/lib/agents/persistence';
import { SupabaseDocumentStore } from '@/lib/documents/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {
    const token=/^Bearer (.+)$/.exec(request.headers.get('authorization')??'')?.[1];
    if(!token) throw new AgentError('AUTH_REQUIRED','Sign in to review a file.');
    const user=await verifyUser(token);
    const ids=z.object({workspaceId:z.uuid(),documentId:z.uuid()}).parse(Object.fromEntries(request.nextUrl.searchParams));
    const store=new SupabaseDocumentStore(createAdminClient(),createUserClient(token));
    const result=await store.download(await store.load(ids.workspaceId,user.id),ids.documentId);
    const filename=encodeURIComponent(result.document.filename);
    return new Response(result.bytes,{headers:{'Content-Type':result.document.mimeType,'Content-Disposition':`attachment; filename*=UTF-8''${filename}`,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
  }catch(error){return NextResponse.json({error:error instanceof AgentError?error.publicMessage:'This file is unavailable.'},{status:error instanceof AgentError&&error.code==='AUTH_REQUIRED'?401:403,headers:{'Cache-Control':'private, no-store'}});}
}
