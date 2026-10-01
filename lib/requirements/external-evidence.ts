import type { ResearchFinding, ResearchResult } from '@/lib/research/schemas';
import type { Requirement, RequirementEvaluation } from './RequirementTypes';

/** External evidence never updates catalog verification or a catalog requirement result. */
export function evaluateExternalEvidence(result: ResearchResult, entityId: string, requirements: Requirement[]): RequirementEvaluation[] {
  const fields: Record<string, ResearchFinding['field']> = { procedure: 'treatment_availability', package: 'package_information', budget: 'published_pricing', price: 'published_pricing',
    location: 'location', service: 'services', accommodation: 'accommodation', hotel: 'accommodation' };
  return requirements.map(req => {
    const field = fields[req.type];
    const matches = result.findings.filter(f => f.entity.id === entityId && f.field === field);
    let status: RequirementEvaluation['status'] = 'unknown', explanation = 'Not established in the researched sources. Absence is not a negative claim.';
    const supported = matches.filter(f => f.status === 'supported');
    if (matches.some(f => f.status === 'conflicting')) explanation = 'Conflicting external evidence; the requirement remains unknown.';
    else if (supported.length && ['accommodation', 'hotel'].includes(req.type)) {
      if (supported.some(f => /not included|excluded|available separately|additional charge/i.test(f.value))) {
        status = 'not_met'; explanation = 'The source explicitly states a separate or excluded service; this does not satisfy package inclusion.';
      } else if (supported.some(f => /(?:package[^.]*includes?[^.]*accommodation|accommodation[^.]*included in[^.]*package)/i.test(f.value))) {
        status = 'exact'; explanation = 'The source explicitly states package inclusion.';
      }
    } else if (supported.length && ['price', 'budget'].includes(req.type)) {
      const p = supported.find(f => f.price?.currency === req.currency && f.price?.kind === 'package_price')?.price;
      if (p && req.maximum !== undefined) {
        const within = req.operator === 'lt' ? p.amount < req.maximum : p.amount <= req.maximum;
        status = within ? 'exact' : 'not_met'; explanation = 'Compared the stated package price in the original currency only; it remains a published price, not a quote.';
      } else explanation = 'No comparable final package price in the requested currency. Starting prices, ranges and estimates do not establish a final budget.';
    } else if (supported.length && req.type === 'procedure' && req.value && supported.some(f => f.value.toLowerCase().includes(req.value!.replaceAll('-', ' ').toLowerCase()))) {
      status = 'exact'; explanation = 'Provider source explicitly mentions the requested treatment; no medical suitability is inferred.';
    } else if (supported.length && req.type === 'location' && req.places?.some(p => supported.some(f => f.value.toLowerCase().includes(p.value.toLowerCase())))) {
      status = 'exact'; explanation = 'Location is stated by the source.';
    } else if (supported.length && req.type === 'package') {
      status = 'related'; explanation = 'A package is mentioned; requested contents and price still need their own evidence.';
    }
    return { requirementId: req.id, type: req.type, label: req.type === 'price' ? 'Published price' : req.label, requestedValue: req, status,
      evidence: matches.map(f => f.value).slice(0, 20), sourceFields: [...new Set(matches.flatMap(f => f.sourceIds))].slice(0, 10), explanation };
  });
}
