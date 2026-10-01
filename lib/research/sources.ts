import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { ResearchInput, ResearchSource } from './schemas';

export const RESEARCH_LIMITS = { maxSources: 4, maxBytes: 650000, maxText: 24000, timeoutMs: 9000, redirects: 2 } as const;
export function evidenceId(key: string) {
  const hex = createHash('sha256').update(key).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export interface ApprovedSource { url: string; provider: string; aliases: string[]; location: string; treatments: string[]; type: ResearchSource['sourceType'] }
// Reviewed official pages, not search-engine snippets. Retrieval is still required for every fact.
export const approvedSources: ApprovedSource[] = [
  { url: 'https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint.html', provider: 'Kokilaben Dhirubhai Ambani Hospital', aliases: ['Kokilaben', 'Kokilaben Hospital'], location: 'Mumbai', treatments: ['knee replacement', 'hip replacement', 'orthopedics'], type: 'official_provider' },
  { url: 'https://www.nanavatimaxhospital.org/our-specialities/orthopaedics-joint-replacement', provider: 'Nanavati Max Super Speciality Hospital', aliases: ['Nanavati', 'Nanavati Max'], location: 'Mumbai', treatments: ['knee replacement', 'hip replacement', 'orthopedics'], type: 'official_provider' },
  { url: 'https://www.apollohospitals.com/region/mumbai/procedures/total-knee-replacement-surgery/', provider: 'Apollo Hospitals Mumbai', aliases: ['Apollo', 'Apollo Hospitals'], location: 'Mumbai', treatments: ['knee replacement'], type: 'official_provider' },
  { url: 'https://www.nanavatimaxhospital.org/our-specialities/knee-replacement-unit', provider: 'Nanavati Max Super Speciality Hospital', aliases: ['Nanavati', 'Nanavati Max'], location: 'Mumbai', treatments: ['knee replacement'], type: 'official_provider' },
];
export function selectSources(input: ResearchInput): ApprovedSource[] {
  const normalized = (v: string) => v.toLowerCase().replaceAll('-', ' ').trim();
  const treatment = normalized(input.treatment ?? input.specialty ?? '');
  if (!treatment) return [];
  const selected = approvedSources.filter(s => normalized(s.location) === normalized(input.location)
    && s.treatments.includes(treatment) && (!input.sourcePreferences || input.sourcePreferences.includes(s.type))
    && (!input.providers?.length || input.providers.some(p => [s.provider, ...s.aliases].some(a => normalized(a) === normalized(p)))));
  // Provider coverage first; only then a second page about the same provider.
  const uniqueProviders = new Set<string>();
  return [...selected.filter(s => { if (uniqueProviders.has(s.provider)) return false; uniqueProviders.add(s.provider); return true; }),
    ...selected.filter(s => selected.find(v => v.provider === s.provider) !== s)].slice(0, input.maxSources);
}
export function validateSourceUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || isIP(parsed.hostname)
    || !approvedSources.some(s => s.url === parsed.href)) throw new Error('Source URL is outside the approved healthcare collection');
  return parsed.href;
}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
      || a === 100 && b >= 64 && b <= 127 || a >= 224 || a === 192 && b === 0 || a === 198 && (b === 18 || b === 19));
  }
  // IPv6 global unicast only; mapped/private/link-local/loopback are excluded.
  return isIP(address) === 6 && /^[23][\da-f]{0,3}:/i.test(address);
}
export function textFromHtml(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(head|title|script|style|noscript|nav|footer|header|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|section|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:\d+|x[\da-f]+);/gi, v => {
      const named: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
      if (named[v.toLowerCase()]) return named[v.toLowerCase()];
      const n = v.startsWith('&#x') ? parseInt(v.slice(3, -1), 16) : parseInt(v.slice(2, -1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
    }).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, RESEARCH_LIMITS.maxText);
}
export interface RetrievedPage { url: string; html: string; retrievedAt: string }
export type ResearchRetriever = (source: ApprovedSource) => Promise<RetrievedPage>;
export const retrieveOfficialPage: ResearchRetriever = async source => {
  let url = validateSourceUrl(source.url);
  const signal = AbortSignal.timeout(RESEARCH_LIMITS.timeoutMs);
  for (let i = 0; i <= RESEARCH_LIMITS.redirects; i++) {
    const addresses = await lookup(new URL(url).hostname, { all: true });
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Unsafe source address');
    const response = await fetch(url, { redirect: 'manual', signal, cache: 'no-store', headers: { Accept: 'text/html', 'User-Agent': 'MedBridgeResearch/1.0 (public healthcare evidence)' } });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      url = validateSourceUrl(new URL(response.headers.get('location') ?? '', url).href); continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || Number(response.headers.get('content-length')) > RESEARCH_LIMITS.maxBytes) {
      await response.body?.cancel(); throw new Error('Source is unavailable or unsupported');
    }
    const reader = response.body?.getReader(); if (!reader) throw new Error('Empty source');
    const decoder = new TextDecoder(); let html = '', count = 0;
    try { while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      count += chunk.value.byteLength; if (count > RESEARCH_LIMITS.maxBytes) throw new Error('Source exceeds retrieval limit');
      html += decoder.decode(chunk.value, { stream: true });
    } html += decoder.decode(); } finally { await reader.cancel().catch(() => {}); }
    return { url, html, retrievedAt: new Date().toISOString() };
  }
  throw new Error('Source redirect limit reached');
};
