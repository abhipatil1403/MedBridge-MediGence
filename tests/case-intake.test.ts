import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { harness, snapshot, userId } from './fixtures/comparison-harness';
import { caseSource, mergeCase, caseDocumentReferences } from '@/lib/case/CaseIntakeAgent';
import { patientCaseSchema, caseFields } from '@/lib/case/CaseSchema';
import { caseCompleteness } from '@/lib/case/CaseCompleteness';
import { summarizeCase, prepareCaseBriefing } from '@/lib/case/CaseSummary';
import { ReferenceDetector } from '@/lib/conversation/ReferenceDetector';
import { ReferenceResolver } from '@/lib/conversation/ReferenceResolver';
import { RequirementExtractor } from '@/lib/requirements/RequirementExtractor';
import type { PatientCase } from '@/lib/case/CaseTypes';

const conversationId = randomUUID();
function merge(text: string, previous?: PatientCase) {
  return mergeCase(text, caseSource(text, conversationId, randomUUID(), randomUUID(), '2026-10-01T09:00:00.000Z'), previous);
}
describe('source grounded case intake', () => {
  it('Continue asks for the coordination goal when none was requested', async () => {
    const h = harness(), first = await h.send('I have knee pain.');
    const result = await h.send('Continue with this case', first.conversationId); expect(result.question).toContain('coordinate next'); expect(result.caseHandoff).toBeUndefined();
  });
  it('accepts an administrative clarification without turning the requested procedure into a medical fact', async () => {
    const h = harness(), first = await h.send('I have knee pain.');
    const question = await h.send('Use this case to find hospitals in Mumbai.', first.conversationId); expect(question.question).toContain('procedure');
    const answer = await h.send('Knee replacement', first.conversationId); expect(answer.question).toBeNull(); expect(answer.patientCase?.proceduresDiscussed).toEqual([]);
    const result = await h.send('Continue with this case', first.conversationId); expect(result.agent).toBe('hospital_matching'); expect(result.caseHandoff?.reportedFacts.proceduresDiscussed).toEqual([]);
  });
  it('copies actual document metadata only and never fabricates processed contents', () => {
    const id = randomUUID(), refs = caseDocumentReferences([{ id, title: 'Uploaded MRI', type: 'imaging', createdAt: '2026-10-01T09:00:00Z', contents: 'must not be copied', status: 'uploaded' }]);
    expect(refs).toEqual([{ documentId: id, title: 'Uploaded MRI', documentType: 'imaging', uploadedAt: '2026-10-01T09:00:00.000Z', source: 'user_upload', status: 'uploaded_not_processed' }]);
    expect(() => caseDocumentReferences([{ id: 'invented-id' }])).toThrow();
  });
  it('adds a reported investigation finding and preserves it through date corrections', () => {
    let c = merge('I had an MRI last month.'); c = merge('My MRI showed a ligament tear.', c);
    expect(c.investigations[0].status).toBe('user_reported'); c = merge('Actually, the MRI was two months ago.', c);
    expect(c.investigations[0].value).toContain('ligament tear'); expect(c.timeline[0].value).toContain('2 months ago');
  });
  it('keeps multiple investigations and decimal doses in separate source spans', () => {
    const c = merge("I had an MRI last month and I had a CT scan two months ago. I'm taking paracetamol 500.5 mg daily.");
    expect(c.investigations.map((i) => i.value)).toEqual(['MRI', 'CT scan']); expect(c.timeline).toHaveLength(2);
    expect(c.medications[0].dose).toBe('500.5 mg');
  });
  it('directly shows missing information when requested', async () => {
    const h = harness(), first = await h.send('I have knee pain.'); const result = await h.send('What information are you missing?', first.conversationId);
    expect(result.caseSummary?.focus).toBe('missing_information'); expect(result.caseSummary?.missingInformation.find((i) => i.key === 'diagnosis')?.category).toBe('useful_for_coordination');
  });
  it('does not manufacture an empty referenced case', async () => {
    const result = await harness().send('Show me my case summary.'); expect(result.patientCase).toBeUndefined(); expect(result.referenceResolution?.status).toBe('unresolved');
  });
  it('corrects an explicitly changed symptom description', () => {
    const c = merge('Actually, I have mild knee pain.', merge('I have severe knee pain.'));
    expect(c.symptoms).toHaveLength(1); expect(c.symptoms[0].value).toBe('mild knee pain'); expect(c.symptoms[0].versions[0].superseded).toBe(true);
  });
  it('fills unknown medication details and preserves conflicting known doses', () => {
    let c = merge("I'm taking paracetamol."); c = merge("I'm taking paracetamol 500 mg daily.", c);
    expect(c.medications[0]).toMatchObject({ status: 'user_reported', dose: '500 mg', frequency: 'daily' });
    c = merge("I'm taking paracetamol 1000 mg daily.", c); expect(c.medications[0].status).toBe('conflicting');
    c = merge("Actually, I'm taking paracetamol 500 mg daily.", c); expect(c.medications[0].status).toBe('user_reported');
  });
  it('clarifies allergy contradictions without choosing an arbitrary report', () => {
    const c = merge('I have no known allergies.', merge("I'm allergic to penicillin.")); expect(c.allergies[0].status).toBe('conflicting');
    expect(summarizeCase(c).sections[0].statements[0].text).toContain('penicillin / none reported');
  });
  it('asks only for a missing search destination and never infers a procedure from symptoms', async () => {
    const h = harness(), first = await h.send('I have knee pain.'); const next = await h.send('Use this case to find hospitals in Mumbai.', first.conversationId);
    expect(next.tasks).toEqual([]); expect(next.question).toContain('procedure'); expect(next.patientCase?.proceduresDiscussed).toEqual([]);
  });
  it('stores only a basic symptom without invented clinical detail', () => {
    const c = merge('I have knee pain.'); expect(c.symptoms[0]).toMatchObject({ value: 'knee pain', status: 'user_reported' });
    expect(c.reportedDiagnosis).toEqual([]); expect(c.proceduresDiscussed).toEqual([]); expect(c.investigations).toEqual([]);
    expect(c.symptoms[0].sources[0].quote).toBe('I have knee pain');
  });
  it('normalizes an explicitly stated duration without a calendar date', () => {
    const c = merge("I've had knee pain for eight months."); expect(c.timeline[0].value).toBe('Symptom duration: approximately 8 months');
    expect(c.timeline[0].sources[0].quote).toBe('eight months');
  });
  it('keeps a doctor discussion as a reported procedure only', () => {
    const c = merge('My doctor mentioned knee replacement.'); expect(c.proceduresDiscussed[0]).toMatchObject({ value: 'knee replacement', status: 'user_reported' });
    expect(c.reportedDiagnosis).toEqual([]); expect(c.provenance.clinicallyVerified).toBe(false);
  });
  it('preserves a relative MRI date', () => {
    const c = merge('I had an MRI last month.'); expect(c.investigations[0].value).toBe('MRI'); expect(c.timeline[0].value).toBe('MRI: approximately last month');
  });
  it('stores a named medication with unknown dose and frequency', () => {
    const c = merge("I'm taking paracetamol."); expect(c.medications[0].value).toBe('paracetamol');
    expect(c.medications[0].dose).toBeUndefined(); expect(summarizeCase(c).sections[0].statements[0].text).toContain('dose: unknown; frequency: unknown');
  });
  it('does not turn painkillers into a specific drug', () => { expect(merge("I'm taking painkillers.").medications[0].value).toBe('painkillers'); });
  it('records an explicit allergy', () => { expect(merge("I'm allergic to penicillin.").allergies[0]).toMatchObject({ value: 'penicillin', status: 'user_reported' }); });
  it('records explicitly reported absent allergies without inferring them by default', () => {
    expect(merge('I have no known allergies.').allergies[0].value).toBe('none reported'); expect(merge('I have knee pain.').allergies).toEqual([]);
  });
  it('normalizes my knee hurts conservatively without disease or procedure', () => {
    const c = merge('My knee hurts.'); expect(c.symptoms[0].value).toBe('knee pain'); expect(c.reportedDiagnosis).toEqual([]); expect(c.proceduresDiscussed).toEqual([]);
  });
  it('merges five messages, retains individual sources, and deduplicates', () => {
    let c = merge('I have knee pain.');
    for (const text of ['It has been going on for about eight months.', 'My doctor mentioned knee replacement.', 'I had an MRI last month.', "I'm taking painkillers.", 'I have knee pain.']) c = merge(text, c);
    expect(c.symptoms).toHaveLength(1); expect(c.symptoms[0].sources).toHaveLength(2); expect(c.timeline).toHaveLength(2);
    expect(c.medications).toHaveLength(1); expect(c.proceduresDiscussed).toHaveLength(1);
  });
  it('explicitly corrects the MRI date and preserves superseded evidence', () => {
    const c = merge('Actually, the MRI was two months ago, not last month.', merge('I had an MRI last month.'));
    expect(c.timeline[0].value).toBe('MRI: approximately 2 months ago'); expect(c.timeline[0].versions[0].superseded).toBe(true);
    expect(c.timeline[0].versions).toHaveLength(2); expect(c.timeline[0].sources).toHaveLength(2);
  });
  it('shows unresolved conflicting dates and resolves only an explicit correction', async () => {
    const h = harness(), first = await h.send('I had an MRI last month.');
    const conflict = await h.send('The MRI was three months ago.', first.conversationId);
    expect(conflict.patientCase?.timeline[0].status).toBe('conflicting'); expect(conflict.question).toContain('clarify');
    expect(conflict.caseSummary?.sections.find((s) => s.label === 'Timeline')?.statements[0].text).toContain('approximately 3 months ago');
    const resolved = await h.send('Actually, the MRI was two months ago.', first.conversationId); expect(resolved.patientCase?.timeline[0].status).toBe('user_reported');
  });
  it('evaluates completeness deterministically and does not require medical facts for search', () => {
    const c = merge('I have knee pain.');
    const required = caseCompleteness(c, [], true).filter((m) => m.category === 'required_for_requested_action'); expect(required.map((m) => m.key)).toEqual(['procedure', 'destination']);
    const requirements = RequirementExtractor.extract('Find knee replacement hospitals in Mumbai under $6000', snapshot);
    expect(caseCompleteness(c, requirements, true).filter((m) => m.category === 'required_for_requested_action')).toEqual([]);
    expect(caseCompleteness(c)).toEqual(caseCompleteness(c)); expect(JSON.stringify(caseCompleteness(c))).not.toContain('%');
  });
  it('maps every summary statement to actual stored evidence and message spans', () => {
    const c = merge("I have severe knee pain. My doctor mentioned knee replacement. I had an MRI last month and I'm taking painkillers.");
    const items = caseFields.flatMap((f) => c[f]);
    for (const section of summarizeCase(c).sections) for (const statement of section.statements) {
      const item = items.find((i) => i.id === statement.itemId)!; expect(item).toBeDefined();
      expect(statement.sourceIds.every((id) => item.sources.some((s) => s.messageSourceId === id))).toBe(true);
      for (const source of item.sources) expect(source.quote.length).toBe(source.end - source.start);
    }
  });
  it('reloads the saved case and continues without recent message reconstruction', async () => {
    const h = harness(), first = await h.send('I have severe knee pain.');
    const saved = await h.planningStore.load(first.conversationId, userId); expect(saved?.context.patientCase?.id).toBe(first.patientCase?.id);
    h.planningStore.messages.clear(); const next = await h.send('I had an MRI last month.', first.conversationId);
    expect(next.patientCase?.id).toBe(first.patientCase?.id); expect(next.patientCase?.symptoms).toHaveLength(1);
  });
  it('resolves case references through the existing detector and resolver', async () => {
    const h = harness(), first = await h.send('I have knee pain.');
    const query = ReferenceDetector.detect('What do you know about my case?')!; expect(query.entityType).toBe('case');
    expect(ReferenceResolver.resolve({ conversationId: first.conversationId, userMessage: 'What do you know about my case?', currentContext: first.referenceContext }).reference?.entityId).toBe(first.patientCase?.id);
    const follow = await h.send('What do you know about my case?', first.conversationId); expect(follow.referenceResolution?.status).toBe('resolved');
  });
  it('hands reviewed facts and separately validated requirements to hospital matching', async () => {
    const h = harness(), first = await h.send('I have knee pain. My doctor mentioned knee replacement.');
    const result = await h.send('Find hospitals in Mumbai under $6000.', first.conversationId);
    expect(result.agent, result.summary).toBe('hospital_matching'); expect(result.hospitalMatches).toHaveLength(1);
    expect(result.caseHandoff?.coordinationRequirements.find((r) => r.type === 'budget')?.maximum).toBe(6000);
    expect(result.caseHandoff?.reportedFacts.reportedDiagnosis).toEqual([]); expect(result.caseHandoff?.reportedFacts.proceduresDiscussed[0].status).toBe('user_reported');
    expect(result.caseHandoff?.clinicallyVerified).toBe(false); expect(result.caseHandoff?.submittedToProvider).toBe(false);
  });
  it('denies another owner plan and conversation access', async () => {
    const owner = harness(), first = await owner.send('I have knee pain.'); expect(await owner.planningStore.load(first.conversationId, randomUUID())).toBeUndefined();
    await expect(harness().send('Show me my case summary.', first.conversationId)).rejects.toMatchObject({ code: 'CONVERSATION_ACCESS_DENIED' });
  });
  it('holds an initial mixed request for review and Continue explicitly permits coordination', async () => {
    const h = harness(), first = await h.send("I've had knee pain for eight months. My doctor mentioned knee replacement. I want to find hospitals in Mumbai under $6000.");
    expect(first.workflow).toBe('case_intake'); expect(first.tasks).toEqual([]); expect(first.patientCase?.pendingCoordinationRequest).toBeDefined();
    expect(first.question).toBeNull(); expect(first.patientCase?.missingInformation.some((m) => m.category === 'required_for_requested_action')).toBe(false);
    const next = await h.send('Continue with this case', first.conversationId); expect(next.agent, next.summary).toBe('hospital_matching'); expect(next.hospitalMatches).toHaveLength(1);
  });
  it('never converts user reported diagnoses or MRI findings into clinician verification', () => {
    const c = merge('I was diagnosed with diabetes in 2022. My MRI showed a ligament tear.');
    expect(c.reportedDiagnosis[0].value).toBe('diabetes'); expect(c.medicalHistory[0].value).toBe('diabetes');
    expect(c.investigations[0].value).toContain('user-reported finding: a ligament tear');
    expect(c.timeline[0].value).toContain('2022'); expect(c.reportedDiagnosis[0].status).toBe('user_reported');
  });
  it('preserves unspecified surgery without inferring a procedure', () => { expect(merge('The doctor recommended surgery.').proceduresDiscussed[0].value).toBe('surgery'); });
  it('confirmation is user confirmation and a later change invalidates it', async () => {
    const h = harness(), first = await h.send('I have knee pain.'); const confirmed = await h.send('Confirm my case', first.conversationId);
    expect(confirmed.patientCase?.symptoms[0].status).toBe('user_confirmed'); expect(confirmed.patientCase?.confirmedRevision).toBe(1);
    const changed = await h.send("I'm taking paracetamol.", first.conversationId); expect(changed.patientCase?.confirmedRevision).toBeUndefined(); expect(changed.patientCase?.revision).toBe(2);
  });
  it('never fabricates document contents or accepts extra schema fields', () => {
    const c = merge('I have knee pain.'); expect(c.documents).toEqual([]);
    expect(patientCaseSchema.safeParse({ ...c, diseaseProbability: 0.8 }).success).toBe(false);
    expect(patientCaseSchema.safeParse({ ...c, documents: [{ documentId: randomUUID(), source: 'user_upload', status: 'uploaded_not_processed', contents: 'fake' }] }).success).toBe(false);
  });
  it('rejects fabricated clinical confirmation and foreign evidence', () => {
    const c = merge('I have knee pain.'); c.symptoms[0].status = 'clinician_confirmed'; expect(patientCaseSchema.safeParse(c).success).toBe(false);
    c.symptoms[0].status = 'user_reported'; c.symptoms[0].sources[0].conversationId = randomUUID(); expect(patientCaseSchema.safeParse(c).success).toBe(false);
  });
  it('prepares future review briefings without fake reviews or reports', () => {
    const c = merge('I have knee pain.'); for (const purpose of ['consultation', 'second_opinion'] as const) expect(prepareCaseBriefing(c, purpose)).toMatchObject({ clinicianReviewCompleted: false, submittedToProvider: false, documents: [] });
  });
  it('does not log case content or use the model during intake', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {}), error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { const h = harness({ generateStructured: async () => { throw new Error('No model may see private intake'); } });
      const r = await h.send('I have severe knee pain.'); expect(r.status).toBe('completed'); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
      const source = r.patientCase!.symptoms[0].sources[0]; const messages = h.planningStore.messages.get(r.conversationId)!;
      expect(messages.some((m) => m.role === 'user' && (m.metadata as { sourceId?: string })?.sourceId === source.messageSourceId)).toBe(true);
    } finally { log.mockRestore(); error.mockRestore(); }
  });
  it.each(['What is my diagnosis?', 'Should I stop my medication?', 'Interpret my MRI.', "I have chest pain and can't breathe."])("retains the clinical boundary for %s", async (content) => {
    const result = await harness().send(content); expect(result.patientCase).toBeUndefined(); expect(result.summary).toContain('cannot diagnose');
  });
});
