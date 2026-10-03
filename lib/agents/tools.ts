import { z } from 'zod';
import { verificationToolSchemas, type VerificationTool } from '@/lib/verification/schemas';
import { verifyProviderTool, type VerificationAuthorization } from '@/lib/verification/service';
import type { VerificationStore } from '@/lib/verification/store';
import { documentToolSchemas, type DocumentTool } from '@/lib/documents/schemas';
import { coordinateDocument, documentWrites, type DocumentAuthorization } from '@/lib/documents/service';
import type { DocumentStore } from '@/lib/documents/store';
import { researchInputSchema, type ResearchAuthorization } from '@/lib/research/schemas';
import { researchHealthcare, validateResearchPrivacy } from '@/lib/research/service';
import type { ResearchRetriever } from '@/lib/research/sources';
import { canonicalInput } from './execution-state';
import { loadDiscoverySnapshot } from './discovery-routing';
import { compareCandidates } from './comparison/candidates';
import { AGENT_LIMITS, safeText } from './execution-state';
import type { CatalogRecord, CatalogRepository } from '@/types/catalog';
import type { DiscoveryFilters, DiscoveryResults, ResultType } from '@/types/discovery';
import { catalogRepository } from '@/lib/catalog/repository';
import { searchService } from '@/lib/discovery/search-service';
import { getComparison } from '@/lib/catalog/comparison-service';
import { agents } from './registry';
import { AgentError } from './errors';
import { toolResultSchema, type AgentId, type Finding, type ToolName, type ToolResult } from './schemas';
import { evaluateFindings } from '@/lib/requirements/response';

const searchInput = z.object({
  query: z.string().trim().min(2).max(240),
  providerNames: z.array(z.string().trim().min(2).max(160)).min(1).max(3).optional(),
  country: z.string().max(80).describe('Catalog country slug, e.g. india').optional(),
  city: z.string().max(80).optional(),
  treatment: z.string().max(100).describe('Catalog treatment slug, e.g. knee-replacement').optional(),
  specialty: z.string().max(100).optional(),
  hospital: z.string().max(100).describe('Catalog hospital slug').optional(),
  mode: z.enum(['video', 'in-person']).optional(),
  verification: z.enum(['verified', 'demo']).optional(),
  budget: z.number().positive().max(100000000).describe('User-provided USD package budget only; do not convert currencies').optional(),
}).strict();
const slugInput = z.object({ slug: z.string().regex(/^[a-z0-9-]{2,100}$/) }).strict();
const comparisonInput = z.object({ treatment: slugInput.shape.slug, firstCountry: slugInput.shape.slug, secondCountry: slugInput.shape.slug }).strict();
const caseInput = z.object({ caseId: z.uuid() }).strict();
const createCaseInput = z.object({ title: z.string().min(3).max(120) }).strict();
const updateCaseInput = caseInput.extend({ title: z.string().min(3).max(120) }).strict();
const taskInput = z.object({ objective: z.string().min(3).max(160) }).strict();
const questionInput = z.object({ question: z.string().min(3).max(300) }).strict();
const externalActionInput = z.object({ action: z.enum(['share_records', 'booking', 'payment', 'travel_purchase', 'visa_submission']), recipient: z.string().max(120).optional() }).strict();

const analysisInput = z.object({ recordIds: z.array(z.guid()).min(1).max(10) }).strict();
export const toolAliases = { get_hospital_details: 'get_hospital', get_doctor_details: 'get_doctor', get_treatment_details: 'get_treatment', get_package_details: 'get_package', search_locations: 'search_countries' } as const;
export const toolSchemas = {
  ...verificationToolSchemas,
  ...documentToolSchemas,
  research_healthcare_information: researchInputSchema,
  get_hospital_details: slugInput, get_doctor_details: slugInput, get_treatment_details: slugInput, get_package_details: slugInput,
  search_locations: searchInput, check_requirements: analysisInput, compare_providers: analysisInput,
  search_treatments: searchInput, search_hospitals: searchInput, search_doctors: searchInput,
  search_packages: searchInput, search_countries: searchInput, search_services: searchInput,
  get_treatment: slugInput, get_hospital: slugInput, get_doctor: slugInput,
  get_package: slugInput, get_country: slugInput, compare_treatment_options: comparisonInput,
  get_case_context: caseInput, get_case_documents_metadata: caseInput,
  create_case: createCaseInput, update_case: updateCaseInput, create_agent_task: taskInput,
  request_user_information: questionInput, request_external_action: externalActionInput,
} satisfies Record<ToolName, z.ZodType>;

