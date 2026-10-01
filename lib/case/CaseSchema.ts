import { z } from 'zod';
import { requirementsSchema } from '@/lib/requirements/RequirementTypes';

// Catalog provenance describes published records. Intake evidence describes a user's
// private message; it must never acquire catalog or clinician verification labels.
export const caseSourceSchema = z.object({ kind: z.literal('user_message'), conversationId: z.uuid(),
  messageSourceId: z.uuid(), runId: z.uuid(), quote: z.string().min(1).max(2000),
  start: z.number().int().nonnegative(), end: z.number().int().positive(), recordedAt: z.iso.datetime(),
}).strict().refine((s) => s.end - s.start === s.quote.length, 'Evidence offsets must match the quoted text');
export const caseStatusSchema = z.enum(['user_reported', 'user_confirmed', 'document_derived', 'clinician_confirmed', 'unknown', 'conflicting']);
const versionSchema = z.object({ value: z.string().min(1).max(600), status: caseStatusSchema,
  source: caseSourceSchema, superseded: z.boolean(), dose: z.string().max(100).optional(), frequency: z.string().max(100).optional() }).strict();
export const caseItemSchema = z.object({ id: z.uuid(), key: z.string().min(1).max(200), value: z.string().min(1).max(600),
  status: caseStatusSchema, sources: z.array(caseSourceSchema).min(1).max(100),
  versions: z.array(versionSchema).min(1).max(100), dose: z.string().max(100).optional(), frequency: z.string().max(100).optional(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict().superRefine((item, ctx) => {
  if (['clinician_confirmed', 'document_derived'].includes(item.status) || item.versions.some((v) => ['clinician_confirmed', 'document_derived'].includes(v.status)))
    ctx.addIssue({ code: 'custom', message: 'User testimony cannot establish document or clinician verification' });
  const current = item.versions.filter((v) => !v.superseded);
  const distinct = new Set(current.map((v) => JSON.stringify([v.value, v.dose, v.frequency]))).size;
  if (!current.length || !current.some((v) => v.value === item.value) || (item.status === 'conflicting' ? distinct < 2 : distinct !== 1))
    ctx.addIssue({ code: 'custom', message: 'Current values must agree with the audit trail or explicitly conflict' });
});
export const caseDocumentReferenceSchema = z.object({ documentId: z.uuid(), documentType: z.string().max(100).optional(),
  title: z.string().max(200).optional(), uploadedAt: z.iso.datetime().optional(), source: z.literal('user_upload'),
  status: z.literal('uploaded_not_processed'),
}).strict();
export const missingCaseInformationSchema = z.object({ key: z.string(), label: z.string().max(200),
  category: z.enum(['required_for_requested_action', 'useful_for_coordination', 'optional', 'unknown']) }).strict();
export const caseFields = ['concerns', 'symptoms', 'reportedDiagnosis', 'proceduresDiscussed', 'investigations', 'medications', 'allergies', 'medicalHistory', 'previousTreatments', 'timeline', 'requestedGoal'] as const;
const items = () => z.array(caseItemSchema).max(100).default([]);
export const patientCaseSchema = z.object({ id: z.uuid(), conversationId: z.uuid(), revision: z.number().int().positive(),
  concerns: items(), symptoms: items(), reportedDiagnosis: items(), proceduresDiscussed: items(), investigations: items(), medications: items(),
  allergies: items(), medicalHistory: items(), previousTreatments: items(), timeline: items(), requestedGoal: items(),
  documents: z.array(caseDocumentReferenceSchema).max(100).default([]), missingInformation: z.array(missingCaseInformationSchema).max(20).default([]),
  provenance: z.object({ kind: z.literal('user_supplied'), clinicallyVerified: z.literal(false) }).strict(),
  reviewPresentedRevision: z.number().int().positive().optional(), confirmedRevision: z.number().int().positive().optional(),
  pendingCoordinationRequest: z.string().max(2000).optional(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict().refine((c) => caseFields.every((field) => c[field].every((i) => i.sources.every((s) => s.conversationId === c.conversationId))), 'All case evidence must belong to this conversation');
export const caseSummarySchema = z.object({ focus: z.enum(['summary', 'missing_information']).default('summary'), sections: z.array(z.object({ label: z.string(),
  statements: z.array(z.object({ text: z.string().max(900), itemId: z.uuid(), sourceIds: z.array(z.uuid()).min(1) }).strict()).max(100) }).strict()).max(11),
  unknownFields: z.array(z.string()).max(11), missingInformation: z.array(missingCaseInformationSchema).max(20),
}).strict();
export const caseHandoffSchema = z.object({ caseId: z.uuid(), revision: z.number().int().positive(),
  destination: z.enum(['hospital_matching', 'second_opinion', 'consultation']), approvedByUser: z.literal(true),
  approvalSource: caseSourceSchema, coordinationRequirements: requirementsSchema,
  reportedFacts: patientCaseSchema, clinicallyVerified: z.literal(false), submittedToProvider: z.literal(false),
}).strict();
