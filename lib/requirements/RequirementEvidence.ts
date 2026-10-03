import type { Package } from '@/types/catalog';
import { attributePatterns } from './RequirementExtractor';
import type { RequirementEvaluation } from './RequirementTypes';

export function attributeEvidence(record: Package, type: string): Pick<RequirementEvaluation, 'status' | 'evidence' | 'sourceFields' | 'explanation'> {
  const serviceKeys: Record<string, keyof NonNullable<Package['serviceDetails']>> = { accommodation: 'accommodation', airport_transfer: 'transfer', interpreter: 'interpreter', consultation: 'consultation', diagnostics: 'diagnostics', follow_up: 'followUp' };
  const key = serviceKeys[type];
  const detail = key ? record.serviceDetails?.[key] : undefined;
  const listed = listedAttributeEvidence(record, type);
  if (detail) {
    const status = detail.status === 'included' ? 'exact' : detail.status === 'excluded' ? 'not_met' : detail.status === 'conditional' ? 'incomplete' : 'unknown';
    if ((status === 'exact' && ['not_met', 'incomplete'].includes(listed.status)) || (status === 'not_met' && ['exact', 'incomplete'].includes(listed.status))) {
      return { status: 'incomplete', evidence: [...listed.evidence, detail.information || `Published service status: ${detail.status}.`], sourceFields: [...listed.sourceFields, `serviceDetails.${key}`], explanation: 'The published service status conflicts with listed inclusions or exclusions. Confirmation is required.' };
    }
    return { status, evidence: [detail.information || `Published package service: ${detail.status.replaceAll('_', ' ')}.`], sourceFields: [`serviceDetails.${key}`], explanation: detail.status === 'not_confirmed' ? 'Not confirmed in published package information. No inclusion has been inferred.' : 'The published package explicitly documents this service status.' };
  }
  return listed;
}
function listedAttributeEvidence(record: Package, type: string): Pick<RequirementEvaluation, 'status' | 'evidence' | 'sourceFields' | 'explanation'> {
  const pattern = attributePatterns[type];
  const matches = (values: readonly string[]) => values.filter((value) => pattern.test(type === 'accommodation' ? value.replace(/companion accommodation/gi, '') : value));
  const includes = matches(record.inclusions), excludes = matches(record.exclusions);
  const unspecified = includes.filter((value) => /\bnot specified|\bnot confirmed|\bnot documented|\bunknown|\bno information|\bassistance|\bcoordination|\bplanning|\bbooking support|\barranging|\?/.test(value.toLowerCase()));
  const negative = includes.filter((value) => /\bnot included|\bexcluded|\bnot provided|\bnot available|\bwithout\b|^no\s/i.test(value));
  const conditional = includes.filter((value) => /\boptional|\bon request|\bsubject to|\bmay\b|\bextra cost|\badditional charge|\bnot guaranteed/i.test(value));
  const positive = includes.filter((value) => !negative.includes(value) && !conditional.includes(value) && !unspecified.includes(value));
  const fields = [...(includes.length ? ['inclusions'] : []), ...(excludes.length ? ['exclusions'] : [])];
  if (positive.length && (negative.length || excludes.length)) return { status: 'incomplete', evidence: [...includes, ...excludes], sourceFields: fields, explanation: 'The catalog has conflicting inclusion and exclusion statements; confirmation is required.' };
  if (negative.length || excludes.length) return { status: 'not_met', evidence: [...negative, ...excludes], sourceFields: fields, explanation: 'The catalog explicitly excludes this requested feature.' };
  if (positive.length) return { status: 'exact', evidence: positive, sourceFields: fields, explanation: 'The catalog explicitly lists this feature among package inclusions.' };
  if (conditional.length) return { status: 'incomplete', evidence: conditional, sourceFields: fields, explanation: 'This feature is conditional or optional; inclusion is not confirmed.' };
  const stay = type === 'accommodation' ? record.inclusions.filter((value) => /\bhospital stay\b/i.test(value)) : [];
  return { status: 'unknown', evidence: [...stay, ...unspecified], sourceFields: ['inclusions', 'exclusions'], explanation: stay.length
    ? 'The catalog lists hospital stay, but does not explicitly confirm accommodation. Hospital stay is not accommodation.'
    : 'The catalog does not explicitly specify this feature. No inclusion has been inferred.' };
}
