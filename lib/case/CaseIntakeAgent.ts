import { randomUUID } from 'node:crypto';
import { caseFields, patientCaseSchema, caseSourceSchema, caseDocumentReferenceSchema } from './CaseSchema';
import type { PatientCase, CaseItem, CaseSource } from './CaseTypes';
import { extractCase } from './CaseExtractor';
import { caseCompleteness } from './CaseCompleteness';
import { summarizeCase } from './CaseSummary';
import type { CarePlan } from '@/lib/agents/schemas';
import type { RuntimeContext } from '@/lib/agents/runtime';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { upsertTask } from '@/lib/agents/treatment-planning/tasks';
import { ReferenceDetector } from '@/lib/conversation/ReferenceDetector';
import { ReferenceResolver } from '@/lib/conversation/ReferenceResolver';
import { planReferenceContext } from '@/lib/conversation/context';
import type { Requirement } from '@/lib/requirements/RequirementTypes';

export function caseIntakeIntent(content: string, previous?: PatientCase) {
  return extractCase(content, previous).length > 0 || ReferenceDetector.detect(content)?.entityType === 'case'
    || Boolean(previous && /^(?:confirm(?: my case)?|continue(?: with (?:my|this) case)?|edit (?:my|this) case|add (?:case )?information)[.!]?$/i.test(content.trim()));
}
export function caseSource(content: string, conversationId: string, runId: string, messageSourceId: string, now: string, start = 0, end = content.length): CaseSource {
  return caseSourceSchema.parse({ kind: 'user_message', conversationId, runId, messageSourceId, quote: content.slice(start, end), start, end, recordedAt: now });
}
/** Only call with records returned by consent-checked CaseAccess. Never take IDs
 * from chat or turn a metadata record into processed document evidence. */
export function caseDocumentReferences(metadata: Record<string, unknown>[]): PatientCase['documents'] {
  return metadata.map((record) => caseDocumentReferenceSchema.parse({ documentId: record.id,
    documentType: record.type, title: record.title, uploadedAt: typeof record.createdAt === 'string' ? new Date(record.createdAt).toISOString() : undefined,
    source: 'user_upload', status: 'uploaded_not_processed' }));
}
export function mergeCase(content: string, source: CaseSource, previous?: PatientCase): PatientCase {
  const draft: PatientCase = previous ? structuredClone(previous) : patientCaseSchema.parse({ id: randomUUID(), conversationId: source.conversationId,
    revision: 1, provenance: { kind: 'user_supplied', clinicallyVerified: false }, createdAt: source.recordedAt, updatedAt: source.recordedAt });
  let changed = false;
  const correction = /\b(?:actually|correction|correct|update|I meant|not .* but)\b/i.test(content);
  for (const found of extractCase(content, previous)) {
    const evidence = caseSource(content, source.conversationId, source.runId, source.messageSourceId, source.recordedAt, found.start, found.end);
    let item = draft[found.field].find((i) => i.key === found.key);
    // Allergy "none" versus a named allergy is a real unresolved contradiction.
    const allergyConflict = found.field === 'allergies' && draft.allergies.find((i) => (i.value === 'none reported') !== (found.value === 'none reported'));
    item ??= allergyConflict || undefined;
    if (!item) {
      const next: CaseItem = { id: randomUUID(), key: found.key, value: found.value, status: 'user_reported', sources: [evidence],
        versions: [{ value: found.value, status: 'user_reported', source: evidence, superseded: false, dose: found.dose, frequency: found.frequency }],
        dose: found.dose, frequency: found.frequency, createdAt: source.recordedAt, updatedAt: source.recordedAt };
      draft[found.field].push(next);
    } else {
      if (item.sources.length >= 100 || item.versions.length >= 100) throw new Error('Case evidence limit reached');
      item.sources.push(evidence);
      const dose = found.dose ?? item.dose, frequency = found.frequency ?? item.frequency;
      if (found.field === 'investigations' && item.status !== 'conflicting' && found.value.startsWith(`${item.value} — user-reported finding:`)) {
        item.versions.forEach((v) => { v.superseded = true; }); item.value = found.value;
      }
      if (item.value === found.value && item.status !== 'conflicting' && (!item.dose || item.dose === dose) && (!item.frequency || item.frequency === frequency)
        && (item.dose !== dose || item.frequency !== frequency)) {
        item.versions.forEach((v) => { v.superseded = true; }); item.dose = dose; item.frequency = frequency;
      }
      if (item.value !== found.value || item.status === 'conflicting' || item.dose !== dose || item.frequency !== frequency) {
        if (correction) {
          item.versions.forEach((v) => { v.superseded = true; });
          item.value = found.value; item.status = 'user_reported';
          item.dose = dose; item.frequency = frequency;
        } else item.status = 'conflicting';
      } else item.status = 'user_reported';
      item.versions.push({ value: found.value, status: 'user_reported', source: evidence, superseded: false, dose, frequency });
      item.updatedAt = source.recordedAt;
    }
    changed = true;
  }
  if (changed && previous) draft.revision++;
  if (changed) { draft.confirmedRevision = undefined; draft.updatedAt = source.recordedAt; }
  if (/^confirm(?: my case)?[.!]?$/i.test(content.trim())) {
    for (const field of caseFields) for (const item of draft[field]) if (item.status !== 'conflicting') {
      item.status = 'user_confirmed'; item.sources.push(source); item.updatedAt = source.recordedAt;
      item.versions.push({ value: item.value, status: 'user_confirmed', source, superseded: false, dose: item.dose, frequency: item.frequency });
    }
    if (!caseFields.some((f) => draft[f].some((i) => i.status === 'conflicting'))) draft.confirmedRevision = draft.revision;
  }
  return patientCaseSchema.parse(draft);
}

