import type { Comparison, Finding, PlanningResultGroup } from '../schemas';
import { factsPrice, packagePrice, packagePriceBounds, priceTypeLabels, lowestComparablePrice } from '@/lib/catalog/pricing';

export const comparisonFields: Record<string, Array<[string, string]>> = {
  hospitals: [['city', 'City'], ['country', 'Country'], ['treatments', 'Treatments'], ['specialties', 'Specialties'], ['verification', 'Verification'], ['sampleAccreditation', 'Published accreditation information'], ['sampleBedCount', 'Listed bed count'], ['infrastructure', 'Listed infrastructure']],
  packages: [['hospitalName', 'Hospital'], ['samplePriceUsd', 'Listed USD package estimate'], ['listedPrice','Listed package price / range'], ['priceType','Pricing type'], ['currency', 'Currency'], ['durationDays', 'Package duration'], ['inclusions', 'Inclusions'], ['exclusions', 'Exclusions'], ['accommodationStatus', 'Accommodation inclusion'], ['accommodationInformation', 'Accommodation information'], ['transferStatus', 'Airport transfer inclusion'], ['interpreterStatus', 'Interpreter inclusion'], ['consultationStatus', 'Consultation inclusion'], ['diagnosticsStatus', 'Diagnostics inclusion'], ['followUpStatus', 'Follow-up inclusion'], ['hospitalStayStatus','Hospital stay'],['rehabilitationStatus','Rehabilitation'],['localTransportStatus','Local transportation'],['visaAssistanceStatus','Visa assistance'],['country', 'Country']],
  doctors: [['specialty', 'Specialty'], ['hospitalName', 'Hospital'], ['city', 'City'], ['country', 'Country'], ['sampleExperienceYears', 'Listed experience'], ['qualifications', 'Listed qualifications'], ['consultationMode', 'Consultation mode'], ['verification', 'Verification']],
};
export function factText(finding: Finding, key: string) {
  const value = finding.facts[key];
  if (value === null || value === undefined || value === '') return undefined;
  if (key === 'samplePriceUsd') return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `USD ${value.toLocaleString('en-US')}` : undefined;
  if (key === 'listedPrice') return packagePriceBounds(factsPrice(finding.facts)) ? packagePrice(factsPrice(finding.facts)) : undefined;
  if (key === 'priceType') return priceTypeLabels[String(value)] ?? String(value);
  if (key === 'durationDays') return `${value} days`;
  if (key === 'sampleExperienceYears') return `${value} years`;
  return String(value);
}
export function missingFields(groups: PlanningResultGroup[]) {
  return groups.flatMap((group) => comparisonFields[group.target].filter(([key]) => !group.findings.some((finding) => factText(finding, key) !== undefined))
    .map(([, label]) => `${group.target}: ${label}`)).slice(0, 30);
}
function listedPrices(group?: PlanningResultGroup) { return group?.status === 'completed' ? group.findings.filter(finding=>finding.matchType==='exact' && packagePriceBounds(factsPrice(finding.facts))) : []; }
export function comparisonSummary(comparison: Comparison) {
  const details = comparison.sides.map((side) => `${side.option.label}: ${side.groups.map((group) => group.status === 'blocked' ? `${group.target} search incomplete`
    : group.matchType === 'none' ? `no matching catalog ${group.target}` : `${group.findings.length} ${group.matchType} catalog ${group.target} ${group.findings.length === 1 ? 'record' : 'records'}`).join('; ')}.`);
  const prices = comparison.sides.map((side) => listedPrices(side.groups.find((group) => group.target === 'packages')));
  const priceDetails = prices.map((records, index) => records?.length
    ? `${comparison.sides[index].option.label}: ${records.slice(0,3).map(f=>`${f.title}: ${packagePrice(factsPrice(f.facts))}`).join('; ')}.`
    : `${comparison.sides[index].option.label}: no comparable package price is available in the current catalog.`);
  const wantsPrices = comparison.request.focus === 'package_price' || comparison.request.targets.includes('packages');
  const allPackages=comparison.sides.flatMap(side=>side.groups.filter(g=>g.target==='packages').flatMap(g=>g.findings));
  const missingSide=comparison.sides.some(side=>side.groups.some(group=>group.target==='packages' && (group.status!=='completed'||!group.findings.length)));
  const conclusion = wantsPrices ? missingSide ? ' A lower price between these options cannot be determined from the available data.' : ` ${lowestComparablePrice(allPackages.map(f=>f.matchType==='exact'?factsPrice(f.facts):{})).reason}` : '';
  return `Based on the current MedBridge catalog, ${details.join(' ')}${wantsPrices ? ` ${priceDetails.join(' ')}${conclusion}` : ''} These records do not establish medical suitability or a preferred option.`.slice(0, 1600);
}
