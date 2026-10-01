import { z } from 'zod';

export const sourceKinds = ['medbridge_catalog', 'external_source', 'user_provided', 'model_derived'] as const;
export const sourceTypes = ['official_provider', 'health_authority', 'regulator', 'healthcare_organization', 'secondary'] as const;
export const informationFields = ['provider_details', 'treatment_availability', 'package_information', 'published_pricing', 'services', 'location', 'contact_information', 'facilities', 'accommodation'] as const;
export const researchInputSchema = z.object({
  query: z.string().trim().min(3).max(240), entityType: z.enum(['hospital', 'package', 'treatment']).optional(),
  treatment: z.string().trim().min(2).max(100).optional(), specialty: z.string().trim().min(2).max(80).optional(),
  location: z.string().trim().min(2).max(80), providers: z.array(z.string().trim().min(2).max(100)).max(3).optional(),
  informationNeeded: z.array(z.enum(informationFields)).min(1).max(9),
  sourcePreferences: z.array(z.enum(sourceTypes)).min(1).max(5).optional(), maxSources: z.number().int().min(1).max(4).default(3),
}).strict();
export type ResearchInput = z.infer<typeof researchInputSchema>;
export const researchEntitySchema = z.object({ id: z.guid(), name: z.string().min(1).max(160), type: z.literal('hospital'), location: z.string().max(80) }).strict();
export const researchSourceSchema = z.object({
  id: z.guid(), entityId: z.guid(), sourceKind: z.literal('external_source'), url: z.url().max(500), title: z.string().min(1).max(200),
  domain: z.string().max(100), retrievedAt: z.iso.datetime(), publishedAt: z.iso.datetime().optional(),
  sourceType: z.enum(sourceTypes), authorityLevel: z.number().int().min(1).max(5),
  freshness: z.enum(['current-source', 'source-date-known', 'source-date-unknown', 'potentially-stale']),
}).strict();
export const researchFindingSchema = z.object({
  id: z.guid(), sourceKind: z.literal('external_source'), entity: researchEntitySchema, field: z.enum(informationFields),
  value: z.string().min(1).max(240), sourceIds: z.array(z.guid()).min(1).max(4),
  evidence: z.array(z.object({ sourceId: z.guid(), snippet: z.string().min(1).max(240), extractedField: z.enum(informationFields) }).strict()).min(1).max(4),
  status: z.enum(['supported', 'conflicting', 'unclear', 'not_found', 'potentially_stale']),
  price: z.object({ amount: z.number().positive().max(100000000), currency: z.enum(['INR', 'USD', 'GBP', 'EUR']),
    refersTo: z.string().min(1).max(120), kind: z.enum(['starting_price', 'package_price', 'estimate', 'published_price']), providerQuote: z.literal(false) }).strict().optional(),
}).strict();
export const researchResultSchema = z.object({
  query: z.string().max(240), sourceKind: z.literal('external_source'), reason: z.enum(['current_information_missing', 'catalog_empty', 'requested_field_missing']),
  status: z.enum(['completed', 'partial', 'not_found', 'failed']), findings: z.array(researchFindingSchema).max(24), sources: z.array(researchSourceSchema).max(4),
  conflicts: z.array(z.object({ entityId: z.guid(), field: z.enum(informationFields), findingIds: z.array(z.guid()).min(2).max(8),
    explanation: z.string().max(300) }).strict()).max(12),
  missingInformation: z.array(z.string().max(240)).max(30), warnings: z.array(z.string().max(240)).max(10), retrievedAt: z.iso.datetime(),
}).strict().superRefine((result, ctx) => {
  const sources = new Map(result.sources.map(s => [s.id, s]));
  if (sources.size !== result.sources.length || new Set(result.sources.map(s => s.url)).size !== result.sources.length)
    ctx.addIssue({ code: 'custom', message: 'Sources must have unique IDs and URLs' });
  for (const s of result.sources) {
    const url = new URL(s.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== s.domain || s.authorityLevel !== sourceTypes.indexOf(s.sourceType) + 1 || s.freshness === 'current-source'
      || s.freshness === 'source-date-known' && !s.publishedAt)
      ctx.addIssue({ code: 'custom', message: 'Invalid source identity, hierarchy or freshness' });
  }
  const ids = new Set(result.findings.map(f => f.id));
  if (ids.size !== result.findings.length) ctx.addIssue({ code: 'custom', message: 'Findings must be unique' });
  for (const f of result.findings) if (f.sourceIds.some(id => !sources.has(id) || sources.get(id)!.entityId !== f.entity.id)
    || f.evidence.some(e => !f.sourceIds.includes(e.sourceId) || e.extractedField !== f.field)
    || f.sourceIds.some(id => !f.evidence.some(e => e.sourceId === id))) ctx.addIssue({ code: 'custom', message: 'Every fact needs linked evidence for its entity and field' });
  for (const c of result.conflicts) if (c.findingIds.some(id => !ids.has(id) || !result.findings.some(f => f.id === id && f.entity.id === c.entityId && f.field === c.field && f.status === 'conflicting')))
    ctx.addIssue({ code: 'custom', message: 'Conflicts must preserve their actual findings' });
});
export type ResearchResult = z.infer<typeof researchResultSchema>;
export type ResearchFinding = z.infer<typeof researchFindingSchema>;
export type ResearchSource = z.infer<typeof researchSourceSchema>;
export type ResearchReason = ResearchResult['reason'];
export interface ResearchAuthorization { input: ResearchInput; reason: ResearchReason; internalToolCompleted: boolean }
