import { LocalDate } from '@/components/experience/translation';
import { T } from '@/components/experience/translation';
import Link from '@/components/catalog-link';
import { Price } from '@/components/experience/price';
import { SaveButton } from '@/components/experience/saved';
import type { Finding, PlanningResultGroup } from '@/lib/agents/schemas';
import { RequirementResults } from './requirement-results';
import { StatusBadge } from '@/components/ui/status-badge';
import { resultGroupLabel } from '@/lib/agents/treatment-planning/results';

type Actions = { onRequest?: (content: string) => void; disabled?: boolean };
export function PlanningResultGroups({ groups, onRequest, disabled }: { groups: PlanningResultGroup[] } & Actions) {
  return <>{groups.map(group => <section className="assistant-result-group" key={group.taskId} aria-label={`${group.target} results`}>
    {!group.findings.length && <div className="assistant-empty-result" role="status"><h3>{group.status === 'blocked' ? `The ${group.target} search couldn’t finish` : `No ${group.target} matched those requirements`}</h3><p><T>{group.status === 'blocked' ? 'Retry your request to check these options.' : 'Try another city or broaden your requirements.'}</T></p></div>}
    {group.matchType === 'related' && <p className="assistant-match-reason"><T>{"Related options · the requested treatment is not confirmed."}</T></p>}
    <FindingCards findings={group.findings} onRequest={onRequest} disabled={disabled} />
    <details className="assistant-evidence-review"><summary><T>{"Search details ·"}</T>{' '}{group.target}</summary><p>{resultGroupLabel(group)}</p><p>{group.matchReason}</p></details>
  </section>)}</>;
}
const names: Record<string, string> = { hospitals: 'Hospital', doctors: 'Doctor', packages: 'Package', treatments: 'Treatment', services: 'Service', countries: 'Destination' };
function factLabel(key: string) { return key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()); }
function factValue(value: unknown) { return String(value ?? 'Not recorded'); }

export function FindingCards({ findings, onRequest, disabled }: { findings: Finding[] } & Actions) {
  return findings.length > 0 && <div className="assistant-finding-grid">{findings.map(item => <article key={item.provenance.recordId} className={`assistant-finding assistant-finding--${item.kind}${item.kind === 'packages' ? ' assistant-finding--package' : ''}`} data-requirement-status={item.requirementEvaluation?.overallStatus}>
    <div className="assistant-finding__type"><span><T>{names[item.kind] ?? 'Care option'}</T></span>{item.provenance.sourceKind === 'synthetic' && <StatusBadge status="demo" />}</div>
    <h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>
    {item.facts.city && <p className="assistant-finding__location">{String(item.facts.city)}{item.facts.country ? `, ${factValue(item.facts.country).replaceAll('-', ' ')}` : ''}</p>}
    {!(item.provenance.sourceKind === 'synthetic' && ['hospitals','doctors'].includes(item.kind)) && <p>{item.detail}</p>}
    {item.provenance.sourceKind === 'synthetic' && ['hospitals', 'doctors'].includes(item.kind) && <small><T>{"Synthetic provider record · Not a live provider"}</T></small>}
    {item.kind === 'packages' && <p className="assistant-package-facts">{typeof (item.facts.listedPrice??item.facts.samplePriceUsd) === 'number' && Number(item.facts.listedPrice??item.facts.samplePriceUsd) > 0 ? <Price amount={Number(item.facts.listedPrice??item.facts.samplePriceUsd)} currency={String(item.facts.currency??'USD')}/> : <T>{'Listed price not specified'}</T>}{typeof item.facts.durationDays === 'number' && item.facts.durationDays > 0 ? ` · ${item.facts.durationDays} days` : ''}<small><T>{item.provenance.sourceKind==='synthetic'?'Sample price':'Listed estimate'}</T> <T>{"· Not a provider quote"}</T></small></p>}
    <RequirementResults evaluation={item.requirementEvaluation} />
    <div className="assistant-finding__actions">{['hospitals','doctors','packages'].includes(item.kind)&&<SaveButton kind={item.kind==='hospitals'?'hospital':item.kind==='doctors'?'doctor':'package'} recordId={item.provenance.recordId}/>} {item.href && <Link href={item.href}><T>{"View details →"}</T></Link>}
      {onRequest && ['hospitals', 'doctors'].includes(item.kind) && <button type="button" disabled={disabled} onClick={() => onRequest(`Verify ${item.title}`)}><T>{"Check provider information"}</T></button>}
      {onRequest && item.kind === 'hospitals' && <button type="button" disabled={disabled} onClick={() => onRequest(`Show packages for ${item.title}`)}><T>{"Explore packages"}</T></button>}
      {onRequest && item.kind === 'hospitals' && <button type="button" disabled={disabled} onClick={() => onRequest(`Organize documents for ${item.title}`)}><T>{"Organize documents"}</T></button>}
    </div>
    <details className="assistant-finding__evidence"><summary><T>{"View evidence and full details"}</T></summary><p>{item.matchReason}</p>
      <dl className="assistant-metadata">{Object.entries(item.facts).filter(([key]) => !/(?:Id|Slug)$/.test(key)).map(([key, value]) => <div key={key}><dt><T>{factLabel(key)}</T></dt><dd>{factValue(value)}</dd></div>)}</dl>
      <footer><T>{item.provenance.sourceKind === 'synthetic' ? 'Demo data' : item.provenance.sourceKind === 'external' ? 'External catalog data' : 'MedBridge data'}</T> · {item.provenance.label} <T>{"· Record"}</T>{' '}{item.provenance.recordId.slice(0, 8)} <T>{"· Retrieved"}</T>{' '}<LocalDate value={item.provenance.retrievedAt}/></footer>
    </details>
  </article>)}</div>;
}
