import type { AgentResponse, CarePlan, Finding } from '@/lib/agents/schemas';
import { assistantResponseSchema } from '@/lib/agents/schemas';
import { referenceContextSchema, type ReferenceContext, type ReferenceEntityType } from './schemas';

const kinds: Record<string, ReferenceEntityType> = { hospitals: 'hospital', doctors: 'doctor', packages: 'package', treatments: 'treatment', countries: 'country', services: 'service' };
export type ConversationMessage = { role: string; content: string; metadata?: unknown; createdAt?: string };

/** Use the same structural precedence as ResponseBlocks; never reconstruct entities from prose. */
export function buildReferenceContext(response: AgentResponse, createdAt = new Date().toISOString()): ReferenceContext {
  const groups: ReferenceContext['groups'] = [];
  const add = (target: string, findings: Finding[], location?: string, optionPosition?: number, incomplete = false, shared = false) => {
    const entityType = kinds[target]; if (!entityType) return;
    const id = `${response.runId}:${groups.length}`;
    const unique = [...new Map(findings.filter((item) => item.slug && kinds[item.kind] === entityType).map((item) => [item.provenance.recordId, item])).values()];
    groups.push({ id, entityType, label: `${location ? `${location} ` : ''}${target}`, location, optionPosition, incomplete, shared,
      references: unique.map((item, index) => ({ referenceId: `${id}:${index + 1}`, entityType, entityId: item.provenance.recordId,
        slug: item.slug!, displayName: item.title, resultGroup: target, groupId: id, position: index + 1,
        sourceRunId: response.runId, createdAt, matchType: item.matchType, location,
        city: typeof item.facts.city === 'string' ? item.facts.city : undefined,
        country: typeof item.facts.country === 'string' ? item.facts.country : undefined,
        samplePrice: typeof item.facts.samplePriceUsd === 'number' && item.facts.samplePriceUsd > 0 ? item.facts.samplePriceUsd : undefined,
        listedPrice:typeof item.facts.listedPrice==='number'?item.facts.listedPrice:undefined,
        listedPriceMax:typeof item.facts.listedPriceMax==='number'?item.facts.listedPriceMax:undefined,
        priceType:typeof item.facts.priceType==='string'?item.facts.priceType:undefined,
        priceValidFrom:typeof item.facts.priceValidFrom==='string'?item.facts.priceValidFrom:undefined,
        priceValidUntil:typeof item.facts.priceValidUntil==='string'?item.facts.priceValidUntil:undefined,
        currency: typeof item.facts.currency === 'string' ? item.facts.currency : undefined,
        durationDays: typeof item.facts.durationDays === 'number' && item.facts.durationDays > 0 ? item.facts.durationDays : undefined,
      })) });
  };
  if (response.comparison) {
    // Tables render target order, then option A/B. Repeated cells and source disclosures are not new results.
    for (const [index, target] of response.comparison.request.targets.entries())
      for (const [sideIndex, side] of response.comparison.sides.entries()) {
        const group = side.groups[index]; add(target, group.findings, side.option.label, sideIndex + 1, group.status !== 'completed');
      }
    if (response.comparison.subjectFinding) add('treatments', [response.comparison.subjectFinding], undefined, undefined, false, true);
    for (const group of response.resultGroups ?? []) if (group.target === 'services') add(group.target, group.findings, undefined, undefined, group.status !== 'completed');
  } else if (response.resultGroups?.length) {
    for (const group of response.resultGroups) add(group.target, group.findings, undefined, undefined, group.status !== 'completed');
  } else {
    // Findings cards render in this exact order; keep contiguous blocks instead of sorting by type.
    let block: Finding[] = [];
    for (const finding of response.findings) {
      if (block.length && block[0].kind !== finding.kind) { add(block[0].kind, block); block = []; }
      block.push(finding);
    }
    if (block.length) add(block[0].kind, block);
    if (!groups.length) for (const task of response.tasks) if (task.tool.startsWith('search_'))
      add(task.tool.slice(7), [], undefined, undefined, task.status !== 'completed');
  }
  if (response.research) {
    const id = `${response.runId}:external`;
    const entities = [...new Map(response.research.findings.map(f => [f.entity.id, f.entity])).values()];
    groups.push({ id, entityType: 'hospital', label: 'External research hospitals', incomplete: response.research.status !== 'completed',
      references: entities.map((entity, index) => ({ referenceId: `${id}:${index + 1}`, entityType: 'hospital', entityId: entity.id,
        sourceKind: 'external_source', slug: entity.id, displayName: entity.name, city: entity.location, location: entity.location,
        resultGroup: 'external_research', groupId: id, position: index + 1, sourceRunId: response.runId, createdAt, matchType: 'related' })) });
  }
  const draft = response.patientCase ?? response.plan?.context.patientCase;
  if (draft) {
    const id = `${response.runId}:case`;
    // Shared scope excludes the private draft from bare catalog ordinals. The slug
    // is an internal reference key only; cases never receive a public detail URL.
    groups.push({ id, entityType: 'case', label: 'Your reported case', shared: true, incomplete: false,
      references: [{ referenceId: id, entityType: 'case', entityId: draft.id, slug: draft.id, displayName: 'Your reported case',
        resultGroup: 'case', groupId: id, position: 1, sourceRunId: response.runId, createdAt, matchType: 'exact' }] });
  }
  return referenceContextSchema.parse({ conversationId: response.conversationId, responseId: response.runId, createdAt, groups });
}

