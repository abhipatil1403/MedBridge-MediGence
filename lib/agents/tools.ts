import { z } from 'zod';
import type { CatalogRecord, CatalogRepository } from '@/types/catalog';
import type { DiscoveryFilters, DiscoveryResults, ResultType } from '@/types/discovery';
import { catalogRepository } from '@/lib/catalog/repository';
import { searchService } from '@/lib/discovery/search-service';
import { getComparison } from '@/lib/catalog/comparison-service';
import { agents } from './registry';
import { AgentError } from './errors';
import { toolResultSchema, type AgentId, type Finding, type ToolName, type ToolResult } from './schemas';

const searchInput = z.object({
  query: z.string().trim().min(2).max(240),
  country: z.string().max(80).describe('Catalog country slug, e.g. india').optional(),
  city: z.string().max(80).optional(),
  treatment: z.string().max(100).describe('Catalog treatment slug, e.g. knee-replacement').optional(),
  specialty: z.string().max(100).optional(),
  hospital: z.string().max(100).describe('Catalog hospital slug').optional(),
  mode: z.enum(['video', 'in-person']).optional(),
  verification: z.enum(['verified', 'demo']).optional(),
}).strict();
const slugInput = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,100}$/) }).strict();
const comparisonInput = z.object({ treatment: slugInput.shape.slug, firstCountry: slugInput.shape.slug, secondCountry: slugInput.shape.slug }).strict();
const caseInput = z.object({ caseId: z.uuid() }).strict();
const createCaseInput = z.object({ title: z.string().min(3).max(120) }).strict();
const updateCaseInput = caseInput.extend({ title: z.string().min(3).max(120) }).strict();
const taskInput = z.object({ objective: z.string().min(3).max(160) }).strict();
const questionInput = z.object({ question: z.string().min(3).max(300) }).strict();
const externalActionInput = z.object({ action: z.enum(['share_records', 'booking', 'payment', 'travel_purchase', 'visa_submission']), recipient: z.string().max(120).optional() }).strict();

export const toolSchemas = {
  search_treatments: searchInput, search_hospitals: searchInput, search_doctors: searchInput,
  search_packages: searchInput, search_countries: searchInput, search_services: searchInput,
  get_treatment: slugInput, get_hospital: slugInput, get_doctor: slugInput,
  get_package: slugInput, get_country: slugInput, compare_treatment_options: comparisonInput,
  get_case_context: caseInput, get_case_documents_metadata: caseInput,
  create_case: createCaseInput, update_case: updateCaseInput, create_agent_task: taskInput,
  request_user_information: questionInput, request_external_action: externalActionInput,
} satisfies Record<ToolName, z.ZodType>;

export const toolDescriptions: Record<ToolName, string> = {
  search_treatments: 'Search real catalog treatments.', search_hospitals: 'Search real catalog hospitals by treatment, location and specialty.',
  search_doctors: 'Search real catalog doctors by specialty and location.', search_packages: 'Search catalog packages.',
  search_countries: 'Search countries and travel notes.', search_services: 'Search coordination services.',
  get_treatment: 'Get a treatment by slug.', get_hospital: 'Get a hospital by slug.', get_doctor: 'Get a doctor by slug.',
  get_package: 'Get a package by slug.', get_country: 'Get a country by slug.',
  compare_treatment_options: 'Compare a treatment in two countries using catalog estimates.',
  get_case_context: 'Read only the authorized current case with processing consent.',
  get_case_documents_metadata: 'Read document titles/types only for authorized current case with consent.',
  create_case: 'Propose a case creation; requires approval before writing.',
  update_case: 'Propose a case update; requires approval before writing.',
  create_agent_task: 'Propose an ongoing task; requires approval before writing.',
  request_user_information: 'Ask one necessary follow-up question.',
  request_external_action: 'Record a proposed external action for human approval; no external operation is performed.',
};

export interface ToolDefinition {
  name: ToolName;
  version: '1';
  description: string;
  inputSchema: z.ZodType;
  outputSchema: typeof toolResultSchema;
  authorization: 'authenticated' | 'case_consent';
  sideEffect: 'read' | 'propose' | 'ask';
  allowedAgents: readonly AgentId[];
}
const protectedTools = new Set<ToolName>(['get_case_context', 'get_case_documents_metadata', 'update_case']);
const proposedTools = new Set<ToolName>(['create_case', 'update_case', 'create_agent_task', 'request_external_action']);
export const toolRegistry = Object.fromEntries((Object.keys(toolSchemas) as ToolName[]).map((name) => [name, {
  name, version: '1', description: toolDescriptions[name], inputSchema: toolSchemas[name], outputSchema: toolResultSchema,
  authorization: protectedTools.has(name) ? 'case_consent' : 'authenticated',
  sideEffect: name === 'request_user_information' ? 'ask' : proposedTools.has(name) ? 'propose' : 'read',
  allowedAgents: (Object.keys(agents) as AgentId[]).filter((agent) => agents[agent].allowedTools.includes(name)),
}])) as unknown as Record<ToolName, ToolDefinition>;

