import { withResearchRecovery } from '@/lib/research/recovery';
import { prepareVerification } from '@/lib/verification/agent';
import { prepareResearchExecution, wantsExternalResearch } from '@/lib/research/agent';
import { randomUUID } from 'node:crypto';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { discoveryRoute, loadDiscoverySnapshot, routeToolDependencies } from '../discovery-routing';
import { AgentError } from '../errors';
import { runAgent, requestBoundary, safetyPlan, type RuntimeContext } from '../runtime';
import { assistantResponseSchema, userRequestSchema, type AgentResponse } from '../schemas';
import { defaultToolDependencies } from '../tools';
import { prepareTreatmentPlanning } from '../treatment-planning/agent';
import type { PlanningStore } from '../treatment-planning/store';
import { upsertTask } from '../treatment-planning/tasks';
import { classifyWorkflow } from './classifier';
import { prepareComparison } from '../comparison/agent';
import { prepareReferenceExecution } from '@/lib/conversation/execution';
import { validatedConversationContext, persistedResponses } from '@/lib/conversation/context';
import { RequirementExtractor } from '@/lib/requirements/RequirementExtractor';
import { applyRequirements } from '@/lib/requirements/response';
import { parseCompoundIntent, parseHospitalMatchingIntent } from '@/lib/orchestration/CompoundIntentParser';
import { prepareCompoundExecution } from '@/lib/orchestration/OperationExecutor';
import { prepareReferenceComparison } from '@/lib/conversation/comparison-execution';
import { caseIntakeIntent, prepareCaseIntake, caseSource } from '@/lib/case/CaseIntakeAgent';
import { extractCase } from '@/lib/case/CaseExtractor';
import { caseFields, caseHandoffSchema } from '@/lib/case/CaseSchema';
import { summarizeCase } from '@/lib/case/CaseSummary';
import { caseCompleteness } from '@/lib/case/CaseCompleteness';
import type { PatientCase } from '@/lib/case/CaseTypes';
import type { CatalogSnapshot } from '@/types/catalog';

function caseCoordinationText(content: string, snapshot: CatalogSnapshot, draft?: PatientCase): string {
  let text = /\b(?:find|search|look for)\b[^.!?;]*\bhospitals?\b[^.!?;]*/i.exec(content)?.[0] ?? content;
  const named = snapshot.treatments.some((t) => text.toLowerCase().includes(t.name.toLowerCase()));
  const procedures = [...new Set([...(draft?.proceduresDiscussed.filter((p) => p.status !== 'conflicting').map((p) => p.value) ?? []),
    ...extractCase(content, draft).filter((i) => i.field === 'proceduresDiscussed').map((i) => i.value)])];
  if (!named && procedures.length === 1) text = text.replace(/\bhospitals?\b/i, (noun) => `${noun} for ${procedures[0]}`);
  return text;
}

export interface OrchestratorContext extends RuntimeContext { planningStore: PlanningStore; prepareTurn?: (context:OrchestratorContext)=>Promise<void> }

