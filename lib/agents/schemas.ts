import { z } from 'zod';
import { activitySchema, type RunActivity } from './execution-schemas';
import { normalizedDiscoveryQuerySchema } from '@/lib/discovery/query-normalizer';
import { referenceContextSchema, referenceResolutionSchema, referenceClarificationSchema, type ReferenceContext, type ReferenceResolution, type ReferenceClarification } from '@/lib/conversation/schemas';
import { requirementsSchema, requirementEvaluationSchema, resultRequirementEvaluationSchema, type Requirement, type ResultRequirementEvaluation } from '@/lib/requirements/RequirementTypes';
import { compoundRequestSchema, type CompoundRequest } from '@/lib/orchestration/CompoundRequest';
import { patientCaseSchema, caseSummarySchema, caseHandoffSchema } from '@/lib/case/CaseSchema';
import type { PatientCase, CaseSummary, CaseHandoff } from '@/lib/case/CaseTypes';

export const agentIdSchema = z.enum(['discovery', 'treatment_planning', 'hospital_matching', 'comparison']);
export type AgentId = z.infer<typeof agentIdSchema>;
export const toolNameSchema = z.enum([
  'search_treatments', 'search_hospitals', 'search_doctors', 'search_packages', 'search_countries', 'search_services',
  'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_country', 'compare_treatment_options',
  'get_hospital_details', 'get_doctor_details', 'get_treatment_details', 'get_package_details', 'search_locations', 'check_requirements', 'compare_providers',
  'get_case_context', 'get_case_documents_metadata', 'create_case', 'update_case', 'create_agent_task', 'request_user_information', 'request_external_action',
]);
export type ToolName = z.infer<typeof toolNameSchema>;

export const planSchema = z.object({
  agent: agentIdSchema,
  understanding: z.string().min(1).max(400),
  steps: z.array(z.object({
    objective: z.string().min(1).max(160),
    tool: toolNameSchema,
    input: z.string().max(1000).describe('JSON object string containing only this tool’s arguments'),
  })).max(8),
  missingInformation: z.string().max(300).nullable(),
}).strict();
export type AgentPlan = z.infer<typeof planSchema>;

export const synthesisSchema = z.object({
  summary: z.string().min(1).max(1200),
  nextSteps: z.array(z.string().min(1).max(180)).max(3),
  question: z.string().max(300).nullable(),
}).strict();
export type AgentSynthesis = z.infer<typeof synthesisSchema>;

export const userRequestSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  conversationId: z.uuid().optional(),
  caseId: z.uuid().optional(),
}).strict();

export interface Provenance {
  kind: 'catalog';
  table: string;
  recordId: string;
  sourceRecordId: string | null;
  label: string;
  sourceKind: 'synthetic' | 'external' | 'first_party';
  retrievedAt: string;
}

export interface Finding {
  requirementEvaluation?: ResultRequirementEvaluation;
  kind: string;
  slug?: string;
  title: string;
  detail: string;
  href?: string;
  facts: Record<string, string | number | null>;
  matchType: 'exact' | 'related';
  matchReason: string;
  provenance: Provenance;
}

export interface ToolResult {
  analysis?: { kind: 'derived'; recordIds: string[]; summary: string; complete: boolean; missingInformation: string[] };
  findings: Finding[];
  note?: string;
  comparison?: Record<string, unknown>;
  caseContext?: Record<string, unknown>;
  requestedInformation?: string;
  approvalRequired?: string;
}

export const provenanceSchema = z.object({ kind: z.literal('catalog'), table: z.string(), recordId: z.guid(),
  sourceRecordId: z.guid().nullable(), label: z.string(), sourceKind: z.enum(['synthetic', 'external', 'first_party']), retrievedAt: z.iso.datetime() });
export const findingSchema = z.object({ kind: z.string(), slug: z.string().optional(), title: z.string(), detail: z.string(),
  requirementEvaluation: resultRequirementEvaluationSchema.optional(),
  href: z.string().optional(), facts: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  matchType: z.enum(['exact', 'related']), matchReason: z.string().min(1), provenance: provenanceSchema });
export const toolResultSchema = z.object({ analysis: z.object({ kind: z.literal('derived'), recordIds: z.array(z.guid()).max(30), summary: z.string().max(1600), complete: z.boolean(), missingInformation: z.array(z.string().max(300)).max(30) }).strict().optional(), findings: z.array(findingSchema).max(30), note: z.string().optional(),
  comparison: z.record(z.string(), z.unknown()).optional(), caseContext: z.record(z.string(), z.unknown()).optional(),
  requestedInformation: z.string().optional(), approvalRequired: z.string().optional() }).strict();

