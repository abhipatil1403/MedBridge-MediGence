import type { CatalogRepository, CatalogSnapshot } from '@/types/catalog';
import { QueryNormalizer, type NormalizedDiscoveryQuery } from '@/lib/discovery/query-normalizer';
import { SearchService } from '@/lib/discovery/search-service';
import { defaultToolDependencies, type ToolDependencies } from './tools';
import type { AgentPlan, ToolName } from './schemas';

export interface DiscoveryRoute {
  normalized: NormalizedDiscoveryQuery;
  plan: AgentPlan;
  snapshot: CatalogSnapshot;
}

export async function discoveryRoute(content: string, repository: CatalogRepository): Promise<DiscoveryRoute | undefined> {
  const snapshot = repository.loadSnapshot ? await repository.loadSnapshot() : await (async () => {
    const [treatments, hospitals, doctors, packages, countries, services, estimates] = await Promise.all([
      repository.listTreatments(), repository.listHospitals(), repository.listDoctors(), repository.listPackages(),
      repository.listCountries(), repository.listServices(), repository.listPriceEstimates(),
    ]);
    return { treatments, hospitals, doctors, packages, countries, services, estimates };
  })();
  const { treatments, hospitals, doctors, countries, services } = snapshot;
  const normalized = QueryNormalizer.normalize(content, { treatments, hospitals, doctors, countries, services });
  const { entities, targets, missingEntities } = normalized;
  if (!targets.length) return undefined;
  const hasCriteria = Boolean(entities.procedure || entities.procedurePhrase || entities.specialty || entities.city || entities.country || missingEntities.length);
  if (!hasCriteria) return undefined;

  const location = entities.city ? ` in ${entities.city}` : entities.country ? ` in ${entities.country}` : '';
  const subject = entities.procedurePhrase || (entities.procedure ? treatments.find((item) => item.slug === entities.procedure)?.name : undefined)
    || entities.specialty?.toLowerCase();
  const understanding = subject ? `You are looking for ${targets.join(' and ')} related to ${subject}${location}.`
    : `You are looking for ${targets.join(' and ')}${location}.`;
  if (missingEntities.length) return { normalized, snapshot, plan: { agent: 'discovery', understanding, steps: [],
    missingInformation: 'What surgery or procedure are you looking for?' } };

  // A broader alias inside an unsupported procedure is not an exact match.
  // Search the original words for auditability, but do not search providers.
  const unsupported = Boolean(entities.procedurePhrase && ['related', 'none'].includes(entities.procedureMatchType));
  const selectedTargets = unsupported ? ['treatments'] as const : targets;
  const tools: Partial<Record<(typeof selectedTargets)[number], ToolName>> = {
    treatments: 'search_treatments', hospitals: 'search_hospitals', doctors: 'search_doctors', packages: 'search_packages',
  };
  const steps: AgentPlan['steps'] = selectedTargets.map((target) => {
    const input: Record<string, string> = { query: content.slice(0, 240) };
    if (!unsupported) {
      if (entities.procedure) input.treatment = entities.procedure;
      if (entities.specialty && !entities.procedure) input.specialty = entities.specialty;
      if (entities.city) input.city = entities.city;
      if (entities.country) input.country = entities.country;
    }
    return { objective: `Search catalog ${target} against the stated criteria`, tool: tools[target]!, input: JSON.stringify(input) };
  });
  if (unsupported && entities.relatedProcedure) steps.push({ objective: 'Read a broader catalog topic without claiming an exact match',
    tool: 'get_treatment', input: JSON.stringify({ slug: entities.relatedProcedure }) });
  return { normalized, snapshot, plan: { agent: 'discovery', understanding, steps, missingInformation: null } };
}

export function routeToolDependencies(route: DiscoveryRoute, base: ToolDependencies): ToolDependencies {
  const snapshot = route.snapshot;
  const repository: CatalogRepository = {
    ...base.repository, loadSnapshot: async () => snapshot,
    listTreatments: async () => snapshot.treatments, listHospitals: async () => snapshot.hospitals,
    listDoctors: async () => snapshot.doctors, listPackages: async () => snapshot.packages,
    listCountries: async () => snapshot.countries, listServices: async () => snapshot.services,
    listPriceEstimates: async () => snapshot.estimates,
  };
  const search = new SearchService(repository);
  return { repository, compare: base.compare,
    search: base.search === defaultToolDependencies.search
      ? (query, type, filters) => search.search({ q: query, type, ...filters, sort: 'relevance' })
      : base.search };
}