/** Runs as a specialist workflow inside the existing treatment coordination runtime.
 * Uses the same run/message/lease/RLS infrastructure; no new database agent enum. */
export async function prepareCaseIntake(input: { content: string; conversationId: string; userId: string; active?: CarePlan;
  store: PlanningStore; lease: string; pendingCoordinationRequest?: string; documentMetadata?: Record<string, unknown>[]; requirements?: Requirement[] }): Promise<NonNullable<RuntimeContext['execution']>> {
  const now = new Date().toISOString(), messageSourceId = randomUUID();
  if (!input.active?.context.patientCase && !extractCase(input.content).length) return {
    plan: { agent: 'treatment_planning', understanding: 'You are asking about a case draft.', steps: [], missingInformation: null },
    messageSourceId, synthesis: { summary: 'No case information has been recorded in this conversation.', nextSteps: ['Describe the information you would like to organize.'], question: null },
    diagnostics: { workflow: 'case_intake', modelAttempts: '0' },
    finalize: async (response) => ({ ...response, workflow: 'case_intake', plan: input.active,
      referenceResolution: ReferenceResolver.resolve({ conversationId: input.conversationId, userMessage: input.content }) }),
  };
  const plan: CarePlan = input.active ?? { id: randomUUID(), userId: input.userId, conversationId: input.conversationId,
    title: 'Your case draft', goal: 'Organize voluntarily supplied information for coordination', status: 'draft',
    context: { goalType: 'intake', requestedTargets: [] }, tasks: [], findings: [], createdAt: now, updatedAt: now };
  const task = upsertTask(plan.tasks, 'case_intake_review', { title: 'Review your reported case information',
    description: 'Information organization only. No diagnosis, clinical verification, or provider submission.', taskType: 'review', status: 'awaiting_user', requiresUserAction: true });
  if (input.requirements) plan.context.requirements = input.requirements;
  await input.store.save(plan, input.lease);
  return { plan: { agent: 'treatment_planning', understanding: 'I can organize the information you report into a case draft.', steps: [], missingInformation: null },
    carePlanId: plan.id, messageSourceId, diagnostics: { workflow: 'case_intake', modelAttempts: '0' },
    synthesis: { summary: 'Your reported information is ready to review.', nextSteps: ['Review the case draft and correct anything inaccurate.'], question: null },
    finalize: async (response) => {
      const source = caseSource(input.content, input.conversationId, response.runId, messageSourceId, now);
      const draft = mergeCase(input.content, source, plan.context.patientCase);
      if (input.documentMetadata) {
        const documents = caseDocumentReferences(input.documentMetadata);
        if (JSON.stringify(draft.documents) !== JSON.stringify(documents)) {
          draft.documents = documents; draft.revision++; draft.confirmedRevision = undefined; draft.updatedAt = now;
        }
      }
      draft.pendingCoordinationRequest = input.pendingCoordinationRequest ?? draft.pendingCoordinationRequest;
      draft.missingInformation = caseCompleteness(draft, plan.context.requirements, Boolean(draft.pendingCoordinationRequest));
      draft.reviewPresentedRevision = draft.revision;
      const conflict = caseFields.flatMap((f) => draft[f]).find((i) => i.status === 'conflicting');
      const edit = /^(?:edit|add)\b/i.test(input.content);
      const question = conflict ? `Please clarify the conflicting information for ${conflict.key}. Which value should I record?`
        : edit ? 'Tell me the information to add or correct, using the item name and the updated detail.'
          : /^continue\b/i.test(input.content.trim()) && !draft.pendingCoordinationRequest
            ? 'What would you like to coordinate next? For a hospital search, tell me the procedure and destination.'
          : /^update .*date[.!]?$/i.test(input.content.trim()) ? 'What date or relative time should I record for that investigation?'
            : draft.pendingCoordinationRequest && draft.missingInformation.some((i) => i.category === 'required_for_requested_action')
              ? `For that hospital search, please provide: ${draft.missingInformation.filter((i) => i.category === 'required_for_requested_action').map((i) => i.label).join('; ')}.` : null;
      task.runId = response.runId; task.status = draft.confirmedRevision === draft.revision ? 'completed' : 'awaiting_user'; task.updatedAt = now;
      plan.context.patientCase = patientCaseSchema.parse(draft); plan.updatedAt = now; plan.status = 'awaiting_user';
      plan.context.caseHandoff = undefined;
      await input.store.save(plan, input.lease);
      const query = ReferenceDetector.detect(input.content);
      const referenceResolution = query?.entityType === 'case' ? ReferenceResolver.resolve({ conversationId: input.conversationId,
        userMessage: input.content, query, currentContext: planReferenceContext(plan, 'case') }) : undefined;
      const missingFocus = /\bmissing\b/i.test(input.content);
      return { ...response, workflow: 'case_intake' as const, discovery: undefined, type: 'result', status: question ? 'awaiting_user_input' : 'completed',
        summary: missingFocus ? 'The missing details below are grouped by their purpose. Medical details can be supplied voluntarily; they do not block catalog discovery.'
          : 'This draft contains information you supplied. It is not clinically verified. Review and correct it before continuing with coordination.',
        patientCase: plan.context.patientCase, caseSummary: { ...summarizeCase(draft), focus: missingFocus ? 'missing_information' as const : 'summary' as const }, plan, question, referenceResolution,
        nextSteps: ['Confirm, edit, or add information. Continue when you are ready to choose a coordination step.'],
      };
    } };
}
