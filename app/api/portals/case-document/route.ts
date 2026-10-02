import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/agents/persistence';
import { documentWorkspaceSchema, DOCUMENT_BUCKET } from '@/lib/documents/schemas';
import { documentPath } from '@/lib/documents/coordination';
import { checked, portalFailure, portalSession, PortalError } from '@/lib/portals/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  try {
    const {db,user,context}=await portalSession(request);
    const caseId=z.uuid().parse(request.nextUrl.searchParams.get('caseId'));
    const documentId=z.uuid().parse(request.nextUrl.searchParams.get('documentId'));
    const scoped=checked(await db.rpc('portal_case_context',{p_case_id:caseId}));
    const selected=z.object({case:z.object({patient_id:z.uuid(),document_workspace_id:z.uuid().nullable(),share_documents:z.boolean(),consent_revoked_at:z.string().nullable()}),documents:documentWorkspaceSchema}).safeParse(scoped);
    if(!selected.success||!selected.data.case.share_documents||selected.data.case.consent_revoked_at||selected.data.documents.id!==selected.data.case.document_workspace_id||selected.data.documents.ownerId!==selected.data.case.patient_id)throw new PortalError(403,'This document has not been shared with your account.');
    const doc=selected.data.documents.documents.find(item=>item.id===documentId&&item.uploadStatus==='uploaded');
    if(!doc)throw new PortalError(404,'This file is unavailable.');
    const admin=createAdminClient();const result=await admin.storage.from(DOCUMENT_BUCKET).download(documentPath(selected.data.documents.id,doc));
    if(result.error||!result.data)throw new PortalError(404,'This file is unavailable.');
    const audit=await admin.from('audit_events').insert({actor_id:user.id,actor_type:context.role?'staff':'patient',actor_role:context.role??'authorized_case_participant',event_name:'support.document_downloaded',entity_type:'support_case',entity_id:caseId,metadata:{documentId}});
    if(audit.error)throw new PortalError(400,'This file download could not be recorded. Please try again.');
    return new Response(await result.data.arrayBuffer(),{headers:{'Content-Type':doc.mimeType,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error){return portalFailure(error);}
}
