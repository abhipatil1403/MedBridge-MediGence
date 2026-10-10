import { z } from 'zod';
import { researchSourceSchema } from '@/lib/research/schemas';

export const DOCUMENT_BUCKET = 'care-documents';
// Keep uploads below Vercel's request-body limit, including multipart overhead.
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const documentMimeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
const text = z.string().trim().min(1).max(180);
export const documentSourceSchema = z.object({
  kind: z.enum(['hospital', 'provider_configured', 'external', 'user']), id: text, label: text,
  reference: z.string().max(500).optional(), retrievedAt: z.iso.datetime().optional(),
}).strict().refine(s => s.kind !== 'external' || Boolean(s.reference?.startsWith('https://') && s.retrievedAt), 'External requirements need a source URL and retrieval time');
export const documentRequirementSchema = z.object({
  id: z.uuid(), label: text, description: z.string().max(400).optional(), source: documentSourceSchema,
  hospitalId: z.uuid(), serviceLabel: text, required: z.boolean(), status: z.enum(['required', 'optional', 'unavailable', 'unknown']),
}).strict().refine(r => r.required === (r.status === 'required'), 'Required status must agree with required flag');
export const uploadedDocumentSchema = z.object({
  id: z.uuid(), ownerId: z.uuid(), filename: text, mimeType: documentMimeSchema, size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  checksum: z.string().regex(/^[a-f0-9]{64}$/), uploadedAt: z.iso.datetime(), uploadStatus: z.enum(['uploaded', 'removed', 'replaced']),
  requirementId: z.uuid().optional(), suggestedRequirementIds: z.array(z.uuid()).max(30),
  matchStatus: z.enum(['matched', 'needs_confirmation', 'unmatched']), confirmedAt: z.iso.datetime().optional(),
  duplicateOf: z.uuid().optional(), replaces: z.uuid().optional(), sharingStatus: z.literal('not_shared'),
  securityStatus:z.enum(['pending_scan','scanning','clean','quarantined','scan_failed','not_scanned']).optional(),
}).strict().refine(d => d.matchStatus !== 'matched' || Boolean(d.requirementId && d.confirmedAt), 'A match requires user confirmation');
export const documentPackageSchema = z.object({
  id: z.uuid(), revision: z.number().int().nonnegative(), preparedAt: z.iso.datetime(), confirmedBy: z.uuid(),
  status: z.literal('ready_to_share'), submittedToProvider: z.literal(false),
  manifest: z.array(z.object({ requirement: documentRequirementSchema, document: uploadedDocumentSchema }).strict()).min(1).max(100),
}).strict();
export const documentWorkspaceSchema = z.object({
  providerEvidence:z.array(z.object({field:z.enum(['services','treatments']),value:z.string().max(240),snippet:z.string().max(240),source:researchSourceSchema}).strict()).max(12).optional(),
  id: z.uuid(), ownerId: z.uuid(), conversationId: z.uuid(), hospitalId: z.uuid(), hospitalName: text,
  serviceId: z.uuid().nullable(), serviceLabel: text, revision: z.number().int().nonnegative(),
  requirements: z.array(documentRequirementSchema).max(30), documents: z.array(uploadedDocumentSchema).max(100),
  package: documentPackageSchema.optional(), requirementLookup: z.enum(['documented', 'unavailable']),
  researchNote: z.string().max(400).optional(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict().superRefine((w, ctx) => {
  if(w.providerEvidence?.some(e=>e.source.entityId!==w.hospitalId||!e.snippet.includes(e.value)))ctx.addIssue({code:'custom',message:'Provider evidence must support this hospital and exact service statement'});
  if (new Set(w.requirements.map(r => r.id)).size !== w.requirements.length || new Set(w.documents.map(d => d.id)).size !== w.documents.length)
    ctx.addIssue({ code: 'custom', message: 'Document identities must be unique' });
  for (const r of w.requirements) if (r.hospitalId !== w.hospitalId || r.serviceLabel !== w.serviceLabel)
    ctx.addIssue({ code: 'custom', message: 'Requirement target mismatch' });
  for (const d of w.documents) if (d.ownerId !== w.ownerId || d.requirementId && !w.requirements.some(r => r.id === d.requirementId)
    || d.suggestedRequirementIds.some(id => !w.requirements.some(r => r.id === id)))
    ctx.addIssue({ code: 'custom', message: 'Document owner or requirement mismatch' });
  if (w.package && (w.package.revision !== w.revision || w.package.confirmedBy !== w.ownerId
    || new Set(w.package.manifest.map(e=>e.document.id)).size !== w.package.manifest.length
    || w.requirements.some(r=>r.status==='unknown'||r.status==='unavailable'||r.required&&!w.package!.manifest.some(e=>e.requirement.id===r.id))
    || w.package.manifest.some(e => !w.documents.some(d => d.id === e.document.id && d.uploadStatus === 'uploaded' && d.matchStatus === 'matched'
      && d.requirementId===e.requirement.id && JSON.stringify(d)===JSON.stringify(e.document))
      || !w.requirements.some(r => r.id === e.requirement.id && JSON.stringify(r)===JSON.stringify(e.requirement))))) ctx.addIssue({ code: 'custom', message: 'Package is not a current confirmed snapshot' });
});
export type DocumentRequirement = z.infer<typeof documentRequirementSchema>;
export type UploadedDocument = z.infer<typeof uploadedDocumentSchema>;
export type DocumentWorkspace = z.infer<typeof documentWorkspaceSchema>;
export const documentToolSchemas = {
  get_document_requirements: z.object({ workspaceId: z.uuid() }).strict(),
  get_document_package: z.object({ workspaceId: z.uuid() }).strict(),
  upload_document: z.object({ workspaceId: z.uuid(), replaces: z.uuid().optional() }).strict(),
  match_document_to_requirement: z.object({ workspaceId: z.uuid(), documentId: z.uuid(), requirementId: z.uuid(), confirmed: z.literal(true) }).strict(),
  remove_document: z.object({ workspaceId: z.uuid(), documentId: z.uuid() }).strict(),
  prepare_document_package: z.object({ workspaceId: z.uuid(), revision: z.number().int().nonnegative(), confirmed: z.literal(true) }).strict(),
  add_document_requirement: z.object({ workspaceId: z.uuid(), label: text, required: z.boolean(), confirmed: z.literal(true) }).strict(),
};
export type DocumentTool = keyof typeof documentToolSchemas;
export const startDocumentsSchema = z.object({ hospitalId: z.uuid(), serviceId: z.uuid().optional(), serviceLabel: text }).strict();
