import type { RuntimeContext } from '@/lib/agents/runtime';
import type { Finding, AgentPlan } from '@/lib/agents/schemas';
import type { CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer } from '@/lib/discovery/query-normalizer';
import { approvedSources } from './sources';
import { researchInputSchema, type ResearchAuthorization, type ResearchInput, type ResearchReason } from './schemas';
import { compareResearchEvidence } from '@/lib/agents/comparison/research';

export function wantsExternalResearch(content: string): boolean {
  return /\b(?:current|publicly listed|published|official|external|research|website)\b/i.test(content)
    && /\b(?:hospitals?|providers?|packages?|prices?|pricing|treatments?|services?|facilities|accommodation)\b/i.test(content);
}
export function researchGap(input: ResearchInput, findings: Finding[], currentRequested: boolean): ResearchReason | undefined {
  if (!findings.length) return 'catalog_empty';
  // Catalog retrieval time is not provider publication/currentness evidence.
  if (currentRequested) return 'current_information_missing';
  if (findings.some(f => f.provenance.sourceKind === 'synthetic')) return 'requested_field_missing';
  const has = (field: ResearchInput['informationNeeded'][number]) => findings.some(f => field === 'provider_details' && f.kind === 'hospitals'
    || field === 'treatment_availability' && Boolean(f.facts.treatments || f.facts.treatmentSlug)
    || field === 'location' && Boolean(f.facts.city)
    || field === 'published_pricing' && f.kind === 'packages' && typeof f.facts.samplePriceUsd === 'number'
    || field === 'package_information' && f.kind === 'packages' && Boolean(f.facts.inclusions));
  return input.informationNeeded.every(has) ? undefined : 'requested_field_missing';
}
export function prepareResearchExecution(content: string, snapshot: CatalogSnapshot): NonNullable<RuntimeContext['execution']> {
  const normalized = QueryNormalizer.normalize(content, snapshot);
  const publicTreatment = /\b((?:(?:revision|partial|robotic|total) )?(?:knee|hip) replacement|orthopedics)\b/i.exec(content)?.[1]?.toLowerCase().replace(/^total /, '');
  const treatment = publicTreatment ?? normalized.entities.procedure?.replaceAll('-', ' ') ?? normalized.entities.procedurePhrase;
  const location = normalized.entities.city ?? /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/.exec(content)?.[1];
  const providers = [...new Set(approvedSources.filter(s => [s.provider, ...s.aliases].some(a => content.toLowerCase().includes(a.toLowerCase()))).map(s => s.provider))];
  const comparedNames = /^\s*compare (.+?) (?:and|versus|vs\.?) (.+?) (?=based on|for |in |using |on )/i.exec(content);
  for (const candidate of comparedNames ? [comparedNames[1], comparedNames[2]] : []) {
    const name = candidate.trim().replace(/^the /i, '');
    if (!/^[A-Za-z][A-Za-z '-]{1,99}$/.test(name)) continue;
    const known = approvedSources.find(s => [s.provider, ...s.aliases].some(a => name.toLowerCase().includes(a.toLowerCase())))?.provider;
    if (!providers.includes(known ?? name)) providers.push(known ?? name);
  }
  const namedUnknown = /\b(?:for|at) (?:Hospital )?([A-Z][A-Za-z'-]*(?: [A-Z][A-Za-z'-]*){0,3}) in\b/.exec(content)?.[1];
  if (!providers.length && namedUnknown && !/(?:knee|hip|orthopedics|hospitals?)/i.test(namedUnknown) && namedUnknown !== location) providers.push(namedUnknown);
  const unclearProvider = /\bhospital\s+[ABX]\b/i.test(content);
  const needsPrice = /package|price|pricing|cost/i.test(content), comparison = /compare|comparison/i.test(content);
  const fields: ResearchInput['informationNeeded'] = ['treatment_availability', 'location'];
  if (needsPrice) fields.push('package_information', 'published_pricing');
  if (/accommodation/i.test(content)) fields.push('accommodation');
  if (/facilit/i.test(content)) fields.push('facilities');
  if (/contact/i.test(content)) fields.push('contact_information');
  const missing = !treatment || !location || unclearProvider;
  const input = missing ? undefined : researchInputSchema.parse({ query: `${treatment} ${location}: ${fields.join(', ')}`.slice(0, 240),
    entityType: needsPrice ? 'package' : 'hospital', treatment, location, providers: providers.length ? providers : undefined, informationNeeded: fields, maxSources: providers.length === 1 ? 2 : 3 });
  const initial: AgentPlan['steps'] = input ? [{ tool: 'search_hospitals', objective: 'Check the MedBridge hospital catalog first',
    input: JSON.stringify({ query: `${treatment} hospitals`, providerNames: providers.length ? providers : undefined, city: location, treatment: snapshot.treatments.find(t => t.name.toLowerCase() === treatment)?.slug }) },
    ...(needsPrice ? [{ tool: 'search_packages' as const, objective: 'Check documented catalog package information',
      input: JSON.stringify({ query: `${treatment} packages`, providerNames: providers.length ? providers : undefined, city: location, treatment: snapshot.treatments.find(t => t.name.toLowerCase() === treatment)?.slug }) }] : [])] : [];
  const execution: NonNullable<RuntimeContext['execution']> = {
    plan: { agent: comparison ? 'comparison' : 'research', understanding: 'Check internal catalog evidence before targeted official healthcare research.', steps: initial,
      missingInformation: missing ? unclearProvider ? 'Which actual hospitals would you like to compare? Give their names and the treatment and city.' : 'Which treatment and city should I research?' : null },
    synthesis: { summary: 'Internal and external evidence are presented separately.', nextSteps: ['Review each source and any missing information.'], question: null },
    diagnostics: { workflow: 'external_research' },
    nextSteps: async results => {
      if (!input || results.some(r => r.tool === 'research_healthcare_information') || execution.researchAuthorization) return [];
      const internal = results.filter(r => ['search_hospitals', 'search_packages'].includes(r.tool));
      if (!internal.length) return []; // Failed catalog lookup is not evidence that it is empty.
      const findings = internal.flatMap(r => r.result.findings);
      const reason = researchGap(input, findings, /\bcurrent\b|publicly listed/i.test(content));
      if (!reason) return [];
      execution.researchAuthorization = { input, reason, internalToolCompleted: true } satisfies ResearchAuthorization;
      return [{ tool: 'research_healthcare_information', objective: 'Research the identified public healthcare information gap', input: JSON.stringify(input) }];
    },
    finalize: async (response, results) => {
      const result = results.find(r => r.result.research)?.result.research;
      const failed = response.tasks.some(t => t.tool === 'research_healthcare_information' && t.status === 'failed');
      const researched = result ? `${result.findings.length} attributed external evidence item${result.findings.length === 1 ? '' : 's'} from ${result.sources.length} retrieved source${result.sources.length === 1 ? '' : 's'}.`
        : failed ? 'External research could not be completed; successful internal results are preserved.' : 'No external research was needed or authorized.';
      return { ...response, research: result, researchComparison: result ? compareResearchEvidence(result) : undefined, summarySource: 'application',
        question: missing ? execution.plan.missingInformation : response.question,
        summary: missing ? execution.plan.missingInformation! : `MedBridge catalog: ${response.findings.length} record${response.findings.length === 1 ? '' : 's'}. ${researched}${result?.missingInformation.length ? ' Some requested information was not found in the researched sources.' : ''}${result?.conflicts.length ? ' Conflicting statements remain unresolved.' : ''} Retrieved information is not a provider quote or proof of currentness.`,
        nextSteps: missing ? ['Specify the public treatment, location and provider names.'] : ['Review the external evidence and source dates separately from catalog sample records.', 'Confirm unpublished package contents and final prices directly with the provider.'],
      };
    },
  };
  return execution;
}
