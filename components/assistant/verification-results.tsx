'use client';
import type { VerificationResult } from '@/lib/verification/schemas';
import { StatusBadge, statusLabel } from '@/components/ui/status-badge';

export function fieldLabel(field: string) {
  const labels: Record<string, string> = { international_patients: 'International patient support', consultation_mode: 'Consultation mode', teleconsultation: 'Video consultation', phone: 'Phone', email: 'Email', profile: 'Provider profile', accreditation: 'Accreditation' };
  return labels[field] ?? field.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
}
const outcomes: Record<string, string> = {
  timeout: 'A source took too long to respond. Try refreshing the check.',
  rate_limit: 'A source temporarily limited requests. Please try again later.',
  source_unavailable: 'An authoritative source could not be reached. You can refresh this check.',
  unsupported_source: 'No reviewed authoritative source is available for this provider.',
  provider_not_resolved: 'Choose the provider you want to check.',
};
const sourceTypes: Record<string, string> = { official_provider: 'Official provider', health_authority: 'Health authority', regulator: 'Official registry', healthcare_organization: 'Healthcare organization', secondary: 'Reviewed secondary source' };
const visibleReportStatus = (report: NonNullable<VerificationResult['report']>) => report.status === 'partial' && report.counts.verified === 0
  ? report.counts.conflicting > 0 ? 'conflicting' : report.counts.stale > 0 ? 'stale' : 'unverified'
  : report.status;

