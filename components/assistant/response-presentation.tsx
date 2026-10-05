import { T, LocalNumber } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import type { AgentResponse } from '@/lib/agents/schemas';

/** Decorative marks only; the recorded status text remains the accessible label. */
export function StatusMark({ status }: { status: string }) {
  const mark = ['completed', 'reused', 'exact', 'supported', 'fully_satisfies'].includes(status) ? '✓'
    : ['failed', 'not_met', 'blocked'].includes(status) ? '!'
      : ['partially_completed', 'incomplete', 'related'].includes(status) ? '◐' : '○';
  return <span className="assistant-status-mark" data-status={status} aria-hidden="true">{mark}</span>;
}

export function RequestUnderstanding({ response }: { response: AgentResponse }) {
  if (response.verification || !response.requirements?.length) return null;
  return <Localized as="section" className="assistant-understanding" aria-label="Your search criteria">
    <h3 className="assistant-section-title"><T>{"YOU’RE LOOKING FOR"}</T></h3>
    {Boolean(response.requirements?.length) && <Localized as="ul" className="assistant-request-chips" aria-label="Request requirements">
      {response.requirements!.map(requirement => <li key={requirement.id}>{requirement.label}<T>{requirement.desired === false ? ' · excluded' : ''}</T></li>)}
    </Localized>}
  </Localized>;
}

export function FindingsSummary({ response }: { response: AgentResponse }) {
  if (response.verification || response.workflow === 'case_intake') return null;
  const counts = new Map<string, number>();
  for (const finding of response.findings) counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + 1);
  const nouns: Record<string, [string, string]> = { hospitals: ['hospital', 'hospitals'], doctors: ['doctor', 'doctors'], packages: ['package', 'packages'], treatments: ['treatment', 'treatments'], services: ['service', 'services'], countries: ['destination', 'destinations'] };
  return <Localized as="section" className="assistant-findings-summary" aria-label="Findings summary">
    {response.findings.length > 0 ? <h3>{[...counts].map(([kind, count],index) => <span key={kind}>{index>0?' · ':''}<LocalNumber value={count}/>{' '}<T>{(nouns[kind] ?? ['option', 'options'])[count === 1 ? 0 : 1]}</T>{' '}<T>{'found'}</T></span>)}</h3> : !response.research && <p>{response.summary}</p>}
    {response.findings.length > 0 && response.summarySource === 'model' && <p>{response.summary}<small><T>{"Coordination explanation generated from the sources below."}</T></small></p>}
    {response.compoundRequest?.operations.filter(operation => ['incomplete','skipped'].includes(operation.status) && operation.note).map(operation => <p className="assistant-result-notice" role="status" key={operation.id}>{operation.note}</p>)}
  </Localized>;
}