/** One authenticated turn, one selected workflow, one bounded runtime. No recursive agent calls. */
export async function orchestrate(rawRequest: unknown, context: OrchestratorContext): Promise<AgentResponse> {
  context = { ...context, supportedAgents: ['discovery', 'treatment_planning', 'hospital_matching', 'comparison', 'research'] };
  const request = userRequestSchema.parse(rawRequest);
  const caseContext = request.caseId ? await context.caseAccess.readContext(request.caseId) : undefined;
  const conversationId = request.conversationId ?? await context.store.createConversation(context.userId, request.caseId);
  await context.store.assertConversation(conversationId, context.userId, request.caseId);
  const lease = randomUUID();
  let hasPlanningSchema = true;
  try {
    if (!await context.planningStore.acquire(conversationId, context.userId, lease))
      throw new AgentError('TURN_IN_PROGRESS', 'This conversation is still working on a request. Please wait for it to finish.');
  } catch (error) {
    if (!(error instanceof AgentError) || error.code !== 'PLANNING_MIGRATION_MISSING') throw error;
    hasPlanningSchema = false;
  }
  try {
    if(context.prepareTurn)await context.prepareTurn(context);
    const [active, recent] = await Promise.all([hasPlanningSchema ? context.planningStore.load(conversationId, context.userId) : undefined, context.planningStore.recentMessages(conversationId)]);
    context = { ...context, conversation: validatedConversationContext(conversationId, recent, active) };
    const boundary = requestBoundary(request.content);
    if (boundary) {
      const guarded = safetyPlan(request.content);
      const boundaryPlan = boundary === 'external' && guarded ? guarded : { agent: 'discovery' as const,
        understanding: 'This request may need clinical assessment.', steps: [], missingInformation: null };
      let taskId: string | undefined;
      if (active && boundary === 'external' && guarded) {
        // Boundary only: no provider, booking, sharing, or payment integration exists.
        const key = `external_${JSON.parse(guarded.steps[0].input).action}`;
        const task = upsertTask(active.tasks, key, { title: 'External action needs confirmation and a future integration', taskType: 'external_action',
          description: 'No external action has been performed.', requiresUserAction: true, requiresApproval: true,
          approvalStatus: 'pending', status: 'awaiting_user' });
        taskId = task.id;
        active.status = 'awaiting_user';
        await context.planningStore.save(active, lease);
      }
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution: {
        plan: boundaryPlan, carePlanId: active?.id,
        taskLinks: taskId && guarded ? { [`${guarded.steps[0].tool}:${guarded.steps[0].input}`]: taskId } : undefined,
        finalize: async (response) => {
          if (active && taskId) {
            const task = active.tasks.find((item) => item.id === taskId)!;
            task.runId = response.runId; task.agentTaskId = response.tasks[0]?.id;
            task.updatedAt = new Date().toISOString(); active.updatedAt = task.updatedAt;
            await context.planningStore.save(active, lease);
          }
          return { ...response, type: response.status === 'awaiting_approval' ? 'progress' : 'result', plan: active };
        },
      } }));
    }
    if (/\b(?:my|me|I)\b/i.test(request.content)&&/\b(?:recovery|follow.up|saved (?:rehabilitation|providers)|discharge document|uploaded documents|documents?[^.!?]{0,30}uploaded|uploaded[^.!?]{0,30}documents?|contact[^.!?]{0,20}(?:my )?hospital)\b/i.test(request.content)) {
      return validateResponse(await runAgent({...request,conversationId},{...context,execution:{
        plan:{agent:'treatment_planning',understanding:'You requested your non-clinical recovery coordination context.',steps:[{objective:'Read your authorized recovery context',tool:'get_recovery_context',input:'{}'}],missingInformation:null},
        diagnostics:{workflow:'recovery_coordination'},allowModelFollowUps:false,
        synthesis:{summary:'Your owner-scoped coordination context is shown below. These are your recorded tasks and private document titles, not clinical instructions or confirmed appointments. Use Lifetime Recover to add a task, milestone or consented support request.',nextSteps:['Open Lifetime Recover to manage your coordination tasks.'],question:null},
        finalize:async(response,results)=>({...response,coordination:results.find(r=>r.tool==='get_recovery_context')?.result.coordination}),
      }}));
    }
    if (/\b(?:document coordination|document checklist|organize (?:my |the )?documents|upload (?:my |the )?(?:documents|files)|prepare (?:a |the )?document package)\b/i.test(request.content)) {
      return validateResponse(await runAgent({...request,conversationId},{...context,execution:{
        plan:{agent:'document_coordination',understanding:'You requested administrative document coordination.',steps:[],missingInformation:null},
        diagnostics:{workflow:'document_coordination'},
        synthesis:{summary:'Choose the hospital and requested service in Documents below. Requirements must come from a documented source or be explicitly supplied by you. Uploaded content is not interpreted.',
          question:'Which hospital and service are you organizing documents for?',nextSteps:['Select your hospital and requested service in Documents.']},
        finalize:async response=>({...response,status:'awaiting_user_input'}),
      }}));
    }
    const draft = active?.context.patientCase;
    const catalogGapQuestion = !draft && active?.findings.some(f => f.kind === 'hospitals')
      && /^what information is missing[?.!]*$/i.test(request.content.trim());
    const hospitalGoal = /\b(?:find|search|look for)\b.*\bhospitals?\b|\bfind\b.*\bhospital\b/i.test(request.content);
    const continueCase = Boolean(draft && /^continue(?: with (?:my|this) case)?[.!]?$/i.test(request.content.trim()));
    const wantsHandoff = Boolean(draft && (hospitalGoal || continueCase && draft.pendingCoordinationRequest));
    const newFacts = extractCase(request.content, draft).some((i) => i.field !== 'requestedGoal');
    if (!catalogGapQuestion && (caseIntakeIntent(request.content, draft) || wantsHandoff) && (!wantsHandoff || newFacts
      || draft!.reviewPresentedRevision !== draft!.revision || caseFields.some((f) => draft![f].some((i) => i.status === 'conflicting')))) {
      if (!hasPlanningSchema) throw new AgentError('PLANNING_MIGRATION_MISSING', 'Case intake needs the existing care-plan migration before it can save information.');
      const intakeSnapshot = hospitalGoal ? await loadDiscoverySnapshot(context.tools?.repository ?? defaultToolDependencies.repository) : undefined;
      const execution = await prepareCaseIntake({ content: request.content, conversationId, userId: context.userId, active,
        store: context.planningStore, lease, pendingCoordinationRequest: hospitalGoal ? request.content : undefined,
        requirements: intakeSnapshot ? RequirementExtractor.extract(caseCoordinationText(request.content, intakeSnapshot, draft), intakeSnapshot, active?.context.requirements) : undefined,
        documentMetadata: request.caseId ? await context.caseAccess.readDocumentMetadata(request.caseId) : undefined });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const snapshot = await loadDiscoverySnapshot(context.tools?.repository ?? defaultToolDependencies.repository);
    const verificationExecution=prepareVerification({content:request.content,conversationId,userId:context.userId,recent,snapshot});
    if(verificationExecution)return validateResponse(await runAgent({...request,conversationId},{...context,tools:{...(context.tools??defaultToolDependencies),evaluationSnapshot:snapshot},execution:verificationExecution}));
    let routingContent = wantsHandoff && continueCase ? draft!.pendingCoordinationRequest! : request.content;
    if (wantsHandoff) {
      // Only a single explicitly reported procedure may supply omitted search context.
      // A symptom/diagnosis never becomes a procedure or evidence of appropriateness.
      routingContent = caseCoordinationText(routingContent, snapshot, draft);
    }
    const handoffMessageSourceId = wantsHandoff ? randomUUID() : undefined;
    const lastResponse = persistedResponses(recent, conversationId).at(-1);
    const previousRequirements = active?.context.requirements ?? lastResponse?.requirements ?? [];
    const newGoal = /\b(?:new|separate) (?:plan|goal|search)\b/i.test(request.content);
    const requirements = RequirementExtractor.extract(routingContent, snapshot, newGoal ? [] : previousRequirements);
    // An answer to an intake search clarification updates administrative context;
    // it neither becomes a clinical fact nor bypasses the review/Continue step.
    if (draft?.pendingCoordinationRequest && !wantsHandoff && draft.missingInformation.some((m) => m.category === 'required_for_requested_action')
      && RequirementExtractor.extract(request.content, snapshot).some((r) => r.type === 'location' || r.type === 'procedure' && r.matchType === 'exact')) {
      const execution = await prepareCaseIntake({ content: request.content, conversationId, userId: context.userId, active,
        store: context.planningStore, lease, requirements });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    if (wantsHandoff && caseCompleteness(draft!, requirements, true).some((m) => m.category === 'required_for_requested_action')) {
      active!.context.requirements = requirements;
      const execution = await prepareCaseIntake({ content: request.content, conversationId, userId: context.userId, active,
        store: context.planningStore, lease, pendingCoordinationRequest: routingContent });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const another = /\b(?:another|different) (?:one|package)\b/i.test(request.content);
    const excludedIds = another ? (lastResponse?.findings ?? []).filter((f) => f.kind === 'packages').map((f) => f.provenance.recordId) : [];
    context = { ...context, tools: { ...(context.tools ?? defaultToolDependencies), requirements, evaluationSnapshot: snapshot }, finalizeResponse: async (response) => {
      const evaluated = applyRequirements(response, requirements, snapshot, excludedIds);
      const savedCase = evaluated.plan?.context.patientCase;
      if (savedCase) {
        savedCase.missingInformation = caseCompleteness(savedCase, requirements, Boolean(wantsHandoff));
        evaluated.patientCase = savedCase;
        if (wantsHandoff) {
          const handoff = caseHandoffSchema.parse({ caseId: savedCase.id, revision: savedCase.revision, destination: 'hospital_matching',
            approvedByUser: true, approvalSource: caseSource(request.content, conversationId, response.runId, handoffMessageSourceId!, new Date().toISOString()),
            coordinationRequirements: requirements, reportedFacts: savedCase, clinicallyVerified: false, submittedToProvider: false });
          evaluated.caseHandoff = handoff; evaluated.plan!.context.caseHandoff = handoff;
        }
        evaluated.caseSummary = summarizeCase(savedCase);
      }
      if (evaluated.plan && hasPlanningSchema) evaluated.plan = await context.planningStore.save(evaluated.plan, lease);
      return evaluated;
    } };
    if (active) active.context.requirements = requirements;
    const referenceExecution = wantsHandoff ? undefined : await prepareReferenceComparison({ content: request.content, conversationId, recent, active, snapshot,
      store: context.planningStore, lease }) ?? await prepareReferenceExecution({ content: request.content, conversationId, recent, active, snapshot,
      store: context.planningStore, lease });
    if (referenceExecution) return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution: referenceExecution }));
    if (active && (active.context.pendingClarification || active.context.referenceContext)) {
      delete active.context.pendingClarification; delete active.context.referenceContext;
      if (hasPlanningSchema) await context.planningStore.save(active, lease);
    }
    if (wantsExternalResearch(routingContent)) return validateResponse(await runAgent({ ...request, conversationId }, { ...context,
      execution: prepareResearchExecution(routingContent, snapshot) }));
    const compound = parseCompoundIntent(routingContent, requirements, newGoal ? undefined : active?.context.compoundRequest);
    if (compound) {
      if (!hasPlanningSchema) throw new AgentError('PLANNING_MIGRATION_MISSING', 'Saved operations need the care-plan migration before they can run.');
      const execution = await prepareCompoundExecution({ content: routingContent, request: compound, snapshot, active, caseContext,
        userId: context.userId, conversationId, store: context.planningStore, lease });
      execution.messageSourceId = handoffMessageSourceId;
      if (!wantsHandoff) withResearchRecovery(execution, routingContent, snapshot);
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const hospitalRequest = parseHospitalMatchingIntent(routingContent, requirements, newGoal ? undefined : active?.context.compoundRequest);
    if (hospitalRequest && hasPlanningSchema) {
      const execution = await prepareCompoundExecution({ content: routingContent, request: hospitalRequest, snapshot, active, caseContext,
        userId: context.userId, conversationId, store: context.planningStore, lease });
      execution.messageSourceId = handoffMessageSourceId;
      if (!wantsHandoff) withResearchRecovery(execution, routingContent, snapshot);
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const goalText = request.content.split(/[.!?]/)[0].replace(/,?\s+(?:under|below|within|less than|maximum|budget|with|and I want)\b.*$/i, '').replace(/\s+treatment(?=\s+(?:in|at|near)\b|$)/i, '');
    let normalized = QueryNormalizer.normalize(goalText, snapshot);
    let content = request.content;
    // Resolve the answer to the most recent targeted discovery clarification.
    const lastAssistant = [...recent].reverse().find((message) => message.role === 'assistant');
    if (!active && !normalized.targets.length && normalized.entities.procedure && lastAssistant && /specific procedure|surgery or procedure|treatment.*packages/i.test(lastAssistant.content)) {
      const previousUser = [...recent].reverse().find((message) => message.role === 'user');
      const target = previousUser && /packages?/i.test(previousUser.content) ? 'packages' : 'hospitals';
      content = `Find ${target} for ${request.content}`;
      normalized = QueryNormalizer.normalize(content, snapshot);
    }
    const decision = classifyWorkflow(content, normalized, active);
    if (decision.workflow === 'comparison') {
      if (!hasPlanningSchema) throw new AgentError('PLANNING_MIGRATION_MISSING', 'Saved comparisons need the care-plan migration before they can run.');
      const execution = await prepareComparison({ content: request.content, snapshot, active, userId: context.userId, conversationId,
        store: context.planningStore, lease, tools: context.tools ?? defaultToolDependencies });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const unsupported = normalized.entities.procedurePhrase && ['related', 'none'].includes(normalized.entities.procedureMatchType);
    if (decision.workflow === 'treatment_planning' && !unsupported) {
      if (!hasPlanningSchema) throw new AgentError('PLANNING_MIGRATION_MISSING', 'Care planning needs its database migration before it can run. Catalog discovery is still available.');
      const execution = await prepareTreatmentPlanning({ content: request.content, snapshot, active, caseContext,
        userId: context.userId, conversationId, store: context.planningStore, lease, provider: context.provider,
        tools: context.tools ?? defaultToolDependencies });
      return validateResponse(await runAgent({ ...request, conversationId }, { ...context, execution }));
    }
    const tempRoute = { snapshot, normalized, plan: { agent: 'discovery' as const, understanding: 'Search the catalog.', steps: [], missingInformation: null } };
    const tools = routeToolDependencies(tempRoute, context.tools ?? defaultToolDependencies);
    let route = await discoveryRoute(content, tools.repository);
    if (decision.reason === 'missing_context') route = { ...tempRoute, plan: { agent: 'discovery',
      understanding: 'You are looking for treatment packages.', steps: [], missingInformation: 'What treatment are you looking for packages for?' } };
    if (route && decision.reason === 'missing_context') route.normalized.missingEntities = ['procedure'];
    const response = await runAgent({ ...request, content, conversationId }, { ...context, tools,
      // Keep legacy non-discovery tool workflows outside the new planning route.
      ...(decision.reason === 'missing_context' && route ? { execution: { plan: route.plan, route } } : {}),
    });
    return validateResponse({ ...response, type: response.status === 'failed' ? 'error' : response.question ? 'clarification' : 'discovery' });
  } finally { if (hasPlanningSchema) await context.planningStore.release(conversationId, lease); }
}

export function validateResponse(response: AgentResponse): AgentResponse {
  return assistantResponseSchema.parse({ ...response, questions: response.questions ?? (response.question ? [response.question] : []),
    nextActions: response.nextActions ?? response.nextSteps, sources: response.sources ?? response.findings.map((finding) => finding.provenance) });
}
