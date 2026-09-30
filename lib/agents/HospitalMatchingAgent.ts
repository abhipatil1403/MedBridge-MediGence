import { z } from 'zod';
import type { CatalogSnapshot } from '@/types/catalog';
import { requirementsSchema, packageAttributes, type RequirementEvaluation } from '@/lib/requirements/RequirementTypes';
import { RequirementEvaluator } from '@/lib/requirements/RequirementEvaluator';
import { operationTypeSchema } from '@/lib/orchestration/CompoundRequest';
import { associatePackages } from '@/lib/orchestration/ContextMerger';
import { hospitalMatchSchema, type Finding, type HospitalMatch } from './schemas';

/** Treatment, location, budget and requested services/features have one representation: requirements. */
export const hospitalMatchingInputSchema = z.object({ requirements: requirementsSchema,
  requestedOperations: z.array(operationTypeSchema).min(1).max(6),
}).strict().refine((input) => input.requestedOperations.includes('discover_hospitals'), 'Hospital matching requires hospital discovery')
  .refine((input) => new Set(input.requestedOperations).size === input.requestedOperations.length
    && new Set(input.requirements.map((r) => r.id)).size === input.requirements.length, 'Operation and requirement IDs must be unique');
export type HospitalMatchingInput = z.infer<typeof hospitalMatchingInputSchema>;

export function needsLinkedPackages(input: HospitalMatchingInput) {
  return input.requestedOperations.includes('discover_packages') || input.requirements.some((r) =>
    r.type === 'budget' || r.type === 'price' || r.type === 'duration' || r.type === 'package' || (packageAttributes as readonly string[]).includes(r.type));
}

type Classification = HospitalMatch['classification'];
function classify(evaluations: RequirementEvaluation[], related: boolean, incomplete: boolean): Classification {
  const applicable = evaluations.filter((e) => e.status !== 'not_applicable');
  if (applicable.some((e) => e.status === 'not_met')) return 'does_not_match';
  if (incomplete || applicable.some((e) => ['budget', 'price', 'duration'].includes(e.type) && ['unknown', 'incomplete'].includes(e.status))) return 'insufficient_evidence';
  if (!related && applicable.length && applicable.every((e) => e.status === 'exact' && e.evidence.length)) return 'strong_match';
  return applicable.some((e) => ['exact', 'related'].includes(e.status)) ? 'partial_match' : 'insufficient_evidence';
}
const tier: Record<Classification, number> = { strong_match: 0, partial_match: 1, insufficient_evidence: 2, does_not_match: 4 };
function score(classification: Classification, evaluations: RequirementEvaluation[], related = false) {
  return { tier: classification === 'does_not_match' ? 4 : related ? 3 : tier[classification], exact: evaluations.filter((e) => e.status === 'exact').length };
}

/** Deterministic evidence coordination. Retrieval and comparison remain in the compound executor. */
export const HospitalMatchingAgent = {
  match(rawInput: HospitalMatchingInput, hospitals: Finding[], packages: Finding[], snapshot: CatalogSnapshot,
    searchCompletion: boolean | ReadonlyMap<string, boolean> = true): HospitalMatch[] {
    const input = hospitalMatchingInputSchema.parse(rawInput);
    const packageRequired = needsLinkedPackages(input);
    const sourcedPackages = associatePackages(packages.filter((f) => snapshot.packages.some((p) =>
      p.recordId === f.provenance.recordId && p.slug === f.slug)), snapshot);
    const results = hospitals.filter((f) => f.kind === 'hospitals' && snapshot.hospitals.some((h) =>
      h.recordId === f.provenance.recordId && h.slug === f.slug)).map((finding): HospitalMatch => {
      const packageSearchComplete = typeof searchCompletion === 'boolean' ? searchCompletion : searchCompletion.get(finding.provenance.recordId) ?? false;
      const hospital = { ...finding, requirementEvaluation: RequirementEvaluator.evaluate(finding, input.requirements, snapshot) };
      const linkedPackages = sourcedPackages.filter((p) => p.kind === 'packages' && p.facts.hospitalId === hospital.provenance.recordId)
        .map((finding) => {
          const pkg = { ...finding, requirementEvaluation: RequirementEvaluator.evaluate(finding, input.requirements, snapshot) };
          return { package: pkg, classification: classify(pkg.requirementEvaluation.evaluations, pkg.matchType === 'related', false) };
        }).sort((a, b) => {
          const x = score(a.classification, a.package.requirementEvaluation!.evaluations, a.package.matchType === 'related');
          const y = score(b.classification, b.package.requirementEvaluation!.evaluations, b.package.matchType === 'related');
          return x.tier - y.tier || y.exact - x.exact;
        });
      // Choose one complete combination; never borrow price from one package and features from another.
      const evidencePackage = linkedPackages[0]?.package;
      const criteria = hospital.requirementEvaluation.evaluations.map((evaluation) => {
        const linked = evidencePackage?.requirementEvaluation?.evaluations.find((e) => e.requirementId === evaluation.requirementId);
        if (evaluation.status !== 'not_applicable') {
          // Shared treatment/location must hold for both records in a hospital/package combination.
          if (evaluation.status === 'exact' && linked && !['exact', 'not_applicable'].includes(linked.status))
            return { evaluation: linked, level: 'package' as const, source: evidencePackage!.provenance };
          return { evaluation, level: 'hospital' as const, source: hospital.provenance };
        }
        return { evaluation: linked ?? { ...evaluation, status: packageSearchComplete ? 'unknown' as const : 'incomplete' as const,
          evidence: [], sourceFields: [], explanation: packageSearchComplete ? 'No sourced linked package is available to evaluate this requested criterion.' : 'Linked package retrieval is incomplete; this criterion cannot yet be confirmed.' },
        level: 'package' as const, source: evidencePackage?.provenance };
      });
      const evaluations = criteria.map((c) => c.evaluation);
      return hospitalMatchSchema.parse({ hospital, linkedPackages, criteria,
        classification: classify(evaluations, hospital.matchType === 'related', packageRequired && (!evidencePackage || !packageSearchComplete)),
        evidencePackageId: evidencePackage?.provenance.recordId, packageSearchComplete, packageEvidenceRequested: packageRequired,
        fulfilledRequirements: evaluations.filter((e) => e.status === 'exact').map((e) => e.requirementId),
        failedRequirements: evaluations.filter((e) => e.status === 'not_met').map((e) => e.requirementId),
        missingInformation: evaluations.filter((e) => ['unknown', 'incomplete', 'related'].includes(e.status)).map((e) => e.requirementId) });
    });
    return results.sort((a, b) => {
      const x = score(a.classification, a.criteria.map((c) => c.evaluation), a.hospital.matchType === 'related');
      const y = score(b.classification, b.criteria.map((c) => c.evaluation), b.hospital.matchType === 'related');
      return x.tier - y.tier || y.exact - x.exact;
    });
  },
};

export function hospitalMatchSummary(matches: HospitalMatch[]) {
  if (!matches.length) return 'No sourced hospital record was found for the requested criteria.';
  return matches.slice(0, 5).map((m) => `${m.hospital.title}: ${m.classification.replaceAll('_', ' ')}. `
    + `Documented: ${m.criteria.filter((c) => c.evaluation.status === 'exact').map((c) => c.evaluation.label).join(', ') || 'none'}. `
    + m.criteria.filter((c) => c.evaluation.status !== 'exact').map((c) => `${c.evaluation.label}: ${c.evaluation.status.replaceAll('_', ' ')}${c.level === 'package' ? ' (package level)' : ''}.`).join(' ')
  ).join(' ');
}