export const hospitalMatchClassificationSchema = z.enum(['strong_match', 'partial_match', 'insufficient_evidence', 'does_not_match']);
export const hospitalMatchSchema = z.object({
  hospital: findingSchema.refine((f) => f.kind === 'hospitals'),
  classification: hospitalMatchClassificationSchema,
  linkedPackages: z.array(z.object({ package: findingSchema.refine((f) => f.kind === 'packages'),
    classification: hospitalMatchClassificationSchema }).strict()).max(30),
  evidencePackageId: z.guid().optional(),
  criteria: z.array(z.object({ evaluation: requirementEvaluationSchema, level: z.enum(['hospital', 'package']),
    source: provenanceSchema.optional() }).strict()).max(30),
  fulfilledRequirements: z.array(z.string()).max(30), failedRequirements: z.array(z.string()).max(30),
  missingInformation: z.array(z.string()).max(30),
  packageSearchComplete: z.boolean(),
  packageEvidenceRequested: z.boolean().default(true),
}).strict().refine((match) => !match.evidencePackageId || match.linkedPackages.some((p) => p.package.provenance.recordId === match.evidencePackageId),
  'Aggregate evidence must come from one actual linked package').superRefine((match, ctx) => {
  const ids = (statuses: string[]) => match.criteria.filter((c) => statuses.includes(c.evaluation.status)).map((c) => c.evaluation.requirementId);
  if (JSON.stringify(match.fulfilledRequirements) !== JSON.stringify(ids(['exact']))
    || JSON.stringify(match.failedRequirements) !== JSON.stringify(ids(['not_met']))
    || JSON.stringify(match.missingInformation) !== JSON.stringify(ids(['unknown', 'incomplete', 'related'])))
    ctx.addIssue({ code: 'custom', message: 'Requirement summaries must reflect the evidence statuses' });
  if (match.classification === 'strong_match' && (!match.criteria.length || match.criteria.some((c) => c.evaluation.status !== 'exact' || !c.source || !c.evaluation.evidence.length)))
    ctx.addIssue({ code: 'custom', message: 'Strong matches need sourced evidence for every requested criterion' });
  if ((match.classification === 'does_not_match') !== (match.failedRequirements.length > 0))
    ctx.addIssue({ code: 'custom', message: 'Does not match requires explicit contradictory evidence' });
  if (match.linkedPackages.some((p) => p.package.facts.hospitalId !== match.hospital.provenance.recordId || p.package.facts.hospitalSlug !== match.hospital.slug))
    ctx.addIssue({ code: 'custom', message: 'Packages must preserve their hospital identity association' });
  if (match.criteria.some((c) => c.source && c.source.recordId !== (c.level === 'hospital' ? match.hospital.provenance.recordId : match.evidencePackageId)))
    ctx.addIssue({ code: 'custom', message: 'Each criterion must reference its actual evidence record' });
});
export type HospitalMatch = z.infer<typeof hospitalMatchSchema>;

export const discoveryResultSchema = z.object({
  query: z.string(), normalizedQuery: z.string(), intent: z.string(),
  entities: normalizedDiscoveryQuerySchema.shape.entities,
  results: z.array(findingSchema).max(30), relatedResults: z.array(findingSchema).max(10),
  matchType: z.enum(['exact', 'related', 'none']), matchReason: z.string().min(1),
  missingEntities: z.array(z.string()), sources: z.array(provenanceSchema),
  nextActions: z.array(z.string()), recovered: z.boolean(),
}).strict();
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

export const discoveryMatchSchema = z.object({
  matchType: z.enum(['exact', 'related', 'none']), matchReason: z.string().min(1).max(600),
}).strict();
export const planningResultGroupSchema = discoveryMatchSchema.extend({
  taskId: z.uuid(), target: z.enum(['hospitals', 'packages', 'doctors', 'services']),
  status: z.enum(['completed', 'blocked']), findings: z.array(findingSchema).max(30),
}).strict().refine((group) => {
  const actual = group.findings.some((finding) => finding.matchType === 'exact') ? 'exact' : group.findings.length ? 'related' : 'none';
  return group.matchType === actual && (group.status === 'completed' || group.findings.length === 0);
}, 'Group match status must describe its own findings');
export type PlanningResultGroup = z.infer<typeof planningResultGroupSchema>;

