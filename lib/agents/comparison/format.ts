import type { Comparison, Finding, PlanningResultGroup } from '../schemas';

export const comparisonFields: Record<string, Array<[string, string]>> = {
  hospitals: [['city', 'City'], ['country', 'Country'], ['treatments', 'Treatments'], ['specialties', 'Specialties'], ['verification', 'Verification'], ['sampleAccreditation', 'Listed sample accreditation'], ['sampleBedCount', 'Sample bed count'], ['infrastructure', 'Listed infrastructure']],
  packages: [['hospitalName', 'Hospital'], ['samplePriceUsd', 'Listed sample package price'], ['listedPrice','Listed package estimate'], ['currency', 'Currency'], ['durationDays', 'Package duration'], ['inclusions', 'Inclusions'], ['exclusions', 'Exclusions'], ['accommodationStatus', 'Accommodation inclusion'], ['accommodationInformation', 'Accommodation information'], ['transferStatus', 'Airport transfer inclusion'], ['interpreterStatus', 'Interpreter inclusion'], ['consultationStatus', 'Consultation inclusion'], ['diagnosticsStatus', 'Diagnostics inclusion'], ['followUpStatus', 'Follow-up inclusion'], ['country', 'Country']],
  doctors: [['specialty', 'Specialty'], ['hospitalName', 'Hospital'], ['city', 'City'], ['country', 'Country'], ['sampleExperienceYears', 'Listed sample experience'], ['qualifications', 'Listed qualifications'], ['consultationMode', 'Consultation mode'], ['verification', 'Verification']],
};
export function factText(finding: Finding, key: string) {
  const value = finding.facts[key];
  if (value === null || value === undefined || value === '') return undefined;
  if (key === 'samplePriceUsd') return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `USD ${value.toLocaleString('en-US')}` : undefined;
  if (key === 'listedPrice') return typeof value==='number'&&Number.isFinite(value)?`${finding.facts.currency??'USD'} ${value.toLocaleString('en-US')}`:undefined;
  if (key === 'durationDays') return `${value} days`;
  if (key === 'sampleExperienceYears') return `${value} years`;
  return String(value);
}
export function missingFields(groups: PlanningResultGroup[]) {
  return groups.flatMap((group) => comparisonFields[group.target].filter(([key]) => !group.findings.some((finding) => factText(finding, key) !== undefined))
    .map(([, label]) => `${group.target}: ${label}`)).slice(0, 30);
}
function listedPrices(group?: PlanningResultGroup) {
  return group?.status === 'completed' ? group.findings.filter((finding) => finding.matchType === 'exact'
    && typeof finding.facts.samplePriceUsd === 'number' && Number.isFinite(finding.facts.samplePriceUsd) && finding.facts.samplePriceUsd >= 0) : [];
}
export function comparisonSummary(comparison: Comparison) {
  const details = comparison.sides.map((side) => `${side.option.label}: ${side.groups.map((group) => group.status === 'blocked' ? `${group.target} search incomplete`
    : group.matchType === 'none' ? `no matching catalog ${group.target}` : `${group.findings.length} ${group.matchType} catalog ${group.target} ${group.findings.length === 1 ? 'record' : 'records'}`).join('; ')}.`);
  const prices = comparison.sides.map((side) => listedPrices(side.groups.find((group) => group.target === 'packages')));
  const priceDetails = prices.map((records, index) => records?.length
    ? `${comparison.sides[index].option.label}'s lowest listed ${records.some((finding) => finding.provenance.sourceKind === 'synthetic') ? 'synthetic sample' : 'catalog sample'} package price among the returned records is USD ${Math.min(...records.map((finding) => Number(finding.facts.samplePriceUsd))).toLocaleString('en-US')}.`
    : `${comparison.sides[index].option.label}: no comparable package price is available in the current catalog.`);
  const wantsPrices = comparison.request.focus === 'package_price' || comparison.request.targets.includes('packages');
  const conclusion = wantsPrices && (!prices[0]?.length || !prices[1]?.length) ? ' A lower price between these options cannot be determined from the available data.' : '';
  return `Based on the current MedBridge catalog, ${details.join(' ')}${wantsPrices ? ` ${priceDetails.join(' ')}${conclusion}` : ''} These records do not establish medical suitability or a preferred option.`.slice(0, 1600);
}
