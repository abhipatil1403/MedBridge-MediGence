import { NextRequest,NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/agents/persistence';
import { validateUpload } from '@/lib/documents/coordination';
import { DOCUMENT_BUCKET,MAX_DOCUMENT_BYTES } from '@/lib/documents/schemas';
import { portalSession,checked,PortalError,portalResponse,portalFailure } from '@/lib/portals/server';
import { AgentError } from '@/lib/agents/errors';
export const runtime='nodejs';
const meta=z.object({id:z.uuid(),owner_id:z.uuid(),case_id:z.uuid(),filename:z.string(),mime_type:z.enum(['application/pdf','image/png','image/jpeg'])});
function path(d:z.infer<typeof meta>){return `${d.owner_id}/${d.case_id}/${d.id}.${d.mime_type==='application/pdf'?'pdf':d.mime_type==='image/png'?'png':'jpg'}`;}
export async function POST(request:NextRequest){try{
  const {db,user}=await portalSession(request);
  if(Number(request.headers.get('content-length')??0)>MAX_DOCUMENT_BYTES+20000)throw new PortalError(413,'Upload a file up to 3 MB.');
  const form=await request.formData();const file=form.get('file');
  if(!(file instanceof File)||file.size>MAX_DOCUMENT_BYTES)throw new PortalError(400,'Choose a PDF, PNG or JPEG up to 3 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());const checksum=validateUpload(file.name,file.type,bytes);
  const input={operationId:z.uuid().parse(form.get('operationId')),caseId:z.uuid().parse(form.get('caseId')),filename:file.name,mimeType:file.type,sizeBytes:bytes.length,checksum,
    ...(form.get('requestId')?{requestId:z.uuid().parse(form.get('requestId'))}:{}),...(form.get('replacesId')?{replacesId:z.uuid().parse(form.get('replacesId'))}:{})};
  const reserved=meta.parse(checked(await db.rpc('inquiry_command',{p_action:'reserve_upload',p_input:input})));
  if(reserved.owner_id!==user.id||reserved.case_id!==input.caseId)throw new PortalError(403,'This upload is unavailable.');
  const admin=createAdminClient(),storage=admin.storage.from(DOCUMENT_BUCKET);
  const upload=await storage.upload(path(reserved),bytes,{contentType:file.type,upsert:false});
  if(upload.error){
    // A retry may find bytes already stored. Verify equality before completing it.
    const existing=await storage.download(path(reserved));
    if(existing.error||!existing.data||createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==checksum)throw new PortalError(503,'The file was not uploaded. Keep it selected and retry.');
  }
  const committed=checked(await admin.rpc('inquiry_commit_upload',{p_actor:user.id,p_document:reserved.id}));
  const status=z.object({status:z.string()}).parse(committed).status;
  if(status==='withdrawn')throw new PortalError(409,'This previous upload has been withdrawn. Choose a new upload rather than retrying the withdrawn file.');
  return portalResponse({document:committed});
}catch(error){return portalFailure(error instanceof AgentError?new PortalError(400,error.publicMessage):error);}}
export async function GET(request:NextRequest){try{
  const {db}=await portalSession(request);
  const document=meta.parse(checked(await db.rpc('inquiry_document_delivery',{p_document_id:z.uuid().parse(request.nextUrl.searchParams.get('id'))})));
  const download=await createAdminClient().storage.from(DOCUMENT_BUCKET).download(path(document));
  if(download.error||!download.data)throw new PortalError(503,'This file could not be downloaded. Please retry.');
  // Buffer the private response; no durable URL or bucket path is returned to the browser.
  return new NextResponse(await download.data.arrayBuffer(),{headers:{'Content-Type':document.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(error){return portalFailure(error);}}
