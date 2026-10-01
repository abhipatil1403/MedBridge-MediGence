import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { EntityMatcher } from '@/lib/discovery/entity-matcher';
import { extractBudget } from './RequirementNormalizer';
import { requirementsSchema, type Requirement } from './RequirementTypes';
import { normalize } from '@/lib/discovery/normalize';

export const attributePatterns: Record<string, RegExp> = {
  accommodation: /\baccommodation\b/i, hotel: /\bhotels?\b/i, hospital_stay: /\bhospital stay\b/i,
  flights: /\bflights?\b/i, visa: /\bvisa\b/i, airport_transfer: /\bairport transfers?\b/i,
  interpreter: /\binterpreters?\b/i, meals: /\bmeals?\b/i, local_transport: /\blocal transport\b/i,
  follow_up: /\bfollow[- ]?up\b/i, consultation: /\bconsultation\b/i, diagnostics: /\bdiagnostics?\b/i,
  rehabilitation: /\brehabilitation\b/i, nursing_care: /\bnursing(?:[\/ ]care)?\b|\bcare support\b/i,
  companion_accommodation: /\bcompanion accommodation\b/i,
};

export const RequirementExtractor = {
  extract(content: string, snapshot: CatalogSnapshot, previous: Requirement[] = []): Requirement[] {
    const result = new Map(previous.map((item) => [item.id, item]));
    // Reuse the discovery entity normalizer, excluding constraint clauses from the procedure name.
    const core = content.split(/[.!?]/)[0].replace(/,?\s+(?:under|below|within|less than|maximum|budget|with|and I want)\b.*$/i, '').replace(/\s+treatment(?=\s+(?:in|at|near)\b|$)/i, '');
    const entities = QueryNormalizer.normalize(core, snapshot).entities;
    const put = (type: Requirement['type'], label: string, extra: Partial<Requirement> = {}) => result.set(type, { id: type, type, label, required: true, originalExpression: content, ...extra });
    if (entities.procedure || entities.procedurePhrase && ['related', 'none'].includes(entities.procedureMatchType)) {
      const value = entities.procedure ?? entities.procedurePhrase!;
      put('procedure', snapshot.treatments.find((item) => item.slug === value)?.name ?? value, { value, matchType: entities.procedureMatchType === 'unspecified' ? 'none' : entities.procedureMatchType });
    }
    const places = EntityMatcher.locations(content, snapshot);
    const cities = places.filter((place) => place.type === 'city');
    if (places.length) put('location', (cities.length ? cities : places).map((p) => p.label).join(' or '), { places: cities.length ? cities : places });
    const duration = /\b(under|below|less than|within|at most|up to|over|above|more than|at least|exactly)\s+(\d+)\s+days\b/i.exec(content);
    const budget = extractBudget(duration ? content.replace(duration[0], '') : content); if (budget) result.set('budget', budget);
    if (duration || /\bduration\b/i.test(content)) {
      const n = duration ? Number(duration[2]) : undefined;
      const operator = duration ? /^(under|below|less than)$/i.test(duration[1]) ? 'lt' : /^(over|above|more than)$/i.test(duration[1]) ? 'gt'
        : /^at least$/i.test(duration[1]) ? 'gte' : /^exactly$/i.test(duration[1]) ? 'eq' : 'lte' : undefined;
      put('duration', duration?.[0] ?? 'Package duration', { operator, ...(n === undefined ? {} : operator === 'eq' ? { minimum: n, maximum: n }
        : operator === 'gt' || operator === 'gte' ? { minimum: n } : { maximum: n }) });
      if (!result.has('package')) put('package', 'Package', { desired: true });
    }
    if (/\b(no|remove|drop)\s+(?:the\s+)?budget\b/i.test(content)) result.delete('budget');
    if (/\b(?:cost|price|pricing)\b/i.test(content) && !result.has('budget')) put('price', 'Listed sample price');
    if (!result.has('package') && /\bpackages?|bundles?\b/i.test(content) && !/^\s*tell me(?: more)? about\b|\bits package|\b(?:this|that|the) package|\b(?:first|second|third) package/i.test(content)) put('package', 'Package', { desired: true });
    if (/\bverified (?:hospital|provider|doctor)\b/i.test(content)) put('verified', 'Verified provider');
    const preferredHospital = snapshot.hospitals.find((item) => /\bprefer|\bat\b/i.test(content) && content.toLowerCase().includes(item.name.toLowerCase()));
    if (preferredHospital) put('hospital', preferredHospital.name, { value: preferredHospital.slug });
    if (/\bclinical suitability|medically suitable\b/i.test(content)) put('clinical_suitability', 'Clinical suitability');
    if (entities.specialty && (/\bdoctor|specialist|cardiologist|oncologist|neurologist\b/i.test(content)
      || /\bhospitals?\b/i.test(content) && normalize(content).includes(normalize(entities.specialty))
      || /\bpackages?\b/i.test(content) && !entities.procedure))
      put('specialty', entities.specialty, { value: entities.specialty });
    if (/\bservices?|support|help with\b/i.test(content)) for (const service of snapshot.services)
      if ([service.name, ...service.aliases].some((name) => normalize(content).includes(normalize(name))))
        result.set(`service:${service.slug}`, { id: `service:${service.slug}`, type: 'service', label: service.name, required: true,
          value: service.slug, originalExpression: content });
    const attrsText = content.replace(/\bcompanion accommodation\b/gi, 'companion_accommodation');
    for (const [type, pattern] of Object.entries(attributePatterns)) if (pattern.test(type === 'companion_accommodation' ? content : attrsText)) {
      const term = pattern.exec(content)![0];
      const before = content.slice(0, pattern.exec(content)!.index);
      if (/\b(?:remove|drop|ignore)\s+(?:the\s+)?$/i.test(before) || /\bno longer (?:need|require)\s+$/i.test(before)) result.delete(type);
      else put(type as Requirement['type'], term[0].toUpperCase() + term.slice(1), { desired: !/\b(?:without|no)\s+$/i.test(before) });
    }
    // Travel/recovery inclusions imply a package search, never confirmed inclusions.
    if ([...result.values()].some((item) => item.type in attributePatterns && item.type !== 'consultation' || item.type === 'consultation' && /\bpackage\b/i.test(content))) {
      if (!result.has('package')) put('package', 'Package', { desired: true });
    }
    return requirementsSchema.parse([...result.values()]);
  },
};
