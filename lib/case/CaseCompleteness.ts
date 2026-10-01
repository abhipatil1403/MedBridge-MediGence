import type { PatientCase } from './CaseTypes';
import type { Requirement } from '@/lib/requirements/RequirementTypes';

export function caseCompleteness(draft: PatientCase, requirements: Requirement[] = [], hospitalGoal = false): PatientCase['missingInformation'] {
  const missing: PatientCase['missingInformation'] = [];
  const add = (key: string, label: string, category: PatientCase['missingInformation'][number]['category']) => missing.push({ key, label, category });
  if (hospitalGoal) {
    if (!requirements.some((r) => r.type === 'procedure' && r.matchType === 'exact')) add('procedure', 'The procedure you want to search for', 'required_for_requested_action');
    if (!requirements.some((r) => r.type === 'location')) add('destination', 'Your preferred city or country', 'required_for_requested_action');
  }
  if (!draft.reportedDiagnosis.length) add('diagnosis', 'Existing diagnosis, if available', 'useful_for_coordination');
  if (!draft.documents.length) add('reports', 'Report details or document references, if available', 'useful_for_coordination');
  if (!draft.previousTreatments.length) add('previous_treatment', 'Previous treatment, if relevant', 'useful_for_coordination');
  if (draft.medications.some((m) => /painkillers?|pain (?:medication|medicine)/i.test(m.value) || !m.dose)) add('medication_details', 'Medication names and doses, if available', 'useful_for_coordination');
  if (!draft.medicalHistory.length) add('history', 'Relevant medical history, if you wish to share it', 'useful_for_coordination');
  if (!draft.allergies.length) add('allergies', 'Allergies have not been provided', 'unknown');
  if (!requirements.some((r) => r.type === 'budget')) add('budget', 'Budget, if you have one', 'optional');
  add('preferences', 'Additional coordination preferences', 'optional');
  return missing;
}