export const comparisonOptionSchema = z.object({ type: z.enum(['city', 'country']), value: z.string().min(1).max(100), label: z.string().min(1).max(100) }).strict();
export const comparisonSubjectSchema = z.object({ type: z.enum(['treatment', 'specialty', 'catalog']), value: z.string().min(1).max(160),
  slug: z.string().optional(), matchType: z.enum(['exact', 'related', 'none']), relatedSlug: z.string().optional() }).strict();
export const comparisonRequestSchema = z.object({ intent: z.literal('comparison'), subject: comparisonSubjectSchema.optional(),
  requirements: requirementsSchema.optional(),
  options: z.array(comparisonOptionSchema).max(2), targets: z.array(z.enum(['hospitals', 'packages', 'doctors'])).min(1).max(3),
  budget: z.object({ amount: z.number().positive().max(100000000), currency: z.enum(['USD', 'INR']), source: z.literal('user') }).strict().optional(),
  focus: z.enum(['catalog', 'package_price']),
}).strict();
export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;
export const comparisonSchema = z.object({ id: z.uuid(), request: comparisonRequestSchema,
  sides: z.tuple([z.object({ option: comparisonOptionSchema, groups: z.array(planningResultGroupSchema).max(3), missingFields: z.array(z.string()).max(30) }).strict(),
    z.object({ option: comparisonOptionSchema, groups: z.array(planningResultGroupSchema).max(3), missingFields: z.array(z.string()).max(30) }).strict()]),
  subjectFinding: findingSchema.optional(), sources: z.array(provenanceSchema).max(40), limitations: z.array(z.string().max(300)).max(6), createdAt: z.iso.datetime(),
}).strict().refine((comparison) => comparison.request.subject && comparison.request.options.length === 2
  && comparison.request.options[0].value !== comparison.request.options[1].value
  && comparison.sides.every((side, index) => side.option.value === comparison.request.options[index].value
    && side.option.type === comparison.request.options[index].type
    && side.groups.length === comparison.request.targets.length
    && side.groups.every((group, position) => group.target === comparison.request.targets[position])), 'Comparison sides must preserve the requested options and groups');
export type Comparison = z.infer<typeof comparisonSchema>;

