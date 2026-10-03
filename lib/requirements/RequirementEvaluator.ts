import type { CatalogSnapshot, CatalogRecord, Package } from '@/types/catalog';
import type { Finding } from '@/lib/agents/schemas';
import { normalize } from '@/lib/discovery/normalize';
import { attributeEvidence } from './RequirementEvidence';
import { packageAttributes, resultRequirementEvaluationSchema, type Requirement, type RequirementEvaluation } from './RequirementTypes';

export const RequirementEvaluator = {
  evaluate(finding: Finding, requirements: Requirement[], snapshot: CatalogSnapshot) {
    const records = snapshot[finding.kind as keyof CatalogSnapshot] as readonly CatalogRecord[] | undefined;
    const record = records?.find((item) => item.recordId === finding.provenance.recordId && item.slug === finding.slug);
    const evaluations = requirements.map((requirement): RequirementEvaluation => {
      const base = { requirementId: requirement.id, type: requirement.type, label: requirement.label, requestedValue: requirement };
      const result = (status: RequirementEvaluation['status'], explanation: string, evidence: string[] = [], sourceFields: string[] = []) => ({ ...base, status, explanation, evidence, sourceFields });
      const type = requirement.type;
      const applicable = type === 'budget' || type === 'price' || type === 'duration' || type === 'package' || (packageAttributes as readonly string[]).includes(type) ? finding.kind === 'packages'
        : type === 'verified' || type === 'hospital' ? ['hospitals', 'doctors', 'packages'].includes(finding.kind)
          : type === 'procedure' ? ['treatments', 'hospitals', 'doctors', 'packages'].includes(finding.kind)
            : type === 'specialty' ? ['doctors', 'hospitals', 'treatments'].includes(finding.kind)
              : type === 'location' ? finding.kind !== 'treatments' && finding.kind !== 'services' : true;
      if (!applicable) return result('not_applicable', 'This requirement does not apply to this catalog entity type.');
      if (!record) return result('unknown', 'No current published catalog record verifies this result identity.');
      const item = record as unknown as Record<string, unknown>;
      if (type === 'clinical_suitability') return result('unknown', 'Catalog availability cannot establish clinical suitability; a clinician must assess it.');
      if (type === 'service') return result('unknown', 'A general service catalog entry does not document availability at this hospital. No hospital-specific service association is published.');
      if (type === 'package') return result('exact', 'This is a published catalog package; its requested features are evaluated separately.', [record.name], ['packages']);
      if (type === 'duration') {
        const days = item.durationDays;
        if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return result('unknown', 'The package duration is not documented.', [], ['durationDays']);
        const matches = (requirement.minimum === undefined || (requirement.operator === 'gt' ? days > requirement.minimum : days >= requirement.minimum))
          && (requirement.maximum === undefined || (requirement.operator === 'lt' ? days < requirement.maximum : days <= requirement.maximum));
        return result(matches ? 'exact' : 'not_met', `The documented ${days}-day package duration ${matches ? 'meets' : 'does not meet'} the requested duration criterion; it does not establish recovery time.`, [`${days} days`], ['durationDays']);
      }
      if (type === 'price') {
        const price = item.listedPrice??item.samplePriceUsd;
        const currency=typeof item.currency==='string'?item.currency:'USD';
        const priceFields=item.listedPrice!==undefined?['listedPrice','currency']:['samplePriceUsd'];
        return typeof price === 'number' && Number.isFinite(price) && price > 0
          ? result('exact', `The catalog documents a ${currency} listed estimate; it is not a provider quote.`, [`${currency} ${price}`], priceFields)
          : result('unknown', 'No listed sample price is available.', [], ['samplePriceUsd']);
      }
      if ((packageAttributes as readonly string[]).includes(type)) {
        const evidence = attributeEvidence(record as Package, type);
        if (requirement.desired === false && ['exact', 'not_met'].includes(evidence.status)) return { ...base, ...evidence, status: evidence.status === 'exact' ? 'not_met' : 'exact', explanation: evidence.status === 'exact' ? 'The package includes a feature the user asked to exclude.' : 'The catalog explicitly excludes the feature the user asked to exclude.' };
        return { ...base, ...evidence };
      }
      if (type === 'budget') {
        const price = item.listedPrice??item.samplePriceUsd;
        const currency=typeof item.currency==='string'?item.currency:'USD';
        const priceFields=item.listedPrice!==undefined?['listedPrice','currency']:['samplePriceUsd'];
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return result('unknown', 'No listed sample price is available to check this budget.', [], ['samplePriceUsd']);
        if (requirement.currency !== currency) return result('unknown', `The listed price is ${currency}; the requested currency is ${requirement.currency ?? 'unspecified'}. No currency conversion was applied.`, [`${currency} ${price}`], priceFields);
        const min = requirement.minimum, max = requirement.maximum;
        const matches = (min === undefined || (requirement.operator === 'gt' ? price > min : price >= min))
          && (max === undefined || (requirement.operator === 'lt' ? price < max : price <= max));
        return result(matches ? 'exact' : 'not_met', `The listed ${currency} ${price.toLocaleString('en-US')} ${record.demo?'sample price':'estimate'} ${matches ? 'meets' : 'does not meet'} “${requirement.originalExpression}”. A listed estimate is not a provider quote.`, [`${currency} ${price}`], priceFields);
      }
      if (type === 'procedure') {
        const values = finding.kind === 'treatments' ? [record.slug] : finding.kind === 'packages' ? [item.treatmentSlug] : Array.isArray(item.treatmentSlugs) ? item.treatmentSlugs : [];
        const field = finding.kind === 'treatments' ? 'slug' : finding.kind === 'packages' ? 'treatmentSlug' : 'treatmentSlugs';
        if (finding.matchType === 'related') return result('related', 'This result was returned as related catalog information, not an exact confirmation of the requested procedure.', values.filter((v): v is string => typeof v === 'string'), [field]);
        if (requirement.matchType !== 'exact') return result('unknown', 'The requested procedure has no exact catalog identity. A broader topic is not confirmation of the requested procedure.', values.filter((v): v is string => typeof v === 'string'), [field]);
        if (!values.length) return result('unknown', 'The catalog does not list treatment links for this entity.', [], [field]);
        return result(values.includes(requirement.value) ? 'exact' : 'not_met', values.includes(requirement.value) ? 'The catalog explicitly links this record to the requested treatment; suitability is not established.' : 'The catalog treatment links do not contain the requested treatment.', values as string[], [field]);
      }
      const hospital = snapshot.hospitals.find((h) => h.slug === item.hospitalSlug);
      if (type === 'hospital') {
        const slug = finding.kind === 'hospitals' ? record.slug : item.hospitalSlug;
        return result(slug === requirement.value ? 'exact' : typeof slug === 'string' ? 'not_met' : 'unknown', 'Evaluated against the explicitly requested hospital and catalog hospital link.', typeof slug === 'string' ? [slug] : [], ['hospitalSlug']);
      }
      if (type === 'location') {
        const city = finding.kind === 'packages' ? hospital?.city : item.city;
        const country = finding.kind === 'countries' ? record.slug : item.country;
        const places = requirement.places ?? [];
        const cities = finding.kind === 'hospitals' && Array.isArray(item.locationCities) ? [city, ...item.locationCities].filter((value): value is string => typeof value === 'string') : typeof city === 'string' ? [city] : [];
        const matches = places.some((place) => place.type === 'city' ? cities.some((value) => normalize(value) === normalize(place.value)) : normalize(String(country ?? '')) === normalize(place.value));
        const known = places.some((place) => Boolean(place.type === 'city' ? city : country));
        return result(matches ? 'exact' : known ? 'not_met' : 'unknown', matches ? 'The catalog location matches a requested destination.' : known ? 'The catalog location differs from the requested destinations.' : 'The catalog does not specify the requested location field.', [...cities, country].filter((v): v is string => typeof v === 'string'), finding.kind === 'packages' ? ['hospitalSlug', 'hospitals.city', 'country'] : ['city', 'locationCities', 'country']);
      }
      if (type === 'verified') {
        const verification = finding.kind === 'packages' ? hospital?.verification : item.verification;
        const confirmed = record.sourceKind !== 'synthetic' && typeof verification === 'string' && /^(verified|provider verified)$/i.test(verification.trim());
        return result(confirmed ? 'exact' : typeof verification === 'string' && /unverified|demo/i.test(verification) ? 'not_met' : 'unknown', confirmed ? 'The catalog explicitly marks this provider verified.' : 'Provider existence and sample credentials do not establish verification.', typeof verification === 'string' ? [verification] : [], ['verification']);
      }
      if (type === 'specialty') {
        const specialties = Array.isArray(item.specialties) ? item.specialties : typeof item.specialty === 'string' ? [item.specialty] : [];
        return result(specialties.length ? specialties.some((v) => normalize(String(v)) === normalize(requirement.value ?? '')) ? 'exact' : 'not_met' : 'unknown', 'Evaluated against the explicitly listed catalog specialties.', specialties as string[], ['specialty', 'specialties']);
      }
      return result('unknown', 'No supported catalog field confirms this requirement.');
    });
    const applicable = evaluations.filter((item) => item.status !== 'not_applicable');
    const overallStatus = applicable.some((item) => item.status === 'not_met') ? 'does_not_satisfy'
      : applicable.length && applicable.every((item) => item.status === 'exact') ? 'fully_satisfies'
        : applicable.some((item) => item.status === 'exact' || item.status === 'related') ? 'partially_satisfies' : 'insufficient_evidence';
    return resultRequirementEvaluationSchema.parse({ resultId: finding.provenance.recordId, resultType: finding.kind, evaluations, overallStatus });
  },
};
