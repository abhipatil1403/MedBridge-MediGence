import { z } from 'zod';
import { EntityMatcher, type MatchCatalog } from './entity-matcher';
import { IntentDetector } from './intent-detector';
import { includesPhrase, normalize } from './normalize';

const targetSchema = z.enum(['treatments', 'hospitals', 'doctors', 'packages']);
export const normalizedDiscoveryQuerySchema = z.object({
  query: z.string(), normalizedQuery: z.string(), intent: z.string(),
  targets: z.array(targetSchema),
  entities: z.object({
    procedure: z.string().optional(), procedurePhrase: z.string().optional(), relatedProcedure: z.string().optional(),
    procedureMatchType: z.enum(['exact', 'related', 'none', 'unspecified']),
    specialty: z.string().optional(), condition: z.string().optional(), country: z.string().optional(),
    countries: z.array(z.string()), city: z.string().optional(), service: z.string().optional(),
  }),
  missingEntities: z.array(z.string()), matchReason: z.string(),
}).strict();
export type NormalizedDiscoveryQuery = z.infer<typeof normalizedDiscoveryQuerySchema>;

const procedureAliases: Record<string, readonly string[]> = {
  'knee-replacement': ['knee operation', 'knee replacement operation', 'knee replacement surgery'],
  'hip-replacement': ['hip operation', 'hip replacement operation', 'hip replacement surgery'],
  cabg: ['heart bypass surgery', 'coronary bypass'],
};
const procedureWords = /\b(surgery|operation|procedure|replacement|transplant|bypass|fusion|implant)\b/;
const genericProcedure = /^(?:a |an |the )?(?:surgery|operation|procedure|treatment|care)$/;

function procedurePhrase(query: string, catalog: MatchCatalog): string | undefined {
  const text = normalize(query);
  const afterFor = /\bfor (.+?)(?=\s+(?:in|at|near)\s+|\s+and\s+(?:show|find|compare|include)\b|$)/.exec(text)?.[1];
  const locations = [...catalog.hospitals.flatMap((item) => [item.city, ...(item.locationCities ?? [])]), ...catalog.countries.flatMap((item) => [item.name, ...item.aliases])]
    .map(normalize).filter(Boolean).sort((a, b) => b.length - a.length);
  let direct = !afterFor && procedureWords.test(text)
    ? text.split(/\s+(?:in|at|near)\s+/)[0].replace(/^(?:(?:find|show|search|explore|compare|i need|i want|i am looking for)\s+)+/, '')
      .replace(/^(?:me |a |an |the )+/, '')
    : undefined;
  if (direct) {
    const location = locations.find((item) => direct!.endsWith(` ${item}`));
    if (location) direct = direct.slice(0, -location.length).trim();
  }
  const clean = (afterFor ?? direct ?? '').replace(/^(?:my |our |a |an |the |father s |mother s |my father s |my mother s )+/, '')
    .replace(/\s+(?:hospitals?|doctors?|specialists?|packages?)$/, '').trim();
  return clean || undefined;
}

export const QueryNormalizer = {
  normalize(query: string, catalog: MatchCatalog): NormalizedDiscoveryQuery {
    const clean = query.trim().slice(0, 240);
    const text = normalize(clean);
    const base = EntityMatcher.match(clean, catalog);
    const targets: Array<z.infer<typeof targetSchema>> = [];
    if (/\b(treatment|procedure|surgery|operation)\b/.test(text) && !/\b(hospital|doctor|package)\b/.test(text)) targets.push('treatments');
    if (/\b(hospital|hospitals|clinic|clinics|medical center|medical centre)\b/.test(text)) targets.push('hospitals');
    if (/\b(doctor|doctors|specialist|specialists|surgeon|surgeons|cardiologist|cardiologists|oncologist|oncologists|neurologist|neurologists)\b/.test(text)) targets.push('doctors');
    if (/\b(package|packages|bundle|bundles)\b/.test(text)) targets.push('packages');

    const phrase = procedurePhrase(clean, catalog);
    const names = catalog.treatments.flatMap((item) => [item.name, ...item.aliases, ...(procedureAliases[item.slug] ?? [])]
      .map((alias) => ({ slug: item.slug, alias: normalize(alias) }))).sort((a, b) => b.alias.length - a.alias.length);
    const exact = phrase && !genericProcedure.test(phrase) ? names.find((item) => item.alias === phrase) : undefined;
    const mentioned = names.find((item) => includesPhrase(clean, item.alias));
    const related = phrase && !exact ? names.find((item) => includesPhrase(phrase, item.alias)) : undefined;
    const hasSpecificProcedure = Boolean(phrase && procedureWords.test(phrase) && !genericProcedure.test(phrase));
    const procedure = exact?.slug ?? (!phrase && mentioned ? mentioned.slug : undefined);
    const procedureMatchType = procedure ? 'exact' : related ? 'related' : hasSpecificProcedure ? 'none' : 'unspecified';
    const genericSurgery = Boolean(phrase && genericProcedure.test(phrase));
    const specialty = base.specialty ?? (includesPhrase(clean, 'cancer') ? 'Oncology' : undefined);
    const missingEntities = targets.includes('hospitals') && (genericSurgery || (!procedure && !specialty && !base.city && !base.country && !phrase))
      ? ['procedure'] : [];
    const result: NormalizedDiscoveryQuery = {
      query: clean,
      normalizedQuery: [procedure ?? phrase, specialty, base.city, base.country].filter(Boolean).join(' · ') || text,
      intent: IntentDetector.detect(clean), targets,
      entities: { ...base, procedure, procedurePhrase: phrase, relatedProcedure: related?.slug,
        procedureMatchType, specialty, countries: [...base.countries] },
      missingEntities,
      matchReason: procedure ? 'The requested procedure matches a catalog name or approved alias.'
        : related ? 'A broader catalog topic exists, but the requested procedure has no exact catalog match.'
          : hasSpecificProcedure ? 'The requested procedure has no exact catalog match.' : 'No specific procedure was requested.',
    };
    return normalizedDiscoveryQuerySchema.parse(result);
  },
};
