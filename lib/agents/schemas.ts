import { z } from 'zod';
import { normalizedDiscoveryQuerySchema } from '@/lib/discovery/query-normalizer';

export const agentIdSchema = z.enum(['discovery', 'treatment_planning', 'hospital_matching', 'comparison']);
export type AgentId = z.infer<typeof agentIdSchema>;
export const toolNameSchema = z.enum([
  'search_treatments', 'search_hospitals', 'search_doctors', 'search_packages', 'search_countries', 'search_services',
  'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_country', 'compare_treatment_options',
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
  content: z.string().trim().min(3).max(2000),
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
  href: z.string().optional(), facts: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  matchType: z.enum(['exact', 'related']), matchReason: z.string().min(1), provenance: provenanceSchema });
export const toolResultSchema = z.object({ findings: z.array(findingSchema).max(30), note: z.string().optional(),
  comparison: z.record(z.string(), z.unknown()).optional(), caseContext: z.record(z.string(), z.unknown()).optional(),
  requestedInformation: z.string().optional(), approvalRequired: z.string().optional() });

export const discoveryResultSchema = z.object({
  query: z.string(), normalizedQuery: z.string(), intent: z.string(),
  entities: normalizedDiscoveryQuerySchema.shape.entities,
  results: z.array(findingSchema).max(30), relatedResults: z.array(findingSchema).max(10),
  matchType: z.enum(['exact', 'related', 'none']), matchReason: z.string().min(1),
  missingEntities: z.array(z.string()), sources: z.array(provenanceSchema),
  nextActions: z.array(z.string()), recovered: z.boolean(),
}).strict();
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

export const planningContextSchema = z.object({
  goalType: z.enum(['treatment', 'consultation']),
  treatmentSlug: z.string().optional(), treatmentName: z.string().optional(), treatmentId: z.guid().optional(),
  specialty: z.string().optional(), city: z.string().optional(), country: z.string().optional(),
  budget: z.object({ amount: z.number().positive().max(100000000), currency: z.enum(['USD', 'INR']), source: z.literal('user') }).strict().optional(),
  preferredHospital: z.string().max(100).optional(), consultationMode: z.enum(['video', 'in-person']).optional(),
  requestedTargets: z.array(z.enum(['hospitals', 'packages', 'doctors', 'services'])).max(4),
}).strict();
export type PlanningContext = z.infer<typeof planningContextSchema>;
export const careTaskStatusSchema = z.enum(['pending', 'in_progress', 'blocked', 'awaiting_user', 'completed', 'cancelled']);
export const carePlanTaskSchema = z.object({
  id: z.uuid(), key: z.string().min(1).max(200), title: z.string().min(1).max(160), description: z.string().max(600),
  taskType: z.enum(['discovery', 'review', 'preferences', 'clarification', 'external_action']),
  status: careTaskStatusSchema, priority: z.enum(['normal', 'high']), requiresUserAction: z.boolean(),
  requiresApproval: z.boolean(), approvalStatus: z.enum(['not_required', 'pending', 'approved', 'rejected']),
  tool: toolNameSchema.optional(), input: z.string().max(1000).optional(),
  runId: z.uuid().optional(), agentTaskId: z.uuid().optional(),
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
  approvalId?: string;
  approvalProposal?: { action: string; detail: string };
  type?: 'discovery' | 'planning' | 'clarification' | 'progress' | 'result' | 'error';
  plan?: CarePlan;
  questions?: string[];
  nextActions?: string[];
  sources?: Provenance[];
}

export const assistantResponseSchema = z.object({
  conversationId: z.uuid(), runId: z.uuid(), agent: agentIdSchema,
  status: z.enum(['completed', 'awaiting_user_input', 'awaiting_approval', 'failed']),
  understanding: z.string().max(600), summary: z.string().max(1600), findings: z.array(findingSchema).max(30),
  nextSteps: z.array(z.string().max(300)).max(6), question: z.string().max(300).nullable(),
  tasks: z.array(z.object({ id: z.uuid(), objective: z.string(), tool: toolNameSchema,
    status: z.enum(['pending', 'running', 'completed', 'failed', 'blocked', 'awaiting_approval', 'awaiting_user_input']),
    startedAt: z.iso.datetime().optional(), completedAt: z.iso.datetime().optional(), errorCode: z.string().optional() })).max(8),
  discovery: z.object({ normalizedQuery: z.string(), matchType: z.enum(['exact', 'related', 'none']), matchReason: z.string(), recovered: z.boolean() }).optional(),
  approvalId: z.uuid().optional(), approvalProposal: z.object({ action: z.string(), detail: z.string() }).optional(),
  type: z.enum(['discovery', 'planning', 'clarification', 'progress', 'result', 'error']).optional(),
  plan: carePlanSchema.optional(), questions: z.array(z.string()).max(3).optional(),
  nextActions: z.array(z.string()).max(6).optional(), sources: z.array(provenanceSchema).max(30).optional(),
}).strict();
