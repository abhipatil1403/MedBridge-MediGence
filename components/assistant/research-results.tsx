import { LocalDate } from '@/components/experience/translation';
import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import type { AgentResponse } from '@/lib/agents/schemas';
import type { ResearchResult } from '@/lib/research/schemas';
import { StatusMark } from './response-presentation';

export function ResearchResults({ result, comparison }: { result: ResearchResult; comparison?: AgentResponse['researchComparison'] }) {
  const entities = [...new Map(result.findings.map(f => [f.entity.id, f.entity])).values()];
  return <Localized as="section" className="assistant-research" aria-label="External research">
    <h3><T>{"Public source research"}</T></h3>
    <p className="assistant-research__caveat"><T>{"Separate from the MedBridge catalog. Provider statements are not independently verified. Retrieved"}</T>{' '}<LocalDate value={result.retrievedAt}/><T>{"; retrieval does not establish currentness."}</T></p>
    {entities.map((entity, index) => <article className="assistant-research__entity" key={entity.id}><h4>{index + 1}. {entity.name}</h4><dl className="assistant-evidence">
      {result.findings.filter(f => f.entity.id === entity.id).map(f => <div className="assistant-evidence__finding" key={f.id}>
        <dt>{f.field === 'treatment_availability' ? 'Published treatment mention' : f.field.replaceAll('_', ' ')}</dt><dd>
          <div className="assistant-evidence__value">{f.price ? `${f.price.currency} ${f.price.amount.toLocaleString('en-US')} · ${f.price.kind.replaceAll('_', ' ')} · ${f.price.refersTo}` : <q>{f.value}</q>}</div>
          <span className="assistant-evidence__status"><StatusMark status={f.status} />{f.status.replaceAll('_', ' ')} <T>{"· external source"}</T></span>
          {f.evidence.map(e => { const source = result.sources.find(s => s.id === e.sourceId)!; return <div className="assistant-evidence__source" key={e.sourceId}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            <details className="assistant-source-metadata"><summary><T>{"Source details"}</T></summary><span>{source.sourceType.replaceAll('_', ' ')}</span><span><T>{"authority tier"}</T>{' '}{source.authorityLevel}</span><span>{source.domain}</span>
              <span><T>{"Retrieved"}</T>{' '}{source.retrievedAt.slice(0, 10)}</span><span>{source.freshness.replaceAll('-', ' ')}</span>{source.publishedAt && <span><T>{"Published"}</T>{' '}{source.publishedAt.slice(0, 10)}</span>}</details>
            <details><summary><T>{"Source and exact evidence"}</T></summary><blockquote>{e.snippet}</blockquote></details>
          </div>; })}
        </dd></div>)}
    </dl>{Boolean(comparison?.sides.find(s => s.entityId === entity.id)?.requirements.length) && <Localized as="section" className="assistant-requirements" aria-label="External requirement evaluation">
      <h5><T>{"Requirements"}</T></h5><ul>{comparison!.sides.find(s => s.entityId === entity.id)!.requirements.map(e => <li key={e.requirementId}>
        <div className="assistant-requirement-title"><StatusMark status={e.status} /><strong>{e.label}</strong></div><span className="assistant-status" data-status={e.status}>{e.status.replaceAll('_', ' ')}</span>
        <details><summary><T>{"Evidence and reason"}</T></summary><p>{e.explanation}</p></details>
      </li>)}</ul></Localized>}</article>)}
    {result.conflicts.length > 0 && <div className="assistant-research__notice" role="status"><h4><T>{"Conflicting information found"}</T></h4>{result.conflicts.map((c, i) => <p key={i}>{c.field.replaceAll('_', ' ')}: {c.explanation} <T>{"Both statements and sources are retained above."}</T></p>)}</div>}
    {result.missingInformation.length > 0 && <details className="assistant-research__missing" open><summary><T>{"Missing external information"}</T></summary><ul>{result.missingInformation.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>}
    {!result.findings.length && <p className="assistant-research__notice"><T>{result.status === 'failed' ? 'External research could not be completed. Internal results remain available.' : 'No reliable evidence found for the requested information in the approved sources.'}</T></p>}
    {comparison && <p className="assistant-research__caveat"><T>{"Published information comparison:"}</T><T>{comparison.complete ? 'requested evidence available' : 'incomplete evidence'}</T><T>{". Missing prices do not imply a more expensive provider. No clinical ranking."}</T></p>}
    {result.warnings.length > 0 && <details className="assistant-research__limitations"><summary><T>{"Research limitations"}</T></summary><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
  </Localized>;
}
