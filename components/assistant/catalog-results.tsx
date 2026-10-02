import Link from 'next/link';
import type { Finding, PlanningResultGroup } from '@/lib/agents/schemas';
import { RequirementResults } from './requirement-results';
import { StatusBadge } from '@/components/ui/status-badge';
import { resultGroupLabel } from '@/lib/agents/treatment-planning/results';

type Actions = { onRequest?: (content: string) => void; disabled?: boolean };
export function PlanningResultGroups({ groups, onRequest, disabled }: { groups: PlanningResultGroup[] } & Actions) {
  return <>{groups.map(group => <section className="assistant-result-group" key={group.taskId} aria-label={`${group.target} results`}>
    {!group.findings.length && <div className="assistant-empty-result" role="status"><h3>{group.status === 'blocked' ? `The ${group.target} search couldn’t finish` : `No ${group.target} matched those requirements`}</h3><p>{group.status === 'blocked' ? 'Retry your request to check these options.' : 'Try another city or broaden your requirements.'}</p></div>}
    {group.matchType === 'related' && <p className="assistant-match-reason">Related options · the requested treatment is not confirmed.</p>}
    <FindingCards findings={group.findings} onRequest={onRequest} disabled={disabled} />
    <details className="assistant-evidence-review"><summary>Search details · {group.target}</summary><p>{resultGroupLabel(group)}</p><p>{group.matchReason}</p></details>
  </section>)}</>;
}
const names: Record<string, string> = { hospitals: 'Hospital', doctors: 'Doctor', packages: 'Package', treatments: 'Treatment', services: 'Service', countries: 'Destination' };
function factLabel(key: string) { return key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()); }
function factValue(value: unknown) { return String(value ?? 'Not recorded'); }

export function FindingCards({ findings, onRequest, disabled }: { findings: Finding[] } & Actions) {
  return findings.length > 0 && <div className="assistant-finding-grid">{findings.map(item => <article key={item.provenance.recordId} className={`assistant-finding assistant-finding--${item.kind}${item.kind === 'packages' ? ' assistant-finding--package' : ''}`} data-requirement-status={item.requirementEvaluation?.overallStatus}>
    <div className="assistant-finding__type"><span>{names[item.kind] ?? 'Care option'}</span>{item.provenance.sourceKind === 'synthetic' && <StatusBadge status="demo" />}</div>
    <h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>
    {item.facts.city && <p className="assistant-finding__location">{String(item.facts.city)}{item.facts.country ? `, ${factValue(item.facts.country).replaceAll('-', ' ')}` : ''}</p>}
    {!(item.provenance.sourceKind === 'synthetic' && ['hospitals','doctors'].includes(item.kind)) && <p>{item.detail}</p>}
    {item.provenance.sourceKind === 'synthetic' && ['hospitals', 'doctors'].includes(item.kind) && <small>Synthetic provider record · Not a live provider</small>}
    {item.kind === 'packages' && <p className="assistant-package-facts">{typeof (item.facts.listedPrice??item.facts.samplePriceUsd) === 'number' && Number(item.facts.listedPrice??item.facts.samplePriceUsd) > 0 ? `${item.facts.currency??'USD'} ${Number(item.facts.listedPrice??item.facts.samplePriceUsd).toLocaleString('en-US')} ${item.provenance.sourceKind==='synthetic'?'sample price':'listed estimate'}` : 'Listed price not specified'}{typeof item.facts.durationDays === 'number' && item.facts.durationDays > 0 ? ` · ${item.facts.durationDays} days` : ''}<small>{item.provenance.sourceKind==='synthetic'?'Sample price':'Listed estimate'} · Not a provider quote</small></p>}
    <RequirementResults evaluation={item.requirementEvaluation} />
    <div className="assistant-finding__actions">{item.href && <Link href={item.href}>View details →</Link>}
      {onRequest && ['hospitals', 'doctors'].includes(item.kind) && <button type="button" disabled={disabled} onClick={() => onRequest(`Verify ${item.title}`)}>Check provider information</button>}
      {onRequest && item.kind === 'hospitals' && <button type="button" disabled={disabled} onClick={() => onRequest(`Show packages for ${item.title}`)}>Explore packages</button>}
      {onRequest && item.kind === 'hospitals' && <button type="button" disabled={disabled} onClick={() => onRequest(`Organize documents for ${item.title}`)}>Organize documents</button>}
    </div>
    <details className="assistant-finding__evidence"><summary>View evidence and full details</summary><p>{item.matchReason}</p>
      <dl className="assistant-metadata">{Object.entries(item.facts).filter(([key]) => !/(?:Id|Slug)$/.test(key)).map(([key, value]) => <div key={key}><dt>{factLabel(key)}</dt><dd>{factValue(value)}</dd></div>)}</dl>
      <footer>{item.provenance.sourceKind === 'synthetic' ? 'Demo data' : item.provenance.sourceKind === 'external' ? 'External catalog data' : 'MedBridge data'} · {item.provenance.label} · Record {item.provenance.recordId.slice(0, 8)} · Retrieved {new Date(item.provenance.retrievedAt).toLocaleDateString()}</footer>
    </details>
  </article>)}</div>;
}
