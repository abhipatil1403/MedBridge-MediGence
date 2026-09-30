import { z } from 'zod';

export const packageAttributes = ['accommodation', 'hotel', 'hospital_stay', 'flights', 'visa', 'airport_transfer', 'interpreter', 'meals', 'local_transport', 'follow_up', 'consultation', 'diagnostics', 'rehabilitation', 'nursing_care', 'companion_accommodation'] as const;
export const requirementSchema = z.object({
  id: z.string().max(100), type: z.enum(['procedure', 'location', 'budget', 'price', 'duration', 'service', 'package', 'specialty', 'hospital', 'verified', 'clinical_suitability', ...packageAttributes]),
  label: z.string().max(240), required: z.literal(true), originalExpression: z.string().max(2000),
  value: z.string().optional(), matchType: z.enum(['exact', 'related', 'none']).optional(),
  places: z.array(z.object({ type: z.enum(['city', 'country']), value: z.string(), label: z.string() }).strict()).max(10).optional(),
  currency: z.enum(['USD', 'INR', 'unspecified']).optional(), minimum: z.number().nonnegative().optional(), maximum: z.number().nonnegative().optional(),
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'range', 'eq']).optional(), desired: z.boolean().optional(),
}).strict();
export const requirementsSchema = z.array(requirementSchema).max(30);
export type Requirement = z.infer<typeof requirementSchema>;
export const requirementMatchStatusSchema = z.enum(['exact', 'related', 'unknown', 'not_met', 'incomplete', 'not_applicable']);
export const requirementEvaluationSchema = z.object({ requirementId: z.string(), type: requirementSchema.shape.type, label: z.string(),
  requestedValue: requirementSchema, status: requirementMatchStatusSchema, evidence: z.array(z.string()).max(20), sourceFields: z.array(z.string()).max(10), explanation: z.string().min(1).max(800),
}).strict();
export const resultRequirementEvaluationSchema = z.object({ resultId: z.guid(), resultType: z.string(), evaluations: z.array(requirementEvaluationSchema).max(30),
  overallStatus: z.enum(['fully_satisfies', 'partially_satisfies', 'does_not_satisfy', 'insufficient_evidence']),
}).strict();
export type RequirementEvaluation = z.infer<typeof requirementEvaluationSchema>;
export type ResultRequirementEvaluation = z.infer<typeof resultRequirementEvaluationSchema>;
