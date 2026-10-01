import type { AgentResponse } from '@/lib/agents/schemas';
import type { ResearchResult } from '@/lib/research/schemas';

export function ResearchResults({ result, comparison }: { result: ResearchResult; comparison?: AgentResponse['researchComparison'] }) {
  const entities = [...new Map(result.findings.map(f => [f.entity.id, f.entity])).values()];
  return <section className="assistant-research" aria-label="External research"><small>EXTERNAL RESEARCH · PUBLIC SOURCE EVIDENCE</small>
    <p>Separate from the MedBridge catalog. Provider statements are not independently verified. Retrieved {new Date(result.retrievedAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}; retrieval does not establish currentness.</p>
    {entities.map((entity, index) => <div key={entity.id}><h3>{index + 1}. {entity.name}</h3><dl>
      {result.findings.filter(f => f.entity.id === entity.id).map(f => <div key={f.id}><dt>{f.field === 'treatment_availability' ? 'Published treatment mention' : f.field.replaceAll('_', ' ')}</dt><dd>
        {f.price ? `${f.price.currency} ${f.price.amount.toLocaleString('en-US')} · ${f.price.kind.replaceAll('_', ' ')} · ${f.price.refersTo}` : <q>{f.value}</q>}
        <small> · {f.status.replaceAll('_', ' ')} · external source</small>
        {f.evidence.map(e => { const source = result.sources.find(s => s.id === e.sourceId)!; return <details key={e.sourceId}><summary>Source and exact evidence</summary>
          <blockquote>{e.snippet}</blockquote><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          <small> · {source.sourceType.replaceAll('_', ' ')} · authority tier {source.authorityLevel} · {source.domain}<br />Retrieved {source.retrievedAt.slice(0, 10)} · {source.freshness.replaceAll('-', ' ')}{source.publishedAt ? ` · Published ${source.publishedAt.slice(0, 10)}` : ''}</small>
        </details>; })}</dd></div>)}
    </dl>{comparison?.sides.find(s => s.entityId === entity.id)?.requirements.map(e => <p key={e.requirementId}>{e.label}: {e.status.replaceAll('_', ' ')}. {e.explanation}</p>)}</div>)}
    {result.conflicts.length > 0 && <div role="status"><h3>Conflicting information found</h3>{result.conflicts.map((c, i) => <p key={i}>{c.field.replaceAll('_', ' ')}: {c.explanation} Both statements and sources are retained above.</p>)}</div>}
    {result.missingInformation.length > 0 && <details open><summary>Missing external information</summary><ul>{result.missingInformation.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>}
    {!result.findings.length && <p>{result.status === 'failed' ? 'External research could not be completed. Internal results remain available.' : 'No reliable evidence found for the requested information in the approved sources.'}</p>}
    {comparison && <p>Published information comparison: {comparison.complete ? 'requested evidence available' : 'incomplete evidence'}. Missing prices do not imply a more expensive provider. No clinical ranking.</p>}
    {result.warnings.length > 0 && <details><summary>Research limitations</summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
  </section>;
}
