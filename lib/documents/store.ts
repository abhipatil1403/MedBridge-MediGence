import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgentError } from '@/lib/agents/errors';
import type { Database, Json } from '@/types/database';
import { DOCUMENT_BUCKET, documentRequirementSchema, documentWorkspaceSchema, startDocumentsSchema, type DocumentRequirement, type DocumentWorkspace, type UploadedDocument } from './schemas';
import { documentPath } from './coordination';
import { researchDocumentRequirements } from './research';

export interface DocumentStore {
  load(id: string, ownerId: string): Promise<DocumentWorkspace>;
  save(workspace: DocumentWorkspace, expectedRevision: number, action: string): Promise<void>;
  put(w: DocumentWorkspace, d: UploadedDocument, bytes: Uint8Array): Promise<void>;
  discard(w: DocumentWorkspace, d: UploadedDocument): Promise<void>;
}
export class SupabaseDocumentStore implements DocumentStore {
  constructor(private admin: SupabaseClient<Database>, private user: SupabaseClient<Database>) {}
  async load(id: string, ownerId: string) {
    const { data, error } = await this.user.from('document_workspaces').select('data').eq('id',id).eq('owner_id',ownerId).maybeSingle();
    if (error || !data) throw new AgentError('DOCUMENT_ACCESS_DENIED','This document workspace is unavailable to your account.');
    const w = documentWorkspaceSchema.parse(data.data);
    if (w.ownerId !== ownerId) throw new AgentError('DOCUMENT_ACCESS_DENIED','This document workspace is unavailable.');
    return w;
  }
  async byConversation(conversationId: string, ownerId: string) {
    const { data, error } = await this.user.from('document_workspaces').select('data').eq('conversation_id',conversationId).eq('owner_id',ownerId).maybeSingle();
    if (error) throw new AgentError('DOCUMENT_CONFIGURATION','Document coordination needs its database migration.');
    return data ? documentWorkspaceSchema.parse(data.data) : undefined;
  }
  async start(ownerId: string, conversationId: string, raw: unknown) {
    const input = startDocumentsSchema.parse(raw);
    const existing = await this.byConversation(conversationId,ownerId);
    if (existing) {
      if (existing.hospitalId !== input.hospitalId || existing.serviceLabel !== input.serviceLabel || existing.serviceId !== (input.serviceId ?? null))
        throw new AgentError('DOCUMENT_TARGET_LOCKED','Start a new conversation to organize documents for another hospital/service.');
      return existing;
    }
    const { data: hospital, error } = await this.user.from('hospitals').select('id,name').eq('id',input.hospitalId).eq('publication_status','published').maybeSingle();
    if (error || !hospital) throw new AgentError('DOCUMENT_TARGET_INVALID','Select a published hospital.');
    if (input.serviceId) {
      const service = await this.user.from('healthcare_services').select('id,name').eq('id',input.serviceId).eq('status','published').maybeSingle();
      if (!service.data || service.error || service.data.name !== input.serviceLabel) throw new AgentError('DOCUMENT_TARGET_INVALID','Select a published service.');
    }
    const result = await this.user.from('document_checklists').select('*').eq('hospital_id',hospital.id).eq('published',true);
    if (result.error) throw new AgentError('DOCUMENT_CONFIGURATION','Document requirements are temporarily unavailable.');
    const requirements: DocumentRequirement[] = [];
    for (const row of result.data ?? []) {
      if (row.service_id && row.service_id !== input.serviceId || row.service_label && row.service_label !== input.serviceLabel) continue;
      const items = z.array(z.object({ label:z.string().min(1).max(180), description:z.string().max(400).optional(), required:z.boolean(), status:z.enum(['required','optional','unknown','unavailable']) }).strict()).min(1).max(30).safeParse(row.requirements);
      if (!items.success) continue; // Unsupported provider config is not turned into a checklist.
      for (const item of items.data) requirements.push(documentRequirementSchema.parse({ ...item,id:randomUUID(),hospitalId:hospital.id,serviceLabel:input.serviceLabel,
        source:{kind:row.source_kind,id:row.id,label:row.source_label,reference:row.source_reference ?? undefined} }));
    }
    if (!requirements.length) requirements.push(...await researchDocumentRequirements(hospital.id,hospital.name,input.serviceLabel));
    const now = new Date().toISOString();
    const w = documentWorkspaceSchema.parse({id:randomUUID(),ownerId,conversationId,hospitalId:hospital.id,hospitalName:hospital.name,
      serviceId:input.serviceId ?? null,serviceLabel:input.serviceLabel,revision:0,requirements,documents:[],requirementLookup:requirements.length?'documented':'unavailable',createdAt:now,updatedAt:now});
    await this.save(w,-1,'selected_hospital_service'); return w;
  }
  async save(w: DocumentWorkspace, expectedRevision: number, action: string) {
    const valid = documentWorkspaceSchema.parse(w);
    const { error } = await this.admin.rpc('save_document_workspace',{p_workspace:JSON.parse(JSON.stringify(valid)) as Json,p_expected_revision:expectedRevision,p_action:action});
    if (error) throw new AgentError('DOCUMENT_SAVE_CONFLICT','The document workspace changed or could not be saved. Refresh and retry; your existing files are preserved.');
  }
  async put(w: DocumentWorkspace,d: UploadedDocument,bytes: Uint8Array) {
    const result = await this.admin.storage.from(DOCUMENT_BUCKET).upload(documentPath(w.id,d),bytes,{contentType:d.mimeType,upsert:false,cacheControl:'0'});
    if (result.error) throw new AgentError('DOCUMENT_UPLOAD_FAILED','Upload failed. Your existing documents are preserved. Retry the selected file.');
  }
  async discard(w: DocumentWorkspace,d: UploadedDocument) {
    const result = await this.admin.storage.from(DOCUMENT_BUCKET).remove([documentPath(w.id,d)]);
    if (result.error) throw new AgentError('DOCUMENT_STORAGE_FAILED','The file could not be removed. Retry removal; it is no longer included in the package.');
  }
  async download(w: DocumentWorkspace,documentId: string) {
    const d = w.documents.find(d => d.id === documentId && d.uploadStatus === 'uploaded');
    if (!d) throw new AgentError('DOCUMENT_ACCESS_DENIED','This file is unavailable.');
    // Authenticated proxy avoids exposing storage paths or signed bearer links in UI/logs.
    const result = await this.user.storage.from(DOCUMENT_BUCKET).download(documentPath(w.id,d));
    if (result.error || !result.data) throw new AgentError('DOCUMENT_ACCESS_DENIED','This file is unavailable to your account.');
    return {document:d,bytes:await result.data.arrayBuffer()};
  }
}