export interface CaseAccess {
  readContext(caseId: string): Promise<Record<string, unknown>>;
  readDocumentMetadata(caseId: string): Promise<Record<string, unknown>[]>;
}
export interface ToolContext {
  agent: AgentId;
  userId: string;
  caseId?: string;
  caseAccess: CaseAccess;
}
export interface ToolDependencies {
  repository: CatalogRepository;
  search: (query: string, type: ResultType, filters: Pick<DiscoveryFilters, 'country' | 'city' | 'treatment' | 'specialty' | 'hospital' | 'mode'>) => Promise<DiscoveryResults>;
  compare: typeof getComparison;
}

export const defaultToolDependencies: ToolDependencies = {
  repository: catalogRepository,
  search: (query, type, filters) => searchService.search({ q: query, type, ...filters, sort: 'relevance' }),
  compare: getComparison,
};

const searchKinds = {
  search_treatments: 'treatments', search_hospitals: 'hospitals', search_doctors: 'doctors',
  search_packages: 'packages', search_countries: 'countries', search_services: 'services',
} as const;
const getKinds = {
  get_treatment: 'treatments', get_hospital: 'hospitals', get_doctor: 'doctors',
  get_package: 'packages', get_country: 'countries',
} as const;
const tableLists = {
  treatments: 'listTreatments', hospitals: 'listHospitals', doctors: 'listDoctors',
  packages: 'listPackages', countries: 'listCountries', services: 'listServices',
} as const;
const hrefKinds: Record<string, string> = { treatments: 'treatments', hospitals: 'hospitals', doctors: 'doctors', packages: 'packages' };

function toFinding(kind: string, record: CatalogRecord, matchType: Finding['matchType'] = 'exact', matchReason = 'Selected catalog record.'): Finding {
  const facts: Record<string, string | number | null> = {};
  const item = record as unknown as Record<string, unknown>;
  for (const key of ['city', 'country', 'specialty', 'hospitalName', 'samplePriceUsd', 'sampleBaseCostUsd', 'durationDays', 'verification', 'travelNote', 'consultationMode']) {
    const value = item[key];
    if (typeof value === 'string' || typeof value === 'number') facts[key] = value;
  }
  if (Array.isArray(item.specialties)) facts.specialties = item.specialties.join(', ');
  if (Array.isArray(item.treatmentSlugs)) facts.treatments = item.treatmentSlugs.join(', ');
  if (Array.isArray(item.inclusions)) facts.inclusions = item.inclusions.join('; ');
  if (Array.isArray(item.exclusions)) facts.exclusions = item.exclusions.join('; ');
  if (kind === 'packages') facts.currency = 'USD';
  return {
    kind, slug: record.slug, title: record.name, detail: record.description,
    href: hrefKinds[kind] ? `/${hrefKinds[kind]}/${record.slug}` : undefined,
    facts, matchType, matchReason,
    provenance: { kind: 'catalog', table: kind === 'services' ? 'healthcare_services' : kind,
      recordId: record.recordId, sourceRecordId: record.sourceRecordId, label: 'MedBridge catalog',
      sourceKind: record.sourceKind, retrievedAt: new Date().toISOString() },
  };
}

function assertCaseScope(inputCaseId: string, context: ToolContext) {
  if (!context.caseId || inputCaseId !== context.caseId) throw new AgentError('CASE_SCOPE_DENIED', 'This case is not available to this conversation.');
}

