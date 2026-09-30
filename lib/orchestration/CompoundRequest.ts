import { z } from 'zod';
import { requirementsSchema } from '@/lib/requirements/RequirementTypes';

export const operationTypeSchema = z.enum(['discover_hospitals', 'discover_doctors', 'discover_packages', 'evaluate_requirements', 'compare_results']);
export const plannedOperationSchema = z.object({
  id: operationTypeSchema, type: operationTypeSchema,
  dependsOn: z.array(operationTypeSchema).max(4),
  scope: z.enum(['independent', 'linked_hospitals', 'candidates']),
  status: z.enum(['pending', 'completed', 'incomplete', 'skipped']),
  note: z.string().max(600).optional(),
}).strict();
export const compoundRequestSchema = z.object({
  requirements: requirementsSchema,
  operations: z.array(plannedOperationSchema).min(2).max(5),
  requiresClarification: z.boolean(),
  clarification: z.object({ field: z.enum(['procedure', 'location']), question: z.string().max(300) }).strict().optional(),
}).strict().superRefine((request, ctx) => {
  const seen = new Set<string>();
  for (const op of request.operations) {
    if (op.id !== op.type || seen.has(op.id) || op.dependsOn.some((id) => !seen.has(id)))
      ctx.addIssue({ code: 'custom', message: 'Operations must have unique IDs and depend only on preceding operations' });
    seen.add(op.id);
  }
  if (request.requiresClarification !== Boolean(request.clarification)) ctx.addIssue({ code: 'custom', message: 'Clarification must describe a real missing field' });
});
export type OperationType = z.infer<typeof operationTypeSchema>;
export type PlannedOperation = z.infer<typeof plannedOperationSchema>;
export type CompoundRequest = z.infer<typeof compoundRequestSchema>;
