import { caseFields, caseSummarySchema } from './CaseSchema';
import type { CaseField, PatientCase, CaseSummary } from './CaseTypes';

export const caseLabels: Record<CaseField, string> = { concerns: 'Main concern', symptoms: 'Symptoms', reportedDiagnosis: 'Reported diagnosis',
  proceduresDiscussed: 'Procedure discussed', investigations: 'Investigations', medications: 'Current medication', allergies: 'Allergies',
  medicalHistory: 'Medical history', previousTreatments: 'Previous treatment', timeline: 'Timeline', requestedGoal: 'Requested next step' };
export function summarizeCase(draft: PatientCase): CaseSummary {
  return caseSummarySchema.parse({ sections: caseFields.filter((f) => draft[f].length).map((field) => ({ label: caseLabels[field],
    statements: draft[field].map((item) => ({ itemId: item.id, sourceIds: [...new Set(item.sources.map((s) => s.messageSourceId))],
      text: item.status === 'conflicting' ? `${[...new Set(item.versions.filter((v) => !v.superseded).map((v) => `${v.value}${v.dose ? `; dose: ${v.dose}` : ''}${v.frequency ? `; frequency: ${v.frequency}` : ''}`))].join(' / ')} — conflicting; please clarify`
        : `${item.value}${field === 'medications' ? `; dose: ${item.dose ?? 'unknown'}; frequency: ${item.frequency ?? 'unknown'}` : ''} — ${item.status.replaceAll('_', ' ')}`,
    })) })), unknownFields: caseFields.filter((f) => !draft[f].length).map((f) => caseLabels[f]), missingInformation: draft.missingInformation });
}

/** Future briefing contract only. This never produces a clinical conclusion or submits a record. */
export function prepareCaseBriefing(draft: PatientCase, purpose: 'second_opinion' | 'consultation') {
  return { caseId: draft.id, revision: draft.revision, purpose, summary: summarizeCase(draft),
    documents: draft.documents, clinicianReviewCompleted: false as const, submittedToProvider: false as const };
}