export function VerificationResults({ result, onRequest, disabled }: { result: VerificationResult; onRequest?: (content: string) => void; disabled: boolean }) {
  const report = result.report;
  if (result.peers && result.peers.length >= 2) return <section className="assistant-verification" aria-label="Provider Verification comparison"><h3>Provider verification comparison</h3><p>{result.message}</p>
    <div className="assistant-table-scroll" role="region" aria-label="Factual field comparison" tabIndex={0}><table><caption>Saved factual evidence · no clinical ranking</caption><thead><tr><th scope="col">Field</th>{result.peers.map(p => <th scope="col" key={p.provider.id}>{p.provider.name}</th>)}</tr></thead><tbody>{[...new Set(result.peers.flatMap(p => p.scope))].map(field => <tr key={field}><th scope="row">{fieldLabel(field)}</th>{result.peers!.map(p => { const f = p.fields.find(f => f.field === field); return <td key={p.provider.id}>{f ? <><StatusBadge status={f.status} /><p>{f.externalValues.join('; ') || 'No external evidence'}</p></> : 'Not checked'}</td>; })}</tr>)}</tbody></table></div>
    {result.peers.map(p => <details key={p.id}><summary>Evidence · {p.provider.name}</summary><VerificationResults result={{ report: p, history: [], message: 'Saved factual evidence.', reused: true }} disabled={disabled} /></details>)}
  </section>;
  if (!report) return <section className="assistant-verification" aria-label="Provider Verification"><h3>Provider Verification</h3><p>{result.message}</p></section>;
  const request = (action: string) => onRequest?.(`${action} ${report.provider.name}`);
  // Older saved demo checks predate catalogSourceKind; keep their explicit demo identity visible.
  const synthetic = report.provider.catalogSourceKind === 'synthetic' || (report.provider.sourceKind === 'medbridge_catalog' && /^(MedBridge Demo Centre|Demo Clinician|Demo Cardiology Clinician)/.test(report.provider.name));
  return <section className="assistant-verification" aria-label="Provider Verification">
    <p className="eyebrow">PROVIDER VERIFICATION</p><h3>{report.provider.name}</h3><p className="assistant-verification__location">{report.provider.location}</p>
    {synthetic && <p><StatusBadge status="demo" /> <span>Synthetic provider record · Not a live provider</span></p>}
    <div className="assistant-verification__status" role="status"><StatusBadge status={visibleReportStatus(report)} /><strong>{report.counts.verified} verified · {report.counts.unresolved} unresolved</strong></div>
    {(report.counts.conflicting > 0 || report.counts.stale > 0) && <p>{report.counts.conflicting > 0 && `${report.counts.conflicting} ${report.counts.conflicting === 1 ? 'field has' : 'fields have'} conflicting values. `}{report.counts.stale > 0 && `${report.counts.stale} ${report.counts.stale === 1 ? 'field has' : 'fields have'} stale evidence. `}Review the evidence before relying on these details.</p>}
    <p className="assistant-verification__date">Last checked {new Date(report.completedAt).toLocaleString()}{result.reused ? ' · Saved evidence' : ''}</p>
    {report.outcomes.length > 0 && <p className="assistant-verification__notice">{report.outcomes.map(value => outcomes[value]).join(' ')}{!synthetic && ' Missing evidence is not a judgment about this provider.'}</p>}
    {onRequest && <div className="assistant-verification__actions"><button type="button" className="button button--outline" disabled={disabled} onClick={() => request('Refresh verification for')}>Refresh verification</button><button type="button" className="button button--text" disabled={disabled} onClick={() => request('Show verification history for')}>View history</button></div>}
    <div className="assistant-verification__fields">{[
      { title: 'Verified information', fields: report.fields.filter(field=>field.status === 'verified') },
      { title: 'Conflicts and stale evidence', fields: report.fields.filter(field=>['conflicting','stale'].includes(field.status)) },
      { title: 'Needs confirmation', fields: report.fields.filter(field=>!['verified','conflicting','stale','not_applicable'].includes(field.status)) },
      { title: 'Not applicable', fields: report.fields.filter(field=>field.status === 'not_applicable') },
    ].filter(group=>group.fields.length).map(group=><details className="verification-field-group" key={group.title} open={group.title !== 'Needs confirmation' || group.fields.length <= 5}><summary>{group.title}<span>{group.fields.length} {group.fields.length === 1 ? 'field' : 'fields'}</span></summary>{group.title === 'Needs confirmation' && <p className="editorial-note">These details are not supported by collected authoritative evidence. Open a field to inspect the reason or recheck it.</p>}{group.fields.map(field => <details className={`assistant-verification__field${field.status === 'conflicting' ? ' is-conflicting' : ''}`} key={field.field}>
      <summary aria-label={`${fieldLabel(field.field)} · ${statusLabel(field.status)} · View evidence`}><span>{fieldLabel(field.field)}</span><StatusBadge status={field.status} /><span className="assistant-verification__disclosure" aria-hidden="true">＋</span></summary>
      <p>{field.explanation}</p><p><strong>Internal catalog:</strong> {field.internalValue ?? 'Not recorded'}</p>
      {field.externalValues.map((value, i) => <p key={i}><strong>External value:</strong> {value}</p>)}
      {field.evidence.map((evidence, i) => { const source = report.sources.find(s => s.id === evidence.sourceId)!; return <div className="assistant-verification__evidence" key={i}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p>{sourceTypes[source.sourceType]} · Authority tier {source.authorityLevel} · Official source confirmed: {evidence.officialSourceConfirmed === true ? 'Yes' : 'Unknown'}</p>
        <blockquote>{evidence.snippet}</blockquote><small>Retrieved {new Date(source.retrievedAt).toLocaleString()} · Source updated/published {source.publishedAt ? new Date(source.publishedAt).toLocaleDateString() : 'Unknown'}</small><p><StatusBadge status={field.freshness} /></p>
      </div>; })}
      {!field.evidence.length && <p>No authoritative evidence collected for this field.</p>}
      {onRequest && field.status !== 'not_applicable' && <button type="button" className="button button--outline" disabled={disabled} onClick={() => request(`${field.status === 'conflicting' ? 'Recheck' : 'Verify'} ${fieldLabel(field.field)} for`)}>{field.status === 'conflicting' ? 'Recheck conflicting field' : 'Verify this field'}</button>}
    </details>)}</details>)}</div>
    {result.history.length > 0 && <details className="assistant-verification__history" open><summary>Verification history · {result.history.length} saved runs</summary><ol>{result.history.map(run => <li key={run.id}><time dateTime={run.completedAt}>{new Date(run.completedAt).toLocaleString()}</time><p>{run.scope.length} fields · {run.counts.verified} verified · {run.counts.conflicting} conflicting · {run.counts.unresolved} unresolved · {statusLabel(visibleReportStatus(run))}</p></li>)}</ol></details>}
    <details className="assistant-verification__limitations"><summary>About this check and its sources</summary><p>Freshness: {report.freshness}. Retrieval time does not prove information is current. Factual evidence does not establish clinical quality or suitability.</p>{report.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
      {synthetic && onRequest && <><p>To explore a real source check, start a separate check of the reviewed public provider below. This does not verify the demo record.</p><button type="button" className="button button--outline" disabled={disabled} onClick={() => onRequest('Verify contact information for Kokilaben Dhirubhai Ambani Hospital in Mumbai')}>Check a public provider’s contact details</button></>}
    </details>
  </section>;
}