/** Validate both agent permission and exact schema before reaching any service. */
export async function executeTool(name: ToolName, rawInput: unknown, context: ToolContext, dependencies: ToolDependencies = defaultToolDependencies): Promise<ToolResult> {
  const definition = toolRegistry[name];
  if (!definition?.allowedAgents.includes(context.agent)) throw new AgentError('TOOL_DENIED', 'This agent cannot perform that action.');
  const validated = definition.inputSchema.safeParse(rawInput);
  if (!validated.success) throw new AgentError('TOOL_INPUT_INVALID', 'The assistant requested invalid search information.');
  const input = validated.data as Record<string, string>;
  if (name in searchKinds) {
    const kind = searchKinds[name as keyof typeof searchKinds];
    const result = await dependencies.search(input.query, kind, { country: input.country, city: input.city, treatment: input.treatment, specialty: input.specialty,
      hospital: input.hospital, mode: input.mode as DiscoveryFilters['mode'] });
    const matches = result.sections[kind].filter(({ item }) => !input.verification || (input.verification === 'demo' ? item.sourceKind === 'synthetic' : item.sourceKind !== 'synthetic'));
    return { findings: matches.slice(0, 5).map(({item, matchType, reason}) => toFinding(kind, item, matchType, reason)),
      note: matches.length === 0 ? 'No matching catalog records were found.' : undefined };
  }
  if (name in getKinds) {
    const kind = getKinds[name as keyof typeof getKinds];
    const records = await dependencies.repository[tableLists[kind]]();
    const item = records.find((record) => record.slug === input.slug);
    return { findings: item ? [toFinding(kind, item)] : [], note: item ? undefined : 'No matching catalog record was found.' };
  }
  if (name === 'compare_treatment_options') {
    const comparison = await dependencies.compare(input.treatment, input.firstCountry, input.secondCountry);
    if (!comparison) return { findings: [], note: 'Comparison data is unavailable for these selections.' };
    const findings = [comparison.treatment, comparison.first.country, comparison.second.country,
      ...comparison.first.hospitals.slice(0, 3), ...comparison.second.hospitals.slice(0, 3),
      ...comparison.first.packages.slice(0, 2), ...comparison.second.packages.slice(0, 2)];
    const unique = [...new Map(findings.map((item) => [item.recordId, item])).values()];
    const priceFindings: Finding[] = [comparison.first, comparison.second].flatMap((side) => side.estimate ? [{
      kind: 'price_estimates', title: `${comparison.treatment.name} in ${side.country.name} — estimate`,
      detail: 'Indicative catalog range in USD; request a provider quote for current, patient-specific pricing.',
      facts: { estimatedMinUsd: side.estimate.estimatedMinUsd, estimatedMaxUsd: side.estimate.estimatedMaxUsd },
      matchType: 'related', matchReason: 'Catalog estimate associated with the selected treatment and country.',
      provenance: { kind: 'catalog' as const, table: 'price_estimates', recordId: side.estimate.recordId,
        sourceRecordId: side.estimate.sourceRecordId, label: 'MedBridge catalog estimate',
        sourceKind: side.estimate.sourceKind, retrievedAt: new Date().toISOString() },
    }] : []);
    return { findings: [...unique.map((item) => toFinding(
      item === comparison.treatment ? 'treatments' : 'travelNote' in item ? 'countries' : 'treatmentSlugs' in item ? 'hospitals' : 'packages', item)),
      ...priceFindings],
      comparison: {
        treatment: comparison.treatment.name,
        first: { country: comparison.first.country.name, estimateMinUsd: comparison.first.sampleCostUsd ?? null,
          estimateMaxUsd: comparison.first.sampleCostMaxUsd ?? null, estimateSourceKind: comparison.first.estimate?.sourceKind ?? null,
          hospitalCount: comparison.first.hospitals.length, packageCount: comparison.first.packages.length,
          travelNote: comparison.first.country.travelNote || null },
        second: { country: comparison.second.country.name, estimateMinUsd: comparison.second.sampleCostUsd ?? null,
          estimateMaxUsd: comparison.second.sampleCostMaxUsd ?? null, estimateSourceKind: comparison.second.estimate?.sourceKind ?? null,
          hospitalCount: comparison.second.hospitals.length, packageCount: comparison.second.packages.length,
          travelNote: comparison.second.country.travelNote || null },
      } };
  }
  if (name === 'get_case_context' || name === 'get_case_documents_metadata') {
    assertCaseScope(input.caseId, context);
    return name === 'get_case_context'
      ? { findings: [], caseContext: await context.caseAccess.readContext(input.caseId) }
      : { findings: [], caseContext: { documents: await context.caseAccess.readDocumentMetadata(input.caseId) } };
  }
  if (name === 'request_user_information') return { findings: [], requestedInformation: input.question };
  if (name === 'request_external_action') return { findings: [], approvalRequired: `${input.action} requires explicit approval and a future integration. No external action was taken.` };
  if (name === 'update_case') assertCaseScope(input.caseId, context);
  return { findings: [], approvalRequired: `${name} requires your approval before any change is made.` };
}
