import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from './fixtures/render';
vi.mock('server-only', () => ({}));
import { fixtureReport, verificationFixtures, withVerificationFixtures, fixtureSources, fixtureTime } from './fixtures/provider-verification-fixtures';
import { approvedSources } from '@/lib/research/collection';
import { verificationReportSchema } from '@/lib/verification/schemas';
import { ResponseBlocks } from '@/components/assistant/assistant-workspace';
import { StatusBadge } from '@/components/ui/status-badge';
import { ageVerificationReport } from '@/lib/verification/service';
import { isActiveNavigation } from '@/lib/navigation';
import type { AgentResponse } from '@/lib/agents/schemas';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PageHeader } from '@/components/page-header';

describe('isolated deterministic provider QA fixtures', () => {
  it.each(verificationFixtures)('$fixtureId classifies exact source statements into expected states', fixture => withVerificationFixtures(() => {
    const report = fixtureReport(fixture);
    expect(report.fields.map(f => f.status)).toEqual(fixture.expectedFields);
    expect(report.status).toBe(fixture.expectedReport);
    expect(report.completedAt).toBe(fixture.completedAt);
    expect(report.sources.every(s => s.domain === 'provider-verification-qa.invalid' && s.authorityLevel === fixture.authorityLevel && s.sourceType === fixture.sourceType)).toBe(true);
  }));
  it('removes all QA sources after successful execution and after failure', async () => {
    const before = [...approvedSources];
    await expect(withVerificationFixtures(() => { throw Error('QA cleanup check'); })).rejects.toThrow('QA cleanup');
    expect(approvedSources).toEqual(before); expect(approvedSources).not.toEqual(expect.arrayContaining(fixtureSources));
  });
  it('preserves both source values and exact snippets for conflicting addresses', () => withVerificationFixtures(() => {
    const report = fixtureReport(verificationFixtures.find(f => f.fixtureId === 'qa-conflict')!);
    expect(report.fields[0].externalValues).toEqual(['QA Road A, Mumbai (fixture only)', 'QA Road B, Mumbai (fixture only)']);
    expect(report.fields[0].evidence.map(e => e.snippet)).toEqual(verificationFixtures.find(f => f.fixtureId === 'qa-conflict')!.exactEvidence);
    expect(new Set(report.fields[0].evidence.map(e => e.sourceId)).size).toBe(2);
  }));
  it('projects all four configurable freshness states without inventing timestamps or history', () => withVerificationFixtures(() => {
    const report = fixtureReport(verificationFixtures[0]);
    const policy = { default: { agingAfterDays: 7, staleAfterDays: 21 } };
    expect(ageVerificationReport(report, policy, fixtureTime).fields[0].freshness).toBe('current');
    expect(ageVerificationReport(report, policy, '2026-10-12T09:00:00.000Z').fields[0].freshness).toBe('aging');
    const stale = ageVerificationReport(report, policy, '2026-11-12T09:00:00.000Z');
    expect(stale.fields[0].freshness).toBe('stale'); expect(stale.completedAt).toBe(fixtureTime);
    expect(ageVerificationReport(report, {}, fixtureTime).fields[0].freshness).toBe('unknown');
    expect(report.fields[0].status).toBe('verified');
  }));
  it('rejects supported evidence on a synthetic provider record', () => withVerificationFixtures(() => {
    const report = fixtureReport(verificationFixtures[0]);
    report.provider.sourceKind = 'medbridge_catalog'; report.provider.catalogSourceKind = 'synthetic';
    expect(verificationReportSchema.safeParse(report).success).toBe(false);
  }));
  it('rejects a completed badge when a field remains unresolved', () => withVerificationFixtures(() => {
    const report = fixtureReport(verificationFixtures[1]); report.status = 'completed';
    expect(verificationReportSchema.safeParse(report).success).toBe(false);
  }));
});
describe('result-aware presentation', () => {
  it.each(verificationFixtures)('$fixtureId shows provider outcomes before collapsed activity without a catalog count', fixture => withVerificationFixtures(() => {
    const report = fixtureReport(fixture);
    const response: AgentResponse = { conversationId: report.conversationId, runId: report.id, agent: 'provider_verification', status: 'completed', understanding: 'Check provider details', summary: 'Saved factual check', findings: [], tasks: [], nextSteps: [], question: null, verification: { report, history: [], reused: false, message: 'QA only' }, activity: { runId: report.id, state: 'completed', steps: [], warnings: [], updatedAt: fixtureTime } };
    const html = renderToStaticMarkup(createElement(ResponseBlocks, { response, disabled: false, onDecision: () => {} }));
    expect(html).not.toContain('Catalog records'); expect(html).not.toContain('0 catalog');
    expect(html).toContain('PROVIDER VERIFICATION');
    expect(html).not.toContain('Recorded agent activity');
    expect(html).not.toContain(response.runId);
    expect(html).not.toContain('source_unavailable'); expect(html).not.toContain('unsupported_source');
    expect(html).toContain('View evidence'); expect(html).toContain('unresolved');
    if (report.counts.verified === 0) expect(html).not.toContain('Partially verified');
  }));
  it('uses human status labels and independent text/icons', () => expect(renderToStaticMarkup(createElement(StatusBadge, { status: 'verification_incomplete' }))).toContain('Verification incomplete'));
  it.each([['/hospitals/demo-care-mumbai','/hospitals',true],['/assistant','/',false],['/','/',true],['/doctors','/discover',false]])('active navigation respects %s', (path, href, active) => expect(isActiveNavigation(path as string,href as string)).toBe(active));
  it('can export an explicitly labelled local QA gallery outside the application', async () => {
    if (!process.env.MEDBRIDGE_QA_SCREENSHOT_DIR) return;
    const directory = process.env.MEDBRIDGE_QA_SCREENSHOT_DIR;
    await mkdir(directory, { recursive: true });
    const css = (await Promise.all(['app/globals.css','app/product.css','app/ui-system.css','app/assistant/assistant.css'].map(file => readFile(file,'utf8')))).join('\n');
    await withVerificationFixtures(async () => {
      for (const fixture of verificationFixtures) {
        const report = fixtureReport(fixture);
        const response: AgentResponse = { conversationId: report.conversationId, runId: report.id, agent: 'provider_verification', status: 'completed', understanding: 'TEST / QA only', summary: 'TEST / QA only', findings: [], tasks: [], nextSteps: [], question: null, verification: { report, history: [], reused: false, message: 'QA only' } };
        const markup = renderToStaticMarkup(createElement('main', { className: 'container assistant-page' }, createElement(PageHeader,{eyebrow:'TEST / QA ONLY · SYNTHETIC EVIDENCE',title:'Verification QA fixtures',description:'Not real provider evidence. This local gallery is excluded from the MedBridge application and production source collection.'}),createElement('h2',null,fixture.fixtureId),createElement(ResponseBlocks,{response,disabled:false,onDecision:()=>{}})));
        await writeFile(join(directory,fixture.fixtureId+'.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TEST / QA ONLY · ${fixture.fixtureId}</title><style>${css}</style><body>${markup}</body></html>`);
      }
    });
  });
});
