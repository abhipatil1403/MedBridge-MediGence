import { randomUUID } from 'node:crypto';
import { AgentError } from '@/lib/agents/errors';
import { canonicalInput } from '@/lib/agents/execution-state';
import { confirmMatch, newUpload, nextRevision, preparePackage } from './coordination';
import { documentRequirementSchema, documentToolSchemas, type DocumentTool, type DocumentWorkspace, type UploadedDocument } from './schemas';
import type { DocumentStore } from './store';

export interface DocumentAuthorization {
  ownerId: string; conversationId: string; workspaceId: string;
  // Created by the authenticated route from an explicit user action, never from model output.
  command?: { tool: DocumentTool; input: unknown };
  file?: { filename: string; mimeType: UploadedDocument['mimeType']; bytes: Uint8Array };
}
export const documentWrites = new Set<DocumentTool>(['upload_document','match_document_to_requirement','remove_document','prepare_document_package','add_document_requirement']);
export function authorizeDocumentTool(tool: string, input: unknown, ownerId: string, auth?: DocumentAuthorization) {
  if (!Object.hasOwn(documentToolSchemas,tool) || !auth || auth.ownerId !== ownerId || !ownerId
    || (input as {workspaceId?:string})?.workspaceId !== auth.workspaceId) return false;
  return !documentWrites.has(tool as DocumentTool) || auth.command?.tool === tool && canonicalInput(auth.command.input) === canonicalInput(input);
}
export async function coordinateDocument(tool: DocumentTool, raw: unknown, ownerId: string, auth: DocumentAuthorization | undefined, store: DocumentStore | undefined): Promise<DocumentWorkspace> {
  const input = documentToolSchemas[tool].parse(raw);
  if (!authorizeDocumentTool(tool,input,ownerId,auth) || !store) throw new AgentError('DOCUMENT_ACCESS_DENIED','This document action needs your authenticated confirmation.');
  const w = structuredClone(await store.load(input.workspaceId,ownerId));
  if (w.ownerId !== ownerId || w.conversationId !== auth!.conversationId) throw new AgentError('DOCUMENT_ACCESS_DENIED','This document workspace belongs to another conversation.');
  const revision = w.revision;
  if (!documentWrites.has(tool)) return w;
  if (tool === 'upload_document') {
    if (!auth!.file) throw new AgentError('DOCUMENT_INVALID_FILE','Choose a file to upload.');
    const args = documentToolSchemas.upload_document.parse(input);
    const d = newUpload(w,auth!.file,args.replaces);
    await store.put(w,d,auth!.file.bytes);
    w.documents.push(d);
    if (args.replaces) w.documents.find(old => old.id === args.replaces)!.uploadStatus = 'replaced';
    delete w.package;
    try { await store.save(nextRevision(w),revision,tool); }
    catch (error) { await store.discard(w,d).catch(()=>{}); throw error; }
    return w;
  }
  if (tool === 'match_document_to_requirement') {
    const args = documentToolSchemas.match_document_to_requirement.parse(input);
    const file=w.documents.find(d=>d.id===args.documentId&&d.uploadStatus==='uploaded');
    if(!file)throw new AgentError('DOCUMENT_ACCESS_DENIED','This file is unavailable.');
    await store.assertClean(w,file);
    confirmMatch(w,args.documentId,args.requirementId);
  } else if (tool === 'remove_document') {
    const args = documentToolSchemas.remove_document.parse(input);
    const d = w.documents.find(d => d.id === args.documentId);
    if (!d) throw new AgentError('DOCUMENT_ACCESS_DENIED','This document is unavailable.');
    d.uploadStatus = 'removed'; delete w.package;
    await store.save(nextRevision(w),revision,tool);
    await store.discard(w,d); return w;
  } else if (tool === 'prepare_document_package') {
    for(const file of w.documents.filter(d=>d.uploadStatus==='uploaded'))await store.assertClean(w,file);
    preparePackage(w,documentToolSchemas.prepare_document_package.parse(input).revision);
  } else if (tool === 'add_document_requirement') {
    const args = documentToolSchemas.add_document_requirement.parse(input);
    if (w.requirements.length >= 30) throw new AgentError('DOCUMENT_LIMIT','The checklist has reached its requirement limit.');
    w.requirements.push(documentRequirementSchema.parse({id:randomUUID(),label:args.label,required:args.required,status:args.required?'required':'optional',
      hospitalId:w.hospitalId,serviceLabel:w.serviceLabel,source:{kind:'user',id:ownerId,label:'Explicitly supplied and confirmed by you'}}));
    w.requirementLookup='documented'; delete w.package;
  }
  await store.save(nextRevision(w),revision,tool); return w;
}