export const planningContextSchema = z.object({
  referenceContext: referenceContextSchema.optional(),
  pendingClarification: referenceClarificationSchema.optional(),
  patientCase: patientCaseSchema.optional(),
  caseHandoff: caseHandoffSchema.optional(),
  compoundRequest: compoundRequestSchema.optional(),
  requirements: requirementsSchema.optional(),
  goalType: z.enum(['treatment', 'consultation', 'intake']),
  treatmentSlug: z.string().optional(), treatmentName: z.string().optional(), treatmentId: z.guid().optional(),
  specialty: z.string().optional(), city: z.string().optional(), country: z.string().optional(),
  budget: z.object({ amount: z.number().positive().max(100000000), currency: z.enum(['USD', 'INR']), source: z.literal('user') }).strict().optional(),
  preferredHospital: z.string().max(100).optional(), consultationMode: z.enum(['video', 'in-person']).optional(),
  requestedTargets: z.array(z.enum(['hospitals', 'packages', 'doctors', 'services'])).max(4),
}).strict();
export type PlanningContext = z.infer<typeof planningContextSchema>;
export const careTaskStatusSchema = z.enum(['pending', 'in_progress', 'blocked', 'awaiting_user', 'completed', 'cancelled']);
export const carePlanTaskSchema = z.object({
  hospitalMatches: z.array(hospitalMatchSchema).max(30).optional(),
  id: z.uuid(), key: z.string().min(1).max(200), title: z.string().min(1).max(160), description: z.string().max(600),
  taskType: z.enum(['discovery', 'review', 'preferences', 'clarification', 'external_action']),
  status: careTaskStatusSchema, priority: z.enum(['normal', 'high']), requiresUserAction: z.boolean(),
  requiresApproval: z.boolean(), approvalStatus: z.enum(['not_required', 'pending', 'approved', 'rejected']),
  tool: toolNameSchema.optional(), input: z.string().max(1000).optional(),
  catalogSignature: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  runId: z.uuid().optional(), agentTaskId: z.uuid().optional(),
  discovery: discoveryMatchSchema.optional(),
  comparisonRequest: comparisonRequestSchema.optional(), comparison: comparisonSchema.optional(),
  findings: z.array(findingSchema).max(30), updatedAt: z.iso.datetime(),
}).strict();
export type CarePlanTask = z.infer<typeof carePlanTaskSchema>;
export const carePlanSchema = z.object({
  id: z.uuid(), userId: z.uuid(), conversationId: z.uuid(), title: z.string().min(1).max(160), goal: z.string().min(1).max(2000),
  status: z.enum(['draft', 'planning', 'awaiting_user', 'ready', 'in_progress', 'completed', 'cancelled']),
  context: planningContextSchema, tasks: z.array(carePlanTaskSchema).max(40), findings: z.array(findingSchema).max(30),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).strict();
export type CarePlan = z.infer<typeof carePlanSchema>;

export interface AgentTaskView {
  id: string;
  objective: string;
  tool: ToolName;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'awaiting_approval' | 'awaiting_user_input';
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
}

export interface AgentResponse {
  pendingClarification?: ReferenceClarification;
  analyses?: NonNullable<ToolResult['analysis']>[];
  summarySource?: 'model' | 'derived' | 'application';
  activity?: RunActivity;
  workflow?: 'case_intake';
  patientCase?: PatientCase;
  caseSummary?: CaseSummary;
  caseHandoff?: CaseHandoff;
  hospitalMatches?: HospitalMatch[];
  compoundRequest?: CompoundRequest;
  requirements?: Requirement[];
  referenceContext?: ReferenceContext;
  referenceResolution?: ReferenceResolution;
  conversationId: string;
  runId: string;
  agent: AgentId;
  status: 'completed' | 'awaiting_user_input' | 'awaiting_approval' | 'failed';
  understanding: string;
  summary: string;
  findings: Finding[];
  nextSteps: string[];
  question: string | null;
  tasks: AgentTaskView[];
  discovery?: { normalizedQuery: string; matchType: 'exact' | 'related' | 'none'; matchReason: string; recovered: boolean };
  resultGroups?: PlanningResultGroup[];
  approvalId?: string;
  approvalProposal?: { action: string; detail: string };
  type?: 'discovery' | 'planning' | 'comparison' | 'clarification' | 'progress' | 'result' | 'error';
  comparison?: Comparison;
  plan?: CarePlan;
  questions?: string[];
  nextActions?: string[];
  sources?: Provenance[];
}

export const assistantResponseSchema = z.object({
  pendingClarification: referenceClarificationSchema.optional(),
  activity: activitySchema.optional(),
  analyses: z.array(toolResultSchema.shape.analysis.unwrap()).max(8).optional(),
  summarySource: z.enum(['model', 'derived', 'application']).optional(),
  workflow: z.literal('case_intake').optional(), patientCase: patientCaseSchema.optional(),
  caseSummary: caseSummarySchema.optional(), caseHandoff: caseHandoffSchema.optional(),
  hospitalMatches: z.array(hospitalMatchSchema).max(30).optional(),
  compoundRequest: compoundRequestSchema.optional(),
  requirements: requirementsSchema.optional(),
  referenceContext: referenceContextSchema.optional(), referenceResolution: referenceResolutionSchema.optional(),
  conversationId: z.uuid(), runId: z.uuid(), agent: agentIdSchema,
  status: z.enum(['completed', 'awaiting_user_input', 'awaiting_approval', 'failed']),
  understanding: z.string().max(600), summary: z.string().max(1600), findings: z.array(findingSchema).max(30),
  nextSteps: z.array(z.string().max(300)).max(6), question: z.string().max(300).nullable(),
  tasks: z.array(z.object({ id: z.uuid(), objective: z.string(), tool: toolNameSchema,
    status: z.enum(['pending', 'running', 'completed', 'failed', 'blocked', 'awaiting_approval', 'awaiting_user_input']),
    startedAt: z.iso.datetime().optional(), completedAt: z.iso.datetime().optional(), errorCode: z.string().optional() })).max(8),
  discovery: z.object({ normalizedQuery: z.string(), matchType: z.enum(['exact', 'related', 'none']), matchReason: z.string(), recovered: z.boolean() }).optional(),
  resultGroups: z.array(planningResultGroupSchema).max(4).optional(),
  approvalId: z.uuid().optional(), approvalProposal: z.object({ action: z.string(), detail: z.string() }).optional(),
  type: z.enum(['discovery', 'planning', 'comparison', 'clarification', 'progress', 'result', 'error']).optional(),
  comparison: comparisonSchema.optional(),
  plan: carePlanSchema.optional(), questions: z.array(z.string()).max(3).optional(),
  nextActions: z.array(z.string()).max(6).optional(), sources: z.array(provenanceSchema).max(30).optional(),
}).strict();
