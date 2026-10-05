import { createHash } from 'node:crypto';
import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import type { AgentPlan, CarePlan, ToolName } from '@/lib/agents/schemas';
import type { RuntimeContext } from '@/lib/agents/runtime';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { upsertTask } from '@/lib/agents/treatment-planning/tasks';
import { describePackageDifferences } from '@/lib/agents/comparison/candidates';
import { persistedResponses, buildReferenceContext, planReferenceContext, selectionListContext, type ConversationMessage } from './context';
import { ReferenceDetector } from './ReferenceDetector';
import { ReferenceResolver } from './ReferenceResolver';

/** A pair refers to actual displayed records, never two inferred destinations. */
export async function prepareReferenceComparison(input: { content: string; conversationId: string; recent: ConversationMessage[]; active?: CarePlan;
  snapshot: CatalogSnapshot; store: PlanningStore; lease: string }): Promise<NonNullable<RuntimeContext['execution']> | undefined> {
  const selectedPair=/^\s*compare\s+(?:it|this|that)(?:\s+(?:package|hospital|doctor))?\s+(?:with|to)\s+(.+?)[.!?]?\s*$/i.exec(input.content);
  // Named destinations continue through the existing destination comparison path.
  if (selectedPair && !ReferenceDetector.detect(selectedPair[1])?.ordinal) return undefined;
  if (!selectedPair && !/^\s*compare\s+(?:those|these|the)(?:\s+two)?(?:\s+(?:packages|hospitals|doctors))?[.!?]?\s*$/i.test(input.content)) return undefined;
  const responses=persistedResponses(input.recent,input.conversationId);
  const latest = responses.at(-1);
  const requested = /packages/i.test(input.content) ? 'package' : /hospitals/i.test(input.content) ? 'hospital' : /doctors/i.test(input.content) ? 'doctor' : undefined;
  if (latest?.comparison && !requested) return undefined;
  const target = requested ?? latest?.referenceResolution?.reference?.entityType;
  const context = latest?.referenceResolution?.status === 'resolved' && input.active
    ? planReferenceContext(input.active, target) : latest ? buildReferenceContext(latest) : input.active ? planReferenceContext(input.active, target) : undefined;
  const groups = context?.groups.filter((g) => ['hospital', 'package', 'doctor'].includes(g.entityType) && (!target || g.entityType === target)) ?? [];
  const byType = [...new Set(groups.map((g) => g.entityType))].map((type) => ({ type, references: groups.filter((g) => g.entityType === type).flatMap((g) => g.references) }));
  const pairs = byType.filter((g) => g.references.length === 2);
  let references = pairs.length === 1 ? pairs[0].references : [];
  if(selectedPair){
    references=[];
    const selected=latest?.referenceResolution?.status==='resolved' ? latest.referenceResolution.reference : undefined;
    const query=ReferenceDetector.detect(selectedPair[1]);
    if(selected && latest && query?.ordinal){
      const other=ReferenceResolver.resolve({conversationId:input.conversationId,userMessage:selectedPair[1],
        currentContext:selectionListContext(latest,responses),query:{...query,entityType:selected.entityType}});
      if(other.status==='resolved' && other.reference && other.reference.entityId!==selected.entityId)
        references=[selected,other.reference];
    }
  }
  const table = { package: 'packages', hospital: 'hospitals', doctor: 'doctors' } as const;
  const valid = references.length === 2 && references.every((ref) => ref.entityType in table && input.snapshot[table[ref.entityType as keyof typeof table]]
    .some((r) => r.recordId === ref.entityId && r.slug === ref.slug));
  const question = valid ? null : 'Which two sourced records would you like to compare? Specify hospitals or packages and their names or positions.';
  const steps: AgentPlan['steps'] = valid ? references.map((ref) => ({ tool: `get_${ref.entityType}` as ToolName,
    objective: `Read ${ref.displayName}`.slice(0, 160), input: JSON.stringify({ slug: ref.slug }) })) : [];
  const tasks = input.active && input.active.status !== 'cancelled' ? steps.map((step) => upsertTask(input.active!.tasks,
    `reference_compare_${createHash('sha256').update(`${step.tool}:${step.input}`).digest('hex').slice(0, 24)}`,
    { title: step.objective, taskType: 'discovery', tool: step.tool, input: step.input, status: 'in_progress' })) : [];
  if (input.active) await input.store.save(input.active, input.lease);
  const plan: AgentPlan = { agent: 'comparison', understanding: 'Compare the two sourced records already shown.', steps, missingInformation: question };
  const normalized = QueryNormalizer.normalize('Catalog details', input.snapshot); normalized.missingEntities = [];
  return { plan, route: { plan, snapshot: input.snapshot, normalized }, carePlanId: input.active?.id, continueOnToolFailure: true,
    taskLinks: Object.fromEntries(steps.map((s, i) => [`${s.tool}:${s.input}`, tasks[i]?.id]).filter((entry) => entry[1])),
    diagnostics: { workflow: 'reference_comparison', modelAttempts: '0' },
    finalize: async (response, results) => {
      const findings = references.flatMap((ref) => response.findings.filter((f) => f.provenance.recordId === ref.entityId && f.slug === ref.slug));
      for (const [index, task] of tasks.entries()) {
        const result = results.find((r) => r.input === steps[index].input && r.tool === steps[index].tool);
        task.status = result ? 'completed' : 'blocked'; task.findings = result?.result.findings ?? [];
        task.runId = response.runId; task.agentTaskId = result?.taskId; task.updatedAt = new Date().toISOString();
      }
      if (input.active) await input.store.save(input.active, input.lease);
      const complete = findings.length === 2;
      return { ...response, findings, discovery: undefined, question, type: question ? 'clarification' : 'comparison', plan: input.active,
        status: question ? 'awaiting_user_input' : response.status,
        summary: question ?? (complete ? `${findings.every((f) => f.kind === 'packages') ? describePackageDifferences(findings) : 'The two sourced records and documented attributes are shown for comparison.'} Review each record’s requirement evidence and documented inclusions. These records do not establish a clinical winner; sample prices are not quotes.`
          : 'The pair comparison is incomplete because one or both sourced records could not be retrieved. Successful records are preserved.').slice(0, 1600),
        nextSteps: question ? [question] : ['Review documented differences and unconfirmed criteria with the provider.'] };
    } };
}