export function attachReferences(response: AgentResponse): AgentResponse {
  return { ...response, referenceContext: buildReferenceContext(response) };
}

export function persistedResponses(messages: ConversationMessage[], conversationId: string) {
  return messages.filter((message) => message.role === 'assistant').flatMap((message) => {
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== 'object' || !('response' in metadata)) return [];
    const parsed = assistantResponseSchema.safeParse(metadata.response);
    return parsed.success && parsed.data.conversationId === conversationId ? [parsed.data] : [];
  });
}

/** A detail/price selection keeps its original displayed list as the ordinal
 * anchor. A new search (including an empty one) always establishes a new scope. */
export function selectionListContext(response: AgentResponse, responses: AgentResponse[]): ReferenceContext {
  let anchor=response;
  const seen=new Set<string>();
  while(!seen.has(anchor.runId)){
    seen.add(anchor.runId);
    const resolution=anchor.referenceResolution;
    const selected=resolution?.status==='resolved' ? resolution.reference : undefined;
    if(!selected || !['details','price'].includes(resolution!.query.operation)
      || anchor.findings.length!==1 || anchor.findings[0].provenance.recordId!==selected.entityId) break;
    const source=responses.find(item=>item.runId===selected.sourceRunId);
    if(!source || seen.has(source.runId)) break;
    anchor=source;
  }
  return buildReferenceContext(anchor,anchor.referenceContext?.createdAt);
}

export function planReferenceContext(plan: CarePlan, requestedType?: ReferenceEntityType): ReferenceContext {
  const comparisonTask = [...plan.tasks].reverse().find((task) => task.comparison && task.status === 'completed'
    && (!requestedType || task.comparison.sides.some((side) => side.groups.some((group) => kinds[group.target] === requestedType))));
  const comparison = comparisonTask?.comparison;
  const context = buildReferenceContext({ conversationId: plan.conversationId, runId: comparisonTask?.runId ?? plan.tasks.find((task) => task.runId)?.runId ?? plan.id, agent: 'discovery', status: 'completed',
    understanding: '', summary: '', question: null, tasks: [], nextSteps: [], comparison,
    findings: comparison ? [] : plan.findings, patientCase: plan.context.patientCase }, plan.updatedAt);
  if (comparisonTask?.runId) return context;
  return { ...context, groups: context.groups.map((group) => ({ ...group, references: group.references.flatMap((reference) => {
    if (reference.entityType === 'case') return [reference];
    const source = [...plan.tasks].reverse().find((task) => task.status === 'completed' && task.runId
      && task.findings.some((finding) => finding.provenance.recordId === reference.entityId && finding.kind === reference.resultGroup));
    return source?.runId ? [{ ...reference, sourceRunId: source.runId }] : [];
  }) })) };
}

/** Server-loaded, schema-validated coordination context; private case data is not copied. */
export function validatedConversationContext(conversationId: string, messages: ConversationMessage[], plan?: CarePlan) {
  const responses = persistedResponses(messages, conversationId);
  const latest = responses.at(-1);
  const source = [...responses].reverse().find(r => r.findings.length || r.resultGroups?.length || r.comparison || r.research);
  return {
    conversationId,
    history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
    activePlan: plan ? { id: plan.id, goal: plan.goal, title: plan.title, status: plan.status,
      treatmentSlug: plan.context.treatmentSlug, city: plan.context.city, country: plan.context.country } : undefined,
    research: source?.research, researchComparison: source?.researchComparison,
    findings: source?.findings ?? plan?.findings ?? [], resultGroups: source?.resultGroups,
    references: latest?.pendingClarification?.context ?? (source ? buildReferenceContext(source, source.referenceContext?.createdAt) : plan?.context.referenceContext),
    resolution: latest?.referenceResolution,
    pendingClarification: latest?.pendingClarification ?? plan?.context.pendingClarification,
    previousToolResults: source?.tasks.map(t => ({ tool: t.tool, status: t.status })) ?? [],
    requirements: plan?.context.requirements ?? source?.requirements ?? [], comparison: source?.comparison,
  };
}
export type ValidatedConversationContext = ReturnType<typeof validatedConversationContext>;
