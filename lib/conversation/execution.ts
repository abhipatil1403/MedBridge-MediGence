import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import type { AgentResponse, CarePlan, ToolName } from '@/lib/agents/schemas';
import type { RuntimeContext } from '@/lib/agents/runtime';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { derivePlanStatus, upsertTask } from '@/lib/agents/treatment-planning/tasks';
import { createHash } from 'node:crypto';
import { buildReferenceContext, persistedResponses, planReferenceContext, type ConversationMessage } from './context';
import { ReferenceDetector } from './ReferenceDetector';
import { ReferenceResolver } from './ReferenceResolver';
import type { EntityReference, ReferenceContext } from './schemas';
import { normalize } from '@/lib/discovery/normalize';
import { packageAttributes } from '@/lib/requirements/RequirementTypes';
import { legacyBudget } from '@/lib/requirements/RequirementNormalizer';
import { evaluateFindings } from '@/lib/requirements/response';

const lists = { hospital: 'hospitals', package: 'packages', doctor: 'doctors', treatment: 'treatments', country: 'countries', service: 'services' } as const;

export async function prepareReferenceExecution(input: { content: string; conversationId: string; recent: ConversationMessage[]; active?: CarePlan;
  snapshot: CatalogSnapshot; store: PlanningStore; lease: string }): Promise<NonNullable<RuntimeContext['execution']> | undefined> {
  let query = ReferenceDetector.detect(input.content);
  const responses = persistedResponses(input.recent, input.conversationId);
  const latest = responses.at(-1);
  let namedCandidates: EntityReference[] | undefined;
  // Resolve a short clarification against the actual candidates; no catalog or prose reconstruction.
  if (!query && latest?.referenceResolution?.status === 'ambiguous' && !/\b(find|compare|i need|i want|show|budget)\b/i.test(input.content)) {
    const type = /\bhospital\b/i.test(input.content) ? 'hospital' : /\bpackage\b/i.test(input.content) ? 'package' : /\bdoctor\b/i.test(input.content) ? 'doctor' : undefined;
    const text = input.content.trim().replace(/[.!?]+$/, '').toLowerCase();
    const matches = latest.referenceResolution.candidates.filter((item) => type ? item.entityType === type
      : [item.displayName, item.city, item.country, item.location].some((value) => value?.toLowerCase().replaceAll('-', ' ') === text));
    if (matches.length) {
      query = { ...latest.referenceResolution.query, ordinal: type ? latest.referenceResolution.query.ordinal : undefined, attribute: undefined, entityType: type,
        location: type ? latest.referenceResolution.query.location : undefined };
      if (!type) namedCandidates = matches;
    }
  }
  if (!query) return undefined;
  const contexts = [...responses].reverse().map((response) => buildReferenceContext(response, response.referenceContext?.createdAt));
  const requestedType = query.entityType ?? (query.attribute || query.operation === 'price' ? 'package' : undefined);
  const relevant = (context: ReferenceContext) => context.groups.some((group) => (!group.shared || requestedType === group.entityType)
    && (!requestedType || group.entityType === requestedType)
    && (!query!.location || [group.location, ...group.references.flatMap((item) => [item.city, item.country, item.location])]
      .some((place) => place && normalize(place.replaceAll('-', ' ')) === normalize(query!.location!))));
  // Never fall back because an ordinal is out of range or a current group is empty.
  let current = contexts[0] && relevant(contexts[0]) ? contexts[0] : undefined;
  if (!current && input.active && input.active.status !== 'cancelled') {
    const plan = planReferenceContext(input.active, requestedType); if (relevant(plan)) current = plan;
  }
  current ??= contexts.slice(1).find(relevant);
  if (namedCandidates && current) current = { ...current, groups: current.groups.map((group) => ({ ...group,
    references: group.references.filter((item) => namedCandidates!.some((candidate) => candidate.entityId === item.entityId && candidate.entityType === item.entityType)) })) };
  let resolution = ReferenceResolver.resolve({ conversationId: input.conversationId, userMessage: input.content, currentContext: current, query });
  const reference = resolution.reference;
  // Both slug and record ID must still identify the same currently published catalog entity.
  if (reference && !input.snapshot[lists[reference.entityType]].some((item) => item.slug === reference.slug && item.recordId === reference.entityId))
    resolution = { ...resolution, status: 'unresolved', reference: undefined, reason: 'That previously shown record is no longer available in the current catalog. Which result would you like to explore?' };
  if (resolution.reference?.entityType === 'service') resolution = { ...resolution, status: 'unresolved', reference: undefined,
    reason: 'This service has no supported detail tool. Please open its catalog page or specify another result.' };
  const chosen = resolution.reference;
  const steps: NonNullable<RuntimeContext['execution']>['plan']['steps'] = chosen ? [{
    tool: query.operation === 'packages' ? 'search_packages' : `get_${chosen.entityType}` as ToolName,
    objective: query.operation === 'packages' ? `Find packages associated with ${chosen.displayName}`.slice(0, 160) : `Read ${chosen.displayName}`.slice(0, 160),
    input: JSON.stringify(query.operation === 'packages' ? { query: `Packages for ${chosen.displayName}`.slice(0, 240), hospital: chosen.slug,
      treatment: input.active?.context.treatmentSlug, budget: input.active?.context.budget?.currency === 'USD' && !input.active.context.requirements?.some((r) => (packageAttributes as readonly string[]).includes(r.type)) ? input.active.context.budget.amount : undefined } : { slug: chosen.slug }),
  }] : [];
  const plan = { agent: 'discovery' as const, understanding: chosen ? `You are referring to ${chosen.displayName}.`.slice(0, 400) : 'I need to identify the result you mean.',
    steps, missingInformation: chosen ? null : resolution.reason.slice(0, 300) };
  const normalized = QueryNormalizer.normalize('Catalog details', input.snapshot);
  normalized.missingEntities = [];
  const step = steps[0];
  const task = step && input.active && input.active.status !== 'cancelled' ? upsertTask(input.active.tasks,
    `reference_${createHash('sha256').update(`${step.tool}:${step.input}`).digest('hex').slice(0, 24)}`,
    { title: step.objective, taskType: 'discovery', tool: step.tool, input: step.input }) : undefined;
  if (task && input.active) {
    task.status = 'in_progress'; task.updatedAt = new Date().toISOString();
    await input.store.save(input.active, input.lease);
  }
  return { plan, route: { plan, snapshot: input.snapshot, normalized }, carePlanId: input.active?.id,
    taskLinks: task && step ? { [`${step.tool}:${step.input}`]: task.id } : undefined,
    diagnostics: { workflow: 'reference_resolution', resolutionStatus: resolution.status, modelAttempts: '0' },
    finalize: async (response) => {
      const findings = evaluateFindings(response.findings.map((finding) => chosen && finding.provenance.recordId === chosen.entityId ? { ...finding,
        matchType: chosen.matchType, matchReason: `Previously shown ${chosen.matchType} catalog result; resolving a reference does not establish medical suitability.` } : finding), input.active?.context.requirements ?? [], input.snapshot);
      let finalResolution = resolution;
      if (chosen && query.operation !== 'packages' && !findings.some((finding) => finding.provenance.recordId === chosen.entityId))
        finalResolution = { ...resolution, status: 'unresolved', reference: undefined, reason: 'The previously shown record could not be retrieved. Please try again or choose another result.' };
      const question = chosen ? null : resolution.reason.slice(0, 300);
      if (task && input.active) {
        input.active.context.budget = legacyBudget(input.active.context.requirements ?? []) ?? input.active.context.budget;
        task.status = response.tasks[0]?.status === 'completed' ? 'completed' : 'blocked';
        task.findings = findings; task.runId = response.runId; task.agentTaskId = response.tasks[0]?.id;
        task.updatedAt = new Date().toISOString(); input.active.updatedAt = task.updatedAt;
        input.active.findings = [...new Map([...input.active.findings, ...findings].map((item) => [item.provenance.recordId, item])).values()].slice(0, 30);
        input.active.status = derivePlanStatus(input.active.tasks, input.active.findings.length > 0);
        await input.store.save(input.active, input.lease);
      }
      return { ...response, findings, discovery: undefined, plan: input.active, referenceResolution: finalResolution,
        status: question ? 'awaiting_user_input' : response.status, type: question ? 'clarification' : 'result', question,
        summary: question ? resolution.reason : response.status === 'failed' ? 'I could not retrieve that referenced record. Please try again.'
          : !findings.length ? query.operation === 'packages' ? 'No matching published packages are associated with that hospital and the current plan criteria.' : finalResolution.reason
            : referenceSummary(chosen!, findings, query.operation, query.attribute),
        nextSteps: question ? ['Specify the result type, location or name.'] : ['Review the sourced catalog details. A clinician must assess medical suitability.'],
      } as AgentResponse;
    } };
}

