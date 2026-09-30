import type { CatalogSnapshot } from '@/types/catalog';
import { planningContextSchema, type CarePlan, type Finding } from '@/lib/agents/schemas';
import { resolvePlanningContext } from '@/lib/agents/treatment-planning/context';
import { legacyBudget } from '@/lib/requirements/RequirementNormalizer';
import type { CompoundRequest } from './CompoundRequest';

export function compoundContext(content: string, request: CompoundRequest, snapshot: CatalogSnapshot, active?: CarePlan, caseContext?: Record<string, unknown>) {
  const previous = resolvePlanningContext(content, snapshot, active, caseContext);
  const procedure = request.requirements.find((r) => r.type === 'procedure');
  const treatment = procedure?.matchType === 'exact' ? snapshot.treatments.find((t) => t.slug === procedure.value) : undefined;
  const places = request.requirements.find((r) => r.type === 'location')?.places ?? [];
  const city = places.find((p) => p.type === 'city')?.value;
  const country = places.find((p) => p.type === 'country')?.value;
  return planningContextSchema.parse({ ...previous, requirements: request.requirements, compoundRequest: request,
    treatmentSlug: treatment?.slug ?? previous.treatmentSlug, treatmentName: treatment?.name ?? previous.treatmentName, treatmentId: treatment?.recordId ?? previous.treatmentId,
    city: city ?? (country ? undefined : previous.city), country: country ?? previous.country,
    budget: legacyBudget(request.requirements),
    requestedTargets: request.operations.flatMap((op) => op.type === 'discover_hospitals' ? ['hospitals'] : op.type === 'discover_packages' ? ['packages'] : op.type === 'discover_doctors' ? ['doctors'] : op.type === 'discover_services' ? ['services'] : []),
  });
}

/** Association comes from the published package/hospital join, never from names or model output. */
export function associatePackages(findings: Finding[], snapshot: CatalogSnapshot): Finding[] {
  return findings.map((finding) => {
    if (finding.kind !== 'packages') return finding;
    const pkg = snapshot.packages.find((p) => p.recordId === finding.provenance.recordId && p.slug === finding.slug);
    const hospital = pkg && snapshot.hospitals.find((h) => h.slug === pkg.hospitalSlug);
    return hospital ? { ...finding, facts: { ...finding.facts, hospitalId: hospital.recordId, hospitalSlug: hospital.slug, hospitalName: hospital.name, city: hospital.city } } : finding;
  });
}
