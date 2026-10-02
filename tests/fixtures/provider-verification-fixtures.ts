/** TEST / QA ONLY. Reserved .invalid hosts are never fetched or production sources. */
import { approvedSources, type ApprovedSource } from '@/lib/research/collection';
import { extractVerificationEvidence } from '@/lib/verification/evidence';
import { classifyReport } from '@/lib/verification/classify';
import type { VerificationField, VerificationProvider, VerificationReport } from '@/lib/verification/schemas';

export const fixtureTime = '2026-10-02T09:00:00.000Z';
export const fixtureProvider: VerificationProvider = { id: 'f1100000-0000-4000-8000-000000000001', name: 'QA Fixture Hospital · NOT A REAL PROVIDER', type: 'hospital', location: 'Mumbai', sourceKind: 'external_source' };
export const fixtureSources: ApprovedSource[] = [
  { url: 'https://provider-verification-qa.invalid/official-a', provider: fixtureProvider.name, aliases: [fixtureProvider.name], location: 'Mumbai', treatments: [], type: 'official_provider' },
  { url: 'https://provider-verification-qa.invalid/official-b', provider: fixtureProvider.name, aliases: [fixtureProvider.name], location: 'Mumbai', treatments: [], type: 'official_provider' },
];
export type VerificationFixture = {
  fixtureId: string; sourceType: ApprovedSource['type']; authorityLevel: number; field: VerificationField;
  exactEvidence: string[]; retrievedAt: string; completedAt: string; expectedFields: VerificationReport['fields'][number]['status'][];
  scope: VerificationField[]; outcomes: VerificationReport['outcomes']; internal?: Partial<Record<VerificationField, string>>;
  expectedReport: VerificationReport['status']; stale?: boolean;
};
export const verificationFixtures: VerificationFixture[] = [
  { fixtureId: 'qa-verified', sourceType: 'official_provider', authorityLevel: 1, field: 'address', exactEvidence: ['Address: QA Road, Mumbai (fixture only)'], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['address'], expectedFields: ['verified'], outcomes: [], expectedReport: 'completed' },
  { fixtureId: 'qa-partial', sourceType: 'official_provider', authorityLevel: 1, field: 'address', exactEvidence: ['Address: QA Road, Mumbai (fixture only)'], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['address','email'], expectedFields: ['verified','not_found'], outcomes: [], expectedReport: 'partial' },
  { fixtureId: 'qa-conflict', sourceType: 'official_provider', authorityLevel: 1, field: 'address', exactEvidence: ['Address: QA Road A, Mumbai (fixture only)', 'Address: QA Road B, Mumbai (fixture only)'], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['address'], expectedFields: ['conflicting'], outcomes: [], expectedReport: 'partial' },
  { fixtureId: 'qa-not-found', sourceType: 'official_provider', authorityLevel: 1, field: 'email', exactEvidence: [], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['email'], expectedFields: ['not_found'], outcomes: [], expectedReport: 'partial' },
  { fixtureId: 'qa-unverified', sourceType: 'official_provider', authorityLevel: 1, field: 'address', exactEvidence: [], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['address'], expectedFields: ['unverified'], outcomes: ['source_unavailable'], expectedReport: 'verification_incomplete' },
  { fixtureId: 'qa-stale', sourceType: 'official_provider', authorityLevel: 1, field: 'address', exactEvidence: ['Address: QA Road, Mumbai (fixture only)'], retrievedAt: '2026-09-01T09:00:00.000Z', completedAt: fixtureTime, scope: ['address'], expectedFields: ['stale'], outcomes: [], expectedReport: 'partial', stale: true },
  { fixtureId: 'qa-incomplete-timeout', sourceType: 'official_provider', authorityLevel: 1, field: 'phone', exactEvidence: [], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['phone'], expectedFields: ['unverified'], outcomes: ['timeout'], expectedReport: 'verification_incomplete' },
  { fixtureId: 'qa-internal-only', sourceType: 'official_provider', authorityLevel: 1, field: 'city', exactEvidence: [], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['city'], internal: { city: 'Mumbai (fixture only)' }, expectedFields: ['internal_only'], outcomes: ['unsupported_source'], expectedReport: 'verification_incomplete' },
  { fixtureId: 'qa-not-applicable', sourceType: 'official_provider', authorityLevel: 1, field: 'credentials', exactEvidence: [], retrievedAt: fixtureTime, completedAt: fixtureTime, scope: ['credentials'], expectedFields: ['not_applicable'], outcomes: [], expectedReport: 'completed' },
];
export async function withVerificationFixtures<T>(run: () => T | Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Verification fixtures are restricted to explicit test / QA execution.');
  approvedSources.push(...fixtureSources);
  try { return await run(); } finally {
    for (const source of fixtureSources) { const index = approvedSources.indexOf(source); if (index >= 0) approvedSources.splice(index, 1); }
  }
}
/** Use the production parser/classifier. Expected statuses are assertions, not assigned facts. */
export function fixtureReport(fixture: VerificationFixture): VerificationReport {
  if (process.env.NODE_ENV !== 'test') throw new Error('QA-only reports');
  const pages = fixture.outcomes.length ? [] : (fixture.exactEvidence.length > 1 ? fixtureSources : fixtureSources.slice(0,1)).map((source, index) => extractVerificationEvidence(fixtureProvider, source, {
    url: source.url, retrievedAt: fixture.retrievedAt,
    html: `<html><title>TEST / QA fixture only</title><body><h1>${fixtureProvider.name}</h1><p>${fixture.exactEvidence[index] ?? ''}</p></body></html>`,
  }, fixture.scope));
  return classifyReport({ id: 'f1100000-0000-4000-8000-000000000002', ownerId: 'f1100000-0000-4000-8000-000000000003', conversationId: 'f1100000-0000-4000-8000-000000000004', provider: fixtureProvider, scope: fixture.scope, internal: fixture.internal ?? {}, sources: pages.map(p => p.source), evidence: pages.flatMap(p => p.evidence), outcomes: fixture.outcomes, startedAt: fixture.completedAt, completedAt: fixture.completedAt, policy: fixture.stale ? { default: { agingAfterDays: 7, staleAfterDays: 21 } } : {}, warnings: ['TEST / QA FIXTURE. This report is not real provider evidence.'] });
}