export const toolDescriptions: Record<ToolName, string> = {
  verify_provider_information:'Verify resolved provider factual fields against approved authoritative evidence. Save a private immutable report. No catalog mutation.',
  refresh_provider_verification:'Recheck resolved provider fields with new retrieval, bypassing the saved report cache.',
  get_provider_verification_status:'Read the latest owner-scoped saved verification and exact field evidence.',
  get_provider_verification_history:'Read real saved verification runs for this conversation and provider.',
  compare_provider_evidence:'Compare saved factual field values and conflicts without clinical ranking.',
  get_document_requirements: 'Read the selected hospital/service checklist with explicit source attribution. No inferred requirements.',
  get_document_package: 'Read the owner-scoped document workspace and current package.',
  upload_document: 'Upload a server-validated file from an explicit user file selection; no content processing.',
  match_document_to_requirement: 'Map a file only after explicit user confirmation.',
  remove_document: 'Remove a user-selected file and invalidate the prepared package.',
  prepare_document_package: 'Prepare an ordered snapshot after explicit revision-bound user confirmation. Does not share.',
  add_document_requirement: 'Save a requirement explicitly supplied and confirmed by the user.',
  research_healthcare_information: 'Read bounded approved official healthcare sources only after a server-authorized internal information gap. Returns separate attributed external evidence. No arbitrary URL browsing.',
  get_hospital_details: 'Read a published hospital by slug.', get_doctor_details: 'Read a published doctor by slug.',
  get_treatment_details: 'Read a published treatment by slug.', get_package_details: 'Read a published package by slug.',
  search_locations: 'Search published catalog countries and travel notes; city-level records are not a separate location search.',
  check_requirements: 'Evaluate actual catalog record IDs against documented requirements. Use IDs returned by tools.',
  compare_providers: 'Compare actual catalog hospital, doctor or package IDs in supplied order; no clinical ranking.',
  search_treatments: 'Search published catalog treatments.', search_hospitals: 'Search published catalog hospitals by treatment, location and specialty.',
  search_doctors: 'Search published catalog doctors by specialty and location.', search_packages: 'Search catalog packages.',
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
  id: ToolName; displayName: string; category: 'catalog' | 'analysis' | 'case' | 'coordination' | 'research';
  permission: 'read' | 'confirmation' | 'case_consent' | 'professional'; mode: 'read' | 'proposal' | 'ask' | 'write' | 'external' | 'clinical';
  provenance: readonly ('catalog' | 'synthetic' | 'external' | 'user' | 'derived' | 'hospital' | 'provider_configured')[];
  timeoutMs: number; failureHandling: 'observe_and_recover';
  execute: (input: unknown, context: ToolContext, dependencies?: ToolDependencies) => Promise<ToolResult>;
  name: ToolName;
  version: '1';
  description: string;
  inputSchema: z.ZodType;
  outputSchema: typeof toolResultSchema;
  authorization: 'authenticated' | 'case_consent';
  sideEffect: 'read' | 'propose' | 'ask' | 'write';
  allowedAgents: readonly AgentId[];
}
const protectedTools = new Set<ToolName>(['get_case_context', 'get_case_documents_metadata', 'update_case']);
const proposedTools = new Set<ToolName>(['create_case', 'update_case', 'create_agent_task', 'request_external_action']);
const verificationWrites = new Set<ToolName>(['verify_provider_information','refresh_provider_verification']);
export const toolRegistry = Object.fromEntries((Object.keys(toolSchemas) as ToolName[]).map((name) => [name, {
  id: name, displayName: name.replaceAll('_', ' '),
  category: Object.hasOwn(documentToolSchemas,name) ? 'coordination' : name === 'research_healthcare_information' ? 'research' : ['check_requirements', 'compare_providers'].includes(name) ? 'analysis' : name.includes('case') ? 'case' : name.startsWith('search_') || name.startsWith('get_') || name === 'compare_treatment_options' ? 'catalog' : 'coordination',
  permission: documentWrites.has(name as DocumentTool) || verificationWrites.has(name) ? 'confirmation' : proposedTools.has(name) ? 'confirmation' : protectedTools.has(name) ? 'case_consent' : 'read',
  mode: documentWrites.has(name as DocumentTool) || verificationWrites.has(name) ? 'write' : proposedTools.has(name) ? 'proposal' : name === 'request_user_information' ? 'ask' : 'read',
  provenance: Object.hasOwn(documentToolSchemas,name) ? ['hospital','provider_configured','external','user'] : ['catalog', 'synthetic', 'external', 'user', 'derived'], timeoutMs: AGENT_LIMITS.toolTimeoutMs, failureHandling: 'observe_and_recover',
  execute: async (input: unknown, context: ToolContext, dependencies?: ToolDependencies) => toolResultSchema.parse(await executeTool(name, input, context, dependencies)),
  name, version: '1', description: toolDescriptions[name], inputSchema: toolSchemas[name], outputSchema: toolResultSchema,
  authorization: protectedTools.has(name) ? 'case_consent' : 'authenticated',
  sideEffect: documentWrites.has(name as DocumentTool) || verificationWrites.has(name) ? 'write' : name === 'request_user_information' ? 'ask' : proposedTools.has(name) ? 'propose' : 'read',
  allowedAgents: (Object.keys(agents) as AgentId[]).filter((agent) => agents[agent].allowedTools.includes(name)),
}])) as unknown as Record<ToolName, ToolDefinition>;

