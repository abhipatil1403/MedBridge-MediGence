import type { AgentResponse } from '@/lib/agents/schemas';

/** Decorative marks only; the recorded status text remains the accessible label. */
export function StatusMark({ status }: { status: string }) {
  const mark = ['completed', 'reused', 'exact', 'supported', 'fully_satisfies'].includes(status) ? '✓'
    : ['failed', 'not_met', 'blocked'].includes(status) ? '!'
      : ['partially_completed', 'incomplete', 'related'].includes(status) ? '◐' : '○';
  return <span className="assistant-status-mark" data-status={status} aria-hidden="true">{mark}</span>;
}

export function RequestUnderstanding({ response }: { response: AgentResponse }) {
  return <section className="assistant-understanding" aria-label="What I understood">
    <h3 className="assistant-section-title">WHAT I UNDERSTOOD</h3>
    <p>{response.understanding}</p>
    {Boolean(response.requirements?.length) && <ul className="assistant-request-chips" aria-label="Request requirements">
      {response.requirements!.map(requirement => <li key={requirement.id}>{requirement.label}{requirement.desired === false ? ' · excluded' : ''}</li>)}
    </ul>}
  </section>;
}

export function FindingsSummary({ response }: { response: AgentResponse }) {
  return <section className="assistant-findings-summary" aria-label="Findings summary">
    <h3 className="assistant-section-title">FINDINGS</h3>
    <dl className="assistant-summary-metrics">
      <div><dt>Catalog records</dt><dd>{response.findings.length}</dd></div>
      {response.research && <>
        <div><dt>External evidence items</dt><dd>{response.research.findings.length}</dd></div>
        <div><dt>Retrieved sources</dt><dd>{response.research.sources.length}</dd></div>
      </>}
    </dl>
    <p>{response.summary}</p>
    {response.summarySource === 'model' && <small>Model-generated coordination explanation. Catalog facts are sourced below.</small>}
  </section>;
}
