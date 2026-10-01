import { z } from 'zod';
import { researchFindingSchema, researchSourceSchema, type ResearchResult } from '@/lib/research/schemas';
import { requirementEvaluationSchema, type Requirement } from '@/lib/requirements/RequirementTypes';
import { evaluateExternalEvidence } from '@/lib/requirements/external-evidence';

export const researchComparisonSchema = z.object({ sourceKind: z.literal('model_derived'), createdAt: z.iso.datetime(),
  sides: z.array(z.object({ entityId: z.guid(), name: z.string().max(160), findings: z.array(researchFindingSchema).max(24),
    missingInformation: z.array(z.string().max(240)).max(30), requirements: z.array(requirementEvaluationSchema).max(30) }).strict()).max(3),
  sources: z.array(researchSourceSchema).max(4), complete: z.boolean(), limitations: z.array(z.string().max(300)).max(5),
}).strict();
/** Comparison Agent consumes structured research without projecting it into catalog records. */
export function compareResearchEvidence(result: ResearchResult, requirements: Requirement[] = []) {
  const topic = ['knee replacement', 'hip replacement', 'orthopedics'].find(t => result.query.toLowerCase().startsWith(`${t} `));
  const scopedRequirements = requirements.map(req => req.type === 'procedure' && topic && req.originalExpression.toLowerCase().includes(topic)
    ? { ...req, value: topic.replaceAll(' ', '-'), label: topic.replace(/\b[a-z]/g, c => c.toUpperCase()), matchType: 'exact' as const } : req);
  const entities = [...new Map(result.findings.map(f => [f.entity.id, f.entity])).values()];
  return researchComparisonSchema.parse({ sourceKind: 'model_derived', createdAt: result.retrievedAt,
    sides: entities.slice(0, 3).map(entity => ({ entityId: entity.id, name: entity.name, findings: result.findings.filter(f => f.entity.id === entity.id),
      missingInformation: result.missingInformation.filter(g => g.startsWith(`${entity.name}:`)), requirements: evaluateExternalEvidence(result, entity.id, scopedRequirements) })),
    sources: result.sources, complete: entities.length >= 2 && result.status === 'completed' && !result.conflicts.length,
    limitations: ['External statements remain attributed to their sources; they are not MedBridge catalog verification.',
      'Missing prices do not imply a more expensive provider. Conflicting amounts are not averaged or ranked.',
      'Retrieval date does not establish currentness. No quality, outcomes or clinical suitability ranking is provided.'] });
}