export interface CaseAccess {
  readContext(caseId: string): Promise<Record<string, unknown>>;
  readDocumentMetadata(caseId: string): Promise<Record<string, unknown>[]>;
}
export interface ToolContext {
  verificationAuthorization?: VerificationAuthorization;
  documentAuthorization?: DocumentAuthorization;
  researchAuthorization?: ResearchAuthorization;
  referenceBoundary?: import('./runtime').ToolContextReferenceBoundary;
  agent: AgentId;
  userId: string;
  caseId?: string;
  caseAccess: CaseAccess;
  observedRecordIds?: readonly string[];
}
export interface ToolDependencies {
  verificationStore?: VerificationStore;
  documentStore?: DocumentStore;
  researchRetrieve?: ResearchRetriever;
  requirements?: import('@/lib/requirements/RequirementTypes').Requirement[];
  evaluationSnapshot?: import('@/types/catalog').CatalogSnapshot;
  repository: CatalogRepository;
  search: (query: string, type: ResultType, filters: Pick<DiscoveryFilters, 'country' | 'city' | 'treatment' | 'specialty' | 'hospital' | 'mode' | 'budget'>) => Promise<DiscoveryResults>;
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

export function toFinding(kind: string, record: CatalogRecord, matchType: Finding['matchType'] = 'exact', matchReason = 'Selected catalog record.'): Finding {
  const facts: Record<string, string | number | null> = {};
  const item = record as unknown as Record<string, unknown>;
  for (const key of ['city', 'country', 'specialty', 'hospitalSlug', 'hospitalName', 'treatmentSlug', 'samplePriceUsd', 'listedPrice', 'currency', 'sampleBaseCostUsd', 'durationDays', 'verification', 'travelNote', 'consultationMode', 'sampleBedCount', 'sampleAccreditation', 'sampleExperienceYears']) {
    const value = item[key];
    if(key==='samplePriceUsd'&&item.currency&&item.currency!=='USD') continue;
    // The legacy catalog adapter uses zero for absent optional counts. Do not present these as sourced attributes.
    if (['sampleBedCount', 'sampleExperienceYears'].includes(key) && (typeof value !== 'number' || value <= 0)) continue;
    if (typeof value === 'string' || typeof value === 'number') facts[key] = value;
  }
  if (Array.isArray(item.specialties)) facts.specialties = item.specialties.join(', ');
  if (Array.isArray(item.locationCities)) facts.publishedLocations = item.locationCities.join(', ');
  if (Array.isArray(item.treatmentSlugs)) facts.treatments = item.treatmentSlugs.join(', ');
  if (Array.isArray(item.inclusions)) facts.inclusions = item.inclusions.join('; ');
  if (Array.isArray(item.exclusions)) facts.exclusions = item.exclusions.join('; ');
  if (kind === 'packages') {
    const details = (record as import('@/types/catalog').Package).serviceDetails;
    for (const [key, service] of Object.entries(details ?? {})) {
      facts[`${key}Status`] = service.status.replaceAll('_', ' ');
      if (service.information) facts[`${key}Information`] = service.information;
    }
  }
  for (const key of ['qualifications', 'languages', 'infrastructure', 'countries']) if (Array.isArray(item[key])) facts[key] = item[key].join('; ');
  if (kind === 'packages') facts.currency = typeof item.currency==='string'?item.currency:'USD';
  return {
    sourceKind: 'medbridge_catalog', kind, slug: record.slug, title: record.name, detail: record.description,
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
  const definition = Object.hasOwn(toolRegistry, name) ? toolRegistry[name] : undefined;
  if (!definition?.allowedAgents.includes(context.agent)) throw new AgentError('TOOL_DENIED', 'This agent cannot perform that action.');
  const validated = definition.inputSchema.safeParse(rawInput);
  if (!validated.success) throw new AgentError('TOOL_INPUT_INVALID', 'The assistant requested invalid search information.');
  const input = validated.data as Record<string, string> & { budget?: number };
  if (!context.userId) throw new AgentError('AUTH_REQUIRED', 'Sign in to use catalog tools.');
  if(Object.hasOwn(verificationToolSchemas,name))return {findings:[],verification:await verifyProviderTool(name as VerificationTool,rawInput,context.userId,context.verificationAuthorization,dependencies.verificationStore,dependencies.evaluationSnapshot??await loadDiscoverySnapshot(dependencies.repository),dependencies.researchRetrieve)};
  if (safeText(JSON.stringify(rawInput)) !== JSON.stringify(rawInput)) throw new AgentError('TOOL_INPUT_INVALID', 'Credentials cannot be used as tool arguments.');
  if (Object.hasOwn(documentToolSchemas,name)) return { findings: [], documents: await coordinateDocument(name as DocumentTool,rawInput,context.userId,context.documentAuthorization,dependencies.documentStore) };
  if (name === 'research_healthcare_information') {
    const args = researchInputSchema.parse(rawInput);
    const authorization = context.researchAuthorization;
    if (!authorization?.internalToolCompleted || canonicalInput(args) !== canonicalInput(authorization.input)) throw new AgentError('RESEARCH_NOT_AUTHORIZED', 'External research needs an identified internal information gap.');
    try { validateResearchPrivacy(args); } catch { throw new AgentError('RESEARCH_PRIVACY_DENIED', 'Use public healthcare terms only for external research.'); }
    return { findings: [], research: await researchHealthcare(args, authorization.reason, dependencies.researchRetrieve) };
  }
  if (name in toolAliases) return executeTool(toolAliases[name as keyof typeof toolAliases], rawInput, context, dependencies);
  if (name === 'check_requirements' || name === 'compare_providers') {
    const args = analysisInput.parse(rawInput);
    if (context.observedRecordIds && args.recordIds.some((id) => !context.observedRecordIds!.includes(id))) throw new AgentError('TOOL_SCOPE_DENIED', 'Select records already returned in this run.');
    const snapshot = dependencies.evaluationSnapshot ?? await loadDiscoverySnapshot(dependencies.repository);
    const kinds = ['hospitals', 'doctors', 'packages', 'treatments', 'countries', 'services'] as const;
    const records = args.recordIds.flatMap((id) => kinds.flatMap((kind) => snapshot[kind].filter((r) => r.recordId === id).map((r) => toFinding(kind, r))));
    if (records.length !== args.recordIds.length || new Set(args.recordIds).size !== args.recordIds.length) throw new AgentError('TOOL_RECORD_UNAVAILABLE', 'Some selected catalog records are unavailable.');
    const requirements = dependencies.requirements ?? [];
    if (name === 'check_requirements') {
      const findings = evaluateFindings(records, requirements, snapshot);
      const missing = [...new Set(findings.flatMap((f) => f.requirementEvaluation?.evaluations.filter((e) => ['unknown', 'incomplete', 'related'].includes(e.status)).map((e) => e.explanation) ?? []))];
      return { findings, analysis: { kind: 'derived', recordIds: args.recordIds, complete: requirements.length > 0 && missing.length === 0, missingInformation: missing, summary: requirements.length ? 'Checked documented catalog evidence against the requested requirements.' : 'No requirements were supplied; no constraint satisfaction is claimed.' } };
    }
    const targets = [...new Set(records.map((r) => r.kind))].filter((k): k is 'hospitals' | 'packages' | 'doctors' => ['hospitals', 'packages', 'doctors'].includes(k));
    if (!targets.length) throw new AgentError('TOOL_INPUT_INVALID', 'Compare hospitals, doctors, or packages.');
    const result = compareCandidates({ intent: 'comparison', options: [], targets, focus: 'catalog' }, [targets.map((target) => ({ taskId: context.userId, target, status: 'completed' as const, findings: records.filter((r) => r.kind === target), matchType: 'exact' as const, matchReason: 'Selected sourced records.' }))]);
    return { findings: records, analysis: { kind: 'derived', recordIds: args.recordIds, summary: result.summary, complete: result.complete, missingInformation: result.complete ? [] : ['At least two sourced peers are needed for comparison.'] } };
  }
  if (name in searchKinds) {
    const kind = searchKinds[name as keyof typeof searchKinds];
    const result = await dependencies.search(input.query, kind, { country: input.country, city: input.city, treatment: input.treatment, specialty: input.specialty,
      hospital: input.hospital, mode: input.mode as DiscoveryFilters['mode'], budget: input.budget });
    const providerNames = searchInput.parse(rawInput).providerNames;
    const normalizedName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const matches = result.sections[kind].filter(({ item }) => !providerNames || providerNames.some(name => [item.name, ...item.aliases, ...('hospitalName' in item ? [String(item.hospitalName)] : [])].some(value => normalizedName(value) === normalizedName(name)))).filter(({ item }) => !input.verification || (input.verification === 'demo' ? item.sourceKind === 'synthetic' : item.sourceKind !== 'synthetic'));
    const findings = matches.map(({ item, matchType, reason }) => toFinding(kind, item, matchType, reason));
    return { findings: (dependencies.requirements?.length && dependencies.evaluationSnapshot ? evaluateFindings(findings, dependencies.requirements, dependencies.evaluationSnapshot) : findings).slice(0, 5),
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
