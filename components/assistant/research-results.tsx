import type { AgentResponse } from '@/lib/agents/schemas';
import type { ResearchResult } from '@/lib/research/schemas';
import { StatusMark } from './response-presentation';

export function ResearchResults({ result, comparison }: { result: ResearchResult; comparison?: AgentResponse['researchComparison'] }) {
  const entities = [...new Map(result.findings.map(f => [f.entity.id, f.entity])).values()];
  return <section className="assistant-research" aria-label="External research">
    <h3 className="assistant-section-title">EXTERNAL RESEARCH · PUBLIC SOURCE EVIDENCE</h3>
    <p className="assistant-research__caveat">Separate from the MedBridge catalog. Provider statements are not independently verified. Retrieved {new Date(result.retrievedAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}; retrieval does not establish currentness.</p>
    {entities.map((entity, index) => <article className="assistant-research__entity" key={entity.id}><h4>{index + 1}. {entity.name}</h4><dl className="assistant-evidence">
      {result.findings.filter(f => f.entity.id === entity.id).map(f => <div className="assistant-evidence__finding" key={f.id}>
        <dt>{f.field === 'treatment_availability' ? 'Published treatment mention' : f.field.replaceAll('_', ' ')}</dt><dd>
          <div className="assistant-evidence__value">{f.price ? `${f.price.currency} ${f.price.amount.toLocaleString('en-US')} · ${f.price.kind.replaceAll('_', ' ')} · ${f.price.refersTo}` : <q>{f.value}</q>}</div>
          <span className="assistant-evidence__status"><StatusMark status={f.status} />{f.status.replaceAll('_', ' ')} · external source</span>
          {f.evidence.map(e => { const source = result.sources.find(s => s.id === e.sourceId)!; return <div className="assistant-evidence__source" key={e.sourceId}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            <div className="assistant-source-metadata"><span>{source.sourceType.replaceAll('_', ' ')}</span><span>authority tier {source.authorityLevel}</span><span>{source.domain}</span>
              <span>Retrieved {source.retrievedAt.slice(0, 10)}</span><span>{source.freshness.replaceAll('-', ' ')}</span>{source.publishedAt && <span>Published {source.publishedAt.slice(0, 10)}</span>}</div>
            <details><summary>Source and exact evidence</summary><blockquote>{e.snippet}</blockquote></details>
          </div>; })}
        </dd></div>)}
    </dl>{Boolean(comparison?.sides.find(s => s.entityId === entity.id)?.requirements.length) && <section className="assistant-requirements" aria-label="External requirement evaluation">
      <h5>Requirements</h5><ul>{comparison!.sides.find(s => s.entityId === entity.id)!.requirements.map(e => <li key={e.requirementId}>
        <div className="assistant-requirement-title"><StatusMark status={e.status} /><strong>{e.label}</strong></div><span className="assistant-status" data-status={e.status}>{e.status.replaceAll('_', ' ')}</span>
        <details><summary>Evidence and reason</summary><p>{e.explanation}</p></details>
      </li>)}</ul></section>}</article>)}
    {result.conflicts.length > 0 && <div className="assistant-research__notice" role="status"><h4>Conflicting information found</h4>{result.conflicts.map((c, i) => <p key={i}>{c.field.replaceAll('_', ' ')}: {c.explanation} Both statements and sources are retained above.</p>)}</div>}
    {result.missingInformation.length > 0 && <details className="assistant-research__missing" open><summary>Missing external information</summary><ul>{result.missingInformation.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>}
    {!result.findings.length && <p className="assistant-research__notice">{result.status === 'failed' ? 'External research could not be completed. Internal results remain available.' : 'No reliable evidence found for the requested information in the approved sources.'}</p>}
    {comparison && <p className="assistant-research__caveat">Published information comparison: {comparison.complete ? 'requested evidence available' : 'incomplete evidence'}. Missing prices do not imply a more expensive provider. No clinical ranking.</p>}
    {result.warnings.length > 0 && <details className="assistant-research__limitations"><summary>Research limitations</summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
  </section>;
}
