import { createHash, randomUUID } from 'node:crypto';
import { AgentError } from '@/lib/agents/errors';
import { safeText } from '@/lib/agents/execution-state';
import { documentWorkspaceSchema, MAX_DOCUMENT_BYTES, type DocumentRequirement, type DocumentWorkspace, type UploadedDocument } from './schemas';

export function validateUpload(filename: string, mime: string, bytes: Uint8Array) {
  if (!filename.trim() || filename.length > 180 || /[\\/\x00-\x1f\x7f]/.test(filename) || safeText(filename)!==filename) throw new AgentError('DOCUMENT_INVALID_FILE', 'Use a filename without path separators, credentials or control characters.');
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new AgentError('DOCUMENT_SIZE', 'Upload a non-empty file up to 3 MB.');
  const pdf = mime === 'application/pdf' && /\.pdf$/i.test(filename) && Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-';
  const png = mime === 'image/png' && /\.png$/i.test(filename) && Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = mime === 'image/jpeg' && /\.jpe?g$/i.test(filename) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!pdf && !png && !jpg) throw new AgentError('DOCUMENT_TYPE', 'Use a PDF, JPG/JPEG or PNG with a matching file type.');
  return createHash('sha256').update(bytes).digest('hex');
}
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
  .map(w=>['mri','ct','scan','imaging'].includes(w)?'imaging':['doctor','visit','consultation'].includes(w)?'consultation':w)
  .filter(w => w.length > 2 && !['report','document','previous','medical','file','pdf','jpg','jpeg','png'].includes(w));
export function suggestRequirements(filename: string, requirements: DocumentRequirement[]) {
  const terms = words(filename);
  // Administrative filename hints only. They never count as an available document.
  return requirements.filter(r => ['required','optional'].includes(r.status) && words(r.label).some(w => terms.includes(w))).map(r => r.id);
}
export function checklist(w: DocumentWorkspace) {
  return w.requirements.map(requirement => {
    const files = w.documents.filter(d => d.uploadStatus === 'uploaded' && d.requirementId === requirement.id && d.matchStatus === 'matched');
    const suggested = w.documents.filter(d => d.uploadStatus === 'uploaded' && d.suggestedRequirementIds.includes(requirement.id) && d.matchStatus !== 'matched');
    return { requirement, files, status: files.length ? 'available' : suggested.length ? 'needs_review' : 'missing' };
  });
}
export function missingRequired(w: DocumentWorkspace) { return checklist(w).filter(r => r.requirement.required && r.status !== 'available').length; }
export function confirmMatch(w: DocumentWorkspace, documentId: string, requirementId: string) {
  const d = w.documents.find(d => d.id === documentId && d.uploadStatus === 'uploaded');
  const r = w.requirements.find(r => r.id === requirementId && ['required','optional'].includes(r.status));
  if (!d || !r) throw new AgentError('DOCUMENT_MATCH_INVALID', 'Choose an available file and a requested document.');
  d.requirementId = r.id; d.matchStatus = 'matched'; d.confirmedAt = new Date().toISOString();
  delete w.package;
}
export function preparePackage(w: DocumentWorkspace, revision: number) {
  if (revision !== w.revision) throw new AgentError('DOCUMENT_STALE', 'The documents changed. Review the current package before confirming.');
  if (!w.requirements.some(r => r.status === 'required' || r.status === 'optional')) throw new AgentError('DOCUMENT_REQUIREMENTS_UNAVAILABLE', 'Document requirements are not available for this hospital/service.');
  if (w.requirements.some(r => r.status === 'unknown' || r.status === 'unavailable')) throw new AgentError('DOCUMENT_REQUIREMENTS_UNAVAILABLE', 'Clarify uncertain document requirements before preparing a package.');
  if (missingRequired(w)) throw new AgentError('DOCUMENT_MISSING', `${missingRequired(w)} required document${missingRequired(w) === 1 ? '' : 's'} missing.`);
  const manifest = checklist(w).flatMap(r => r.files.map(document => ({ requirement: structuredClone(r.requirement), document: structuredClone(document) })));
  if (!manifest.length) throw new AgentError('DOCUMENT_EMPTY', 'Confirm at least one uploaded document before preparing a package.');
  w.package = { id: randomUUID(), revision: w.revision + 1, preparedAt: new Date().toISOString(), confirmedBy: w.ownerId,
    status: 'ready_to_share', submittedToProvider: false, manifest };
}
export function newUpload(w: DocumentWorkspace, file: { filename: string; mimeType: UploadedDocument['mimeType']; bytes: Uint8Array }, replaces?: string): UploadedDocument {
  if (w.documents.length >= 100) throw new AgentError('DOCUMENT_LIMIT', 'This document workspace has reached its file history limit.');
  const checksum = validateUpload(file.filename, file.mimeType, file.bytes);
  const previous = replaces ? w.documents.find(d => d.id === replaces && d.uploadStatus === 'uploaded') : undefined;
  if (replaces && !previous) throw new AgentError('DOCUMENT_REPLACEMENT_INVALID', 'Select an active document to replace.');
  const suggestedRequirementIds = suggestRequirements(file.filename, w.requirements);
  if (previous?.requirementId && !suggestedRequirementIds.includes(previous.requirementId)) suggestedRequirementIds.push(previous.requirementId);
  return { id: randomUUID(), ownerId: w.ownerId, filename: file.filename, mimeType: file.mimeType, size: file.bytes.length,
    checksum, uploadedAt: new Date().toISOString(), uploadStatus: 'uploaded', suggestedRequirementIds,
    matchStatus: suggestedRequirementIds.length ? 'needs_confirmation' : 'unmatched',
    duplicateOf: w.documents.find(d => d.checksum === checksum && d.uploadStatus === 'uploaded')?.id,
    replaces, sharingStatus: 'not_shared',securityStatus:'pending_scan' };
}
export function nextRevision(w: DocumentWorkspace) { w.revision++; w.updatedAt = new Date().toISOString(); return documentWorkspaceSchema.parse(w); }
export function documentPath(workspaceId: string, d: UploadedDocument) { return `${d.ownerId}/${workspaceId}/${d.id}.${d.mimeType === 'application/pdf' ? 'pdf' : d.mimeType === 'image/png' ? 'png' : 'jpg'}`; }
