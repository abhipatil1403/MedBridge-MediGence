import { z } from 'zod';

export const referenceEntityTypeSchema = z.enum(['hospital', 'doctor', 'package', 'treatment', 'country', 'service', 'case']);
export type ReferenceEntityType = z.infer<typeof referenceEntityTypeSchema>;
export const entityReferenceSchema = z.object({
  sourceKind: z.enum(['medbridge_catalog', 'external_source']).optional(),
  referenceId: z.string().min(1).max(200), entityType: referenceEntityTypeSchema, entityId: z.guid(),
  slug: z.string().min(1).max(200), displayName: z.string().min(1).max(300),
  city: z.string().optional(), country: z.string().optional(), location: z.string().optional(),
  resultGroup: z.string().max(100), groupId: z.string().max(200), position: z.number().int().positive(),
  sourceRunId: z.uuid(), createdAt: z.iso.datetime(), matchType: z.enum(['exact', 'related']),
  samplePrice: z.number().nonnegative().optional(), currency: z.string().optional(), durationDays: z.number().positive().optional(),
}).strict();
export type EntityReference = z.infer<typeof entityReferenceSchema>;
export const referenceContextSchema = z.object({ conversationId: z.uuid(), responseId: z.uuid(), createdAt: z.iso.datetime(),
  groups: z.array(z.object({ id: z.string().max(200), entityType: referenceEntityTypeSchema,
    label: z.string().max(300), location: z.string().optional(), optionPosition: z.number().int().positive().optional(),
    shared: z.boolean().optional(), incomplete: z.boolean(), references: z.array(entityReferenceSchema).max(30),
  }).strict()).max(30),
}).strict();
export type ReferenceContext = z.infer<typeof referenceContextSchema>;
export const referenceQuerySchema = z.object({ sourceKind: z.enum(['medbridge_catalog', 'external_source']).optional(), ordinal: z.union([z.number().int().positive().max(100), z.literal('last')]).optional(),
  entityType: referenceEntityTypeSchema.optional(), location: z.string().optional(),
  attribute: z.enum(['cheaper', 'expensive', 'longer', 'shorter']).optional(),
  operation: z.enum(['details', 'packages', 'price']),
}).strict();
export type ReferenceQuery = z.infer<typeof referenceQuerySchema>;
export const referenceResolutionSchema = z.object({ status: z.enum(['resolved', 'ambiguous', 'unresolved']),
  reference: entityReferenceSchema.optional(), candidates: z.array(entityReferenceSchema).max(30),
  reason: z.string().min(1).max(600), query: referenceQuerySchema,
}).strict().refine((value) => value.status === 'resolved' ? Boolean(value.reference) : !value.reference,
  'Only resolved references may select an entity');
export type ReferenceResolution = z.infer<typeof referenceResolutionSchema>;

export const referenceClarificationSchema = z.object({
  id: z.uuid(), type: z.literal('reference_disambiguation'), conversationId: z.uuid(), runId: z.uuid(),
  originalRequest: z.string().max(2000), question: z.string().min(1).max(600),
  candidates: z.array(entityReferenceSchema).max(30), expectedAnswer: z.literal('entity_selection'),
  query: referenceQuerySchema, context: referenceContextSchema.optional(), createdAt: z.iso.datetime(),
}).strict();
export type ReferenceClarification = z.infer<typeof referenceClarificationSchema>;
