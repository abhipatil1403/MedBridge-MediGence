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

const provenanceSchema = z.object({ kind: z.literal('catalog'), table: z.string(), recordId: z.guid(),
  sourceRecordId: z.guid().nullable(), label: z.string(), sourceKind: z.enum(['synthetic', 'external', 'first_party']), retrievedAt: z.iso.datetime() });
const findingSchema = z.object({ kind: z.string(), slug: z.string().optional(), title: z.string(), detail: z.string(),
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
}
