import { EntityMatcher } from '@/lib/discovery/entity-matcher';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { normalize } from '@/lib/discovery/normalize';
import type { CatalogSnapshot } from '@/types/catalog';
import { comparisonRequestSchema, type CarePlan, type ComparisonRequest } from '../schemas';

export function latestComparisonRequest(plan?: CarePlan) {
  return [...plan?.tasks ?? []].reverse().filter((task) => task.status !== 'cancelled' && task.comparisonRequest)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.comparisonRequest;
}

export function isComparisonRequest(content: string, plan?: CarePlan) {
  const text = normalize(content);
  // A one-destination request to compare already found hospitals remains planning.
  const explicit = /\b(compare|comparison|versus|vs)\b/.test(text) || /\bbetween\b.+\band\b/.test(text);
  const price = /\bwhich\b.*\b(cheaper|lower|lowest)\b.*\b(package|cost|price)\b/.test(text);
  const pending = plan?.tasks.some((task) => task.comparisonRequest && task.status === 'awaiting_user');
  return explicit || price || Boolean(latestComparisonRequest(plan) && /\b(budget|cheaper|lower listed|these two|both options)\b/.test(text))
    || Boolean(pending && !/\b(i need|i want|find|show|plan)\b/.test(text));
}

export function normalizeComparison(content: string, snapshot: CatalogSnapshot, active?: CarePlan) {
  const previous = latestComparisonRequest(active);
  const marker = /\b(compare|comparison|which)\b/i.exec(content);
  const clause = marker ? content.slice(marker.index) : content;
  const text = clause.replace(/\b(?:with|within|under)\b[^.!?]*\bbudget\b[^.!?]*|\b(?:my\s+)?budget\b[^.!?]*$/gi, '').replace(/[.!?]+$/, '');
  const locations = EntityMatcher.locations(text, snapshot);
  const cities = locations.filter((option) => option.type === 'city');
  const ordered = cities.length >= 2 ? cities : locations;
  const referential = /\b(it|this|that|these|those|cheaper|lower|lowest)\b/i.test(clause) || !/\b(compare|comparison|versus|vs)\b/i.test(clause);
  let options = ordered.slice(0, 2);
  if (options.length === 1 && /\b(?:it|this|that)\s+with\b/i.test(clause)) {
    const original = active?.context.city ? { type: 'city' as const, value: active.context.city, label: active.context.city }
      : active?.context.country ? { type: 'country' as const, value: active.context.country,
        label: snapshot.countries.find((item) => item.slug === active.context.country)?.name ?? active.context.country } : previous?.options[0];
    if (original && original.value !== options[0].value) options = [original, options[0]];
  } else if (!options.length && referential && previous) options = previous.options;
  else if (options.length === 1 && referential && previous?.options.length === 1 && previous.options[0].value !== options[0].value) options = [previous.options[0], options[0]];

  const explicitTargets: ComparisonRequest['targets'] = [];
  if (/\bhospitals?|clinics?\b/i.test(text)) explicitTargets.push('hospitals');
  if (/\bpackages?|bundles?\b/i.test(text)) explicitTargets.push('packages');
  if (/\bdoctors?|cardiologists?|specialists?|oncologists?|neurologists?\b/i.test(text)) explicitTargets.push('doctors');
  let subjectText = text.replace(/^(?:compare|comparison(?: of)?|which)\s+/i, '');
  const afterFor = /\bfor\s+(.+?)(?=\s+(?:in|at|between|with)\b|,|$)/i.exec(subjectText)?.[1];
  if (afterFor) subjectText = afterFor;
  else subjectText = subjectText.split(/\s+(?:in|at|between|with)\s+/i)[0];
  // Location-first comparisons without "for" contain no implied subject.
  for (const option of ordered) subjectText = subjectText.replace(new RegExp(`\\b${normalize(option.label).replace(/ /g, '\\s+')}\\b`, 'gi'), '');
  subjectText = subjectText.replace(/\b(hospitals?|clinics?|packages?|bundles?|doctors?|compare|comparison|versus|vs|and|or)\b/gi, ' ').trim();
  const normalized = QueryNormalizer.normalize(`Find treatments for ${subjectText}`, snapshot);
  const treatment = snapshot.treatments.find((item) => item.slug === normalized.entities.procedure);
  let subject: ComparisonRequest['subject'] = treatment ? { type: 'treatment', value: treatment.name, slug: treatment.slug, matchType: 'exact' }
    : normalized.entities.procedureMatchType === 'related' || normalized.entities.procedureMatchType === 'none'
      ? { type: 'treatment', value: normalized.entities.procedurePhrase ?? subjectText, matchType: normalized.entities.procedureMatchType, relatedSlug: normalized.entities.relatedProcedure }
      : undefined;
  if (!subject) {
    const entities = EntityMatcher.match(text, snapshot);
    if (entities.specialty) subject = { type: 'specialty', value: entities.specialty, matchType: 'exact' };
    else if (referential) subject = previous?.subject ?? (active?.context.treatmentSlug
      ? { type: 'treatment', value: active.context.treatmentName ?? active.context.treatmentSlug, slug: active.context.treatmentSlug, matchType: 'exact' }
      : active?.context.specialty ? { type: 'specialty', value: active.context.specialty, matchType: 'exact' } : undefined);
    else if (explicitTargets.length === 1 && explicitTargets[0] === 'hospitals') subject = { type: 'catalog', value: 'Hospitals', matchType: 'exact' };
  }
  const targets = explicitTargets.length ? explicitTargets : referential && previous ? previous.targets
    : subject?.type === 'specialty' ? ['doctors' as const] : ['hospitals' as const, 'packages' as const];
  const budgetMatch = /\bbudget\s+(?:is\s+)?(?:around\s+|about\s+|up to\s+)?(\$|usd|₹|inr|rs\.?)\s*([\d,]+(?:\.\d+)?)|(\$|usd|₹|inr|rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(?:budget)?/i.exec(content);
  const amount = budgetMatch ? Number((budgetMatch[2] ?? budgetMatch[4]).replaceAll(',', '')) : undefined;
  const currency = budgetMatch?.[1] ?? budgetMatch?.[3];
  const budget = amount && amount <= 100000000 ? { amount, currency: /₹|inr|rs/i.test(currency!) ? 'INR' as const : 'USD' as const, source: 'user' as const }
    : referential ? previous?.budget ?? active?.context.budget : undefined;
  const request = comparisonRequestSchema.parse({ intent: 'comparison', subject, options, targets, budget,
    focus: /\b(cheaper|lower|lowest)\b/i.test(clause) ? 'package_price' : 'catalog' });
  const question = ordered.length > 2 ? 'Which two cities or countries would you like to compare?'
    : !subject ? options.length === 2 ? `What would you like to compare between ${options[0].label} and ${options[1].label}?` : 'What treatment or specialty would you like to compare?'
      : options.length === 0 ? 'Which locations or countries would you like to compare?'
        : options.length === 1 ? `Which second city or country would you like to compare with ${options[0].label}?` : null;
  return { request, question };
}
