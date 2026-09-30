import { randomUUID } from 'node:crypto';
import { comparisonSchema, type ComparisonRequest, type Finding, type PlanningResultGroup } from '../schemas';
import { comparisonSummary, missingFields } from './format';

/** Compare existing sourced records. No discovery, entity parsing, model call, or clinical ranking. */
export function compareCandidates(request: ComparisonRequest, groups: PlanningResultGroup[][]) {
  const records = [...new Map(groups.flat(2).flatMap((g) => g.findings).map((f) => [f.provenance.recordId, f])).values()];
  const limitations = ['Catalog records do not establish medical suitability, quality, outcomes, or current availability.',
    'Listed sample prices are not provider quotes.',
    ...(records.some((f) => f.provenance.sourceKind === 'synthetic') ? ['Synthetic records are demo data.'] : [])];
  if (request.options.length === 2 && request.subject) {
    const comparison = comparisonSchema.parse({ id: randomUUID(), request, sides: request.options.map((option, index) => ({ option,
      groups: groups[index], missingFields: missingFields(groups[index]) })), sources: records.map((f) => f.provenance), limitations, createdAt: new Date().toISOString() });
    return { comparison, summary: comparisonSummary(comparison), complete: groups.every((side) => side.every((g) => g.status === 'completed')) };
  }
  const hospitals = records.filter((f) => f.kind === 'hospitals');
  const packages = records.filter((f) => f.kind === 'packages');
  const incomplete = groups.flat().some((g) => g.status !== 'completed');
  const hospitalLimit = request.targets.includes('hospitals') && hospitals.length < 2
    ? hospitals.length === 1 ? "I found one matching hospital in the current catalog, so there isn't a second sourced hospital to compare against yet."
      : 'There are no sourced hospital candidates to compare.' : '';
  const packageLimit = request.targets.includes('packages') && packages.length < 2
    ? packages.length === 1 ? 'Only one linked package is available; its documented attributes are shown for review.'
      : 'No sourced packages are available for package comparison.' : '';
  const differences = packages.length >= 2 ? describePackageDifferences(packages) : '';
  const hospitalDetails = hospitals.length >= 2 ? hospitals.slice(0, 5).map((f) => `${f.title}: ${f.facts.city ?? 'city not documented'}; ${f.facts.verification ?? 'verification not documented'}.`).join(' ') : '';
  return { comparison: undefined, summary: [hospitalLimit, packageLimit, hospitalDetails, differences,
    incomplete ? 'Comparison is incomplete because some searches could not finish.' : '',
    'The documented records do not establish a clinical winner.'].filter(Boolean).join(' ').slice(0, 1600),
  complete: !incomplete && request.targets.every((target) => records.filter((f) => f.kind === target).length >= 2) };
}

export function describePackageDifferences(packages: Finding[]) {
  return packages.slice(0, 5).map((f) => `${f.title}: ${typeof f.facts.samplePriceUsd === 'number' && f.facts.samplePriceUsd > 0
    ? `listed sample USD ${f.facts.samplePriceUsd.toLocaleString('en-US')}` : 'price not documented'}${typeof f.facts.durationDays === 'number' && f.facts.durationDays > 0 ? `; listed duration ${f.facts.durationDays} days` : ''}.`).join(' ');
}
