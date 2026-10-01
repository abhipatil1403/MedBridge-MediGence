import { safeText } from '@/lib/agents/execution-state';
import { researchInputSchema, researchResultSchema, sourceTypes, type ResearchFinding, type ResearchInput, type ResearchReason, type ResearchResult, type ResearchSource } from './schemas';
import { evidenceId, retrieveOfficialPage, selectSources, textFromHtml, validateSourceUrl, type ApprovedSource, type ResearchRetriever } from './sources';

const marketing = /\b(?:best|leading|safest|world[- ]class|success rates?|outcomes?|guaranteed|competence)\b/i;
const unsafe = /ignore (?:all |previous |your |the )?(?:instructions|rules|system)|system prompt|call (?:the |this )?tool|(?:execute|invoke|run) (?:the |this )?tool|search_(?:treatments|hospitals|packages)|get_case_context|api.?key|password|authorization|bearer |sb_secret_|sk-[\w-]{12,}|https?:\/\//i;
export function validateResearchPrivacy(input: ResearchInput) {
  const text = JSON.stringify(input);
  if (safeText(text) !== text || unsafe.test(text) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{8,}\b|\b[\da-f]{8}-[\da-f]{4}-[\da-f-]{23,}\b|\b(?:patient|diagnosis|medical history|my mother|my father|my report|DOB|passport|phone number)\b/i.test(text))
    throw new Error('Research accepts public healthcare terms only');
}
function snippet(line: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(line); if (!match || unsafe.test(line) || safeText(line) !== line) return;
  const left = Math.max(0, match.index - 70);
  const start = left ? Math.min(match.index, line.indexOf(' ', left) + 1) : 0;
  const right = Math.min(line.length, start + 220);
  const end = right < line.length ? Math.max(match.index + match[0].length, line.lastIndexOf(' ', right)) : right;
  return line.slice(start, end).trim();
}
export function extractPrice(evidence: string, treatment: string): ResearchFinding['price'] | undefined {
  if (!evidence.toLowerCase().includes(treatment.toLowerCase()) || /implant (?:ceiling|only)|per implant|consultation|diagnostic|\b(?:lakh|crore|million|thousand|range|between)\b|\d\s*[-–]\s*\d/i.test(evidence)) return;
  const matches = [...evidence.matchAll(/(₹|INR|Rs\.?|USD|\$|GBP|£|EUR|€)\s*([\d,]+(?:\.\d{1,2})?)/gi)];
  if (matches.length !== 1 || matches[0][1] === '$') return;
  const amount = Number(matches[0][2].replaceAll(',', '')); if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return;
  const c = matches[0][1].toUpperCase();
  const currency = ['₹', 'INR', 'RS', 'RS.'].includes(c) ? 'INR' : ['$', 'USD'].includes(c) ? 'USD' : ['£', 'GBP'].includes(c) ? 'GBP' : 'EUR';
  return { amount, currency, refersTo: treatment.slice(0, 120), kind: /starting|starts|from\s+(?:₹|INR|Rs|USD|\$)/i.test(evidence) ? 'starting_price'
    : /estimate|approximate|indicative/i.test(evidence) ? 'estimate' : /package/i.test(evidence) ? 'package_price' : 'published_price', providerQuote: false };
}
function publishedDate(html: string): string | undefined {
  // Use page-level article metadata only. Copyright/footer dates are not publication dates.
  const value = /<meta\b[^>]*(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1];
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) return;
  const date = new Date(value); return date.getTime() <= Date.now() ? date.toISOString() : undefined;
}
export function extractPage(source: ApprovedSource, page: { url: string; html: string; retrievedAt: string }, input: ResearchInput) {
  validateSourceUrl(page.url);
  if (page.url !== source.url || page.html.length > 650000) throw new Error('Retrieved source identity does not match');
  const text = textFromHtml(page.html);
  if (![source.provider, ...source.aliases].some(name => text.toLowerCase().includes(name.toLowerCase()))) throw new Error('Provider identity not established in retrieved page');
  const entity = { id: evidenceId(`provider:${source.provider}:${source.location}`), name: source.provider, type: 'hospital' as const, location: source.location };
  const publishedAt = publishedDate(page.html);
  const titleText = /<title[^>]*>([^<]+)<\/title>/i.exec(page.html)?.[1];
  const title = titleText ? textFromHtml(titleText).slice(0, 200) : source.provider;
  const record: ResearchSource = { id: evidenceId(page.url), entityId: entity.id, sourceKind: 'external_source', url: page.url, title: safeText(title) || source.provider,
    domain: new URL(page.url).hostname, retrievedAt: page.retrievedAt, publishedAt, sourceType: source.type, authorityLevel: sourceTypes.indexOf(source.type) + 1,
    freshness: publishedAt ? Date.parse(page.retrievedAt) - Date.parse(publishedAt) > 180 * 86400000 ? 'potentially-stale' : 'source-date-known' : 'source-date-unknown' };
  const findings: ResearchFinding[] = [];
  const treatment = (input.treatment ?? '').replaceAll('-', ' ');
  const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns: Partial<Record<ResearchFinding['field'], RegExp>> = {
    provider_details: new RegExp(escape(source.aliases[0]), 'i'), treatment_availability: treatment ? new RegExp(escape(treatment), 'i') : undefined,
    services: /(?:services offered|rehabilitation|joint replacement)/i, location: new RegExp(escape(source.location), 'i'),
    contact_information: /(?:phone|telephone|contact|call)\s*[:+\d]/i, facilities: /(?:facility|facilities|operation theatre|infrastructure)/i,
    package_information: /\bpackage\b/i, published_pricing: /(?:₹|\bINR\b|\bRs\.?|USD|\$|GBP|£|EUR|€)\s*\d/i,
    accommodation: /\baccommodation\b/i,
  };
  for (const field of [...new Set(input.informationNeeded)]) {
    const pattern = patterns[field]; if (!pattern) continue;
    // Pricing/package statements must refer to the requested treatment in the same text block.
    const line = text.split('\n').find(l => pattern.test(l) && !marketing.test(l) && !unsafe.test(l) && safeText(l) === l
      && (!['published_pricing', 'package_information', 'accommodation'].includes(field) || Boolean(treatment && l.toLowerCase().includes(treatment.toLowerCase())))
      && (field !== 'treatment_availability' || !/\b(?:not available|no longer|do not offer|unavailable|does not offer)\b/i.test(l)));
    const evidence = line && snippet(line, pattern); if (!evidence) continue;
    const price = field === 'published_pricing' ? extractPrice(evidence, treatment) : undefined;
    // Unparsed ranges/ambiguous currencies remain quoted evidence with unclear status; no invented number.
    findings.push({ id: evidenceId(`${record.id}:${field}:${evidence}`), sourceKind: 'external_source', entity, field, value: evidence,
      sourceIds: [record.id], evidence: [{ sourceId: record.id, snippet: evidence, extractedField: field }], price,
      status: record.freshness === 'potentially-stale' ? 'potentially_stale' : field === 'published_pricing' && !price ? 'unclear' : 'supported' });
  }
  return { source: record, findings, rejectedInstructions: text.split('\n').some(l => unsafe.test(l)) };
}
export function reconcileResearch(result: ResearchResult): ResearchResult {
  const groups = new Map<string, ResearchFinding[]>();
  for (const finding of result.findings) {
    const key = `${finding.entity.id}:${finding.field}`; groups.set(key, [...groups.get(key) ?? [], finding]);
  }
  const conflicts: ResearchResult['conflicts'] = [];
  for (const findings of groups.values()) {
    const prices = findings.filter(f => f.price);
    const contradictory = prices.length > 1 && new Set(prices.map(f => JSON.stringify(f.price))).size > 1
      || findings[0].field === 'accommodation' && findings.some(f => /\bincluded\b/i.test(f.value)) && findings.some(f => /separately|not included|excluded/i.test(f.value));
    if (contradictory) {
      findings.forEach(f => { f.status = 'conflicting'; });
      conflicts.push({ entityId: findings[0].entity.id, field: findings[0].field, findingIds: findings.map(f => f.id),
        explanation: 'Sources state different information. MedBridge cannot determine which value is currently correct; no value was selected or averaged.' });
    }
  }
  return researchResultSchema.parse({ ...result, status: conflicts.length && result.status === 'completed' ? 'partial' : result.status, conflicts });
}
export async function researchHealthcare(rawInput: unknown, reason: ResearchReason, retrieve: ResearchRetriever = retrieveOfficialPage): Promise<ResearchResult> {
  const input = researchInputSchema.parse(rawInput); validateResearchPrivacy(input);
  const sources = selectSources(input);
  const result: ResearchResult = { query: input.query, reason, sourceKind: 'external_source', status: 'not_found', findings: [], sources: [], conflicts: [],
    missingInformation: [], warnings: [], retrievedAt: new Date().toISOString() };
  // One bounded collection pass inside the existing tool timeout; no nested tool/model calls.
  const pages = await Promise.allSettled(sources.map(async s => extractPage(s, await retrieve(s), input)));
  pages.forEach((p, i) => {
    if (p.status === 'fulfilled') {
      result.sources.push(p.value.source); result.findings.push(...p.value.findings);
      if (p.value.rejectedInstructions) result.warnings.push('Instruction-like external text was excluded from evidence.');
    } else result.warnings.push(`Could not retrieve approved source: ${new URL(sources[i].url).hostname}.`);
  });
  const entities = [...new Set(sources.map(s => s.provider))];
  for (const name of entities) for (const field of input.informationNeeded) if (!result.findings.some(f => f.entity.name === name && f.field === field))
    result.missingInformation.push(`${name}: ${field.replaceAll('_', ' ')} not found in the researched sources.`);
  for (const name of input.providers ?? []) if (!entities.includes(name)) result.missingInformation.push(`${name}: no approved source is available in this collection.`);
  if (!sources.length) result.missingInformation.push('No approved source is available for this treatment, provider and location.');
  result.status = sources.length && !result.sources.length ? 'failed' : !result.findings.length ? 'not_found' : result.warnings.length || result.missingInformation.length ? 'partial' : 'completed';
  result.findings = result.findings.slice(0, 24); result.missingInformation = result.missingInformation.slice(0, 30);
  return reconcileResearch(result);
}