function referenceSummary(reference: EntityReference, findings: AgentResponse['findings'], operation: string, attribute?: string) {
  const item = findings[0];
  if (operation === 'packages') return `I found ${findings.length} catalog package${findings.length === 1 ? '' : 's'} associated with ${reference.displayName}. Listed sample prices are not provider quotes.`;
  const price = item.facts.samplePriceUsd;
  const budget = item.requirementEvaluation?.evaluations.find((e) => e.type === 'budget');
  if (operation === 'price' && budget) return `${item.title}: ${budget.label} — ${budget.status.replaceAll('_', ' ')}. ${budget.explanation} Listed sample prices are not provider quotes.`.slice(0, 1600);
  if ((operation === 'price' || attribute === 'cheaper' || attribute === 'expensive') && typeof price === 'number')
    return `${item.title} lists ${item.provenance.sourceKind === 'synthetic' ? 'a synthetic' : 'a catalog'} sample price of USD ${price.toLocaleString('en-US')}.${attribute ? ' This identifies the requested price extreme among the previously returned records only.' : ''} This is not a provider quote or a clinical recommendation.`;
  return `Here are the sourced catalog details for ${reference.displayName}.${item.provenance.sourceKind === 'synthetic' ? ' This is synthetic demo data.' : ''} Resolving this reference does not recommend the provider or treatment.`;
}
