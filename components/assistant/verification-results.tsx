'use client';
import type { VerificationResult } from '@/lib/verification/schemas';
const label=(s:string)=>s.replaceAll('_',' ');
export function VerificationResults({result,onRequest,disabled}:{result:VerificationResult;onRequest?:(content:string)=>void;disabled:boolean}){
  const report=result.report;
  if(result.peers&&result.peers.length>=2)return <section className="assistant-verification"><h3>Provider Verification · factual comparison</h3><p>{result.message}</p><div className="assistant-comparison"><div className="assistant-table-scroll"><table><thead><tr><th>Field</th>{result.peers.map(p=><th key={p.provider.id}>{p.provider.name}</th>)}</tr></thead><tbody>{[...new Set(result.peers.flatMap(p=>p.scope))].map(field=><tr key={field}><th>{label(field)}</th>{result.peers!.map(p=>{const f=p.fields.find(f=>f.field===field);return <td key={p.provider.id}>{f?`${label(f.status)} · ${f.externalValues.join('; ')||'No external evidence'}`:'Not checked'}</td>;})}</tr>)}</tbody></table></div></div>{result.peers.map(p=><details key={p.id}><summary>Evidence · {p.provider.name}</summary><VerificationResults result={{report:p,history:[],message:'Saved factual evidence.',reused:true}} disabled={disabled}/></details>)}</section>;
  if(!report)return <section className="assistant-verification"><h3>Provider Verification</h3><p>{result.message}</p></section>;
  const request=(action:string)=>onRequest?.(`${action} ${report.provider.name}`);
  return <section className="assistant-verification" aria-label="Provider Verification"><h3>Provider Verification</h3><p><strong>{report.provider.name}</strong> · {report.provider.location}</p>
    <p>{label(report.status)} · Last checked {new Date(report.completedAt).toLocaleString()} {result.reused&&'· Saved evidence reused'}</p>
    <p>{report.counts.verified} verified · {report.counts.conflicting} conflicting · {report.counts.stale} stale · {report.counts.unresolved} unresolved</p>
    <small>Freshness: {report.freshness}. Retrieval time does not prove information is current. Factual evidence does not establish clinical quality or suitability.</small>
    {report.outcomes.length>0&&<p role="status">Verification incomplete: {report.outcomes.map(label).join(', ')}. This is not a judgment about the provider.</p>}
    {onRequest&&<div className="assistant-verification__actions"><button disabled={disabled} onClick={()=>request('Refresh verification for')}>Refresh verification</button><button disabled={disabled} onClick={()=>request('Show verification history for')}>View history</button></div>}
    <div className="assistant-verification__fields">{report.fields.map(field=><details className={`assistant-verification__field ${field.status==='conflicting'?'is-conflicting':''}`} key={field.field}><summary><span>{label(field.field)}</span><strong>{label(field.status)}</strong></summary>
      <p>{field.explanation}</p><p><strong>Internal catalog:</strong> {field.internalValue??'Not recorded'}</p>
      {field.externalValues.map((v,i)=><p key={i}><strong>External value:</strong> {v}</p>)}
      {field.evidence.map((e,i)=>{const source=report.sources.find(s=>s.id===e.sourceId)!;return <div className="assistant-verification__evidence" key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p>{label(source.sourceType)} · Tier {source.authorityLevel} · Official source confirmed: {String(e.officialSourceConfirmed)}</p><blockquote>{e.snippet}</blockquote><small>Retrieved {new Date(source.retrievedAt).toLocaleString()} · Source updated/published {source.publishedAt?new Date(source.publishedAt).toLocaleDateString():'unknown'} · Field freshness {field.freshness}</small></div>;})}
      {!field.evidence.length&&<p>No authoritative evidence collected for this field.</p>}
      {onRequest&&field.status!=='not_applicable'&&<button disabled={disabled} onClick={()=>request(`${field.status==='conflicting'?'Recheck':'Verify'} ${label(field.field)} for`)}>{field.status==='conflicting'?'Recheck conflicting field':'Verify this field'}</button>}
    </details>)}</div>
    {result.history.length>0&&<details open><summary>Verification history · {result.history.length} saved runs</summary><ol>{result.history.map(r=><li key={r.id}>{new Date(r.completedAt).toLocaleString()} · {r.scope.length} fields · {r.counts.verified} verified · {r.counts.conflicting} conflicting · {r.counts.unresolved} unresolved · {label(r.status)}</li>)}</ol></details>}
    {report.warnings.map((w,i)=><p key={i}>{w}</p>)}
  </section>;
}
