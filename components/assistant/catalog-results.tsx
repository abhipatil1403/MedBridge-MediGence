import { BookOpen } from 'lucide-react';
import { LocalDate } from '@/components/experience/translation';
import { T } from '@/components/experience/translation';
import Link from '@/components/catalog-link';
import { LocationObject, PriceBlock, ServiceCapsules } from '@/components/visual/semantic';
import { factsPrice, priceTypeLabels } from '@/lib/catalog/pricing';
import { SaveButton } from '@/components/experience/saved';
import type { Finding, PlanningResultGroup } from '@/lib/agents/schemas';
import { RequirementResults } from './requirement-results';
import { StatusBadge } from '@/components/ui/status-badge';
import { resultGroupLabel } from '@/lib/agents/treatment-planning/results';
import { assistanceHref } from '@/lib/inquiries/links';

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
  const renderFinding=(item:Finding)=><article key={item.provenance.recordId} className={`assistant-finding assistant-finding--${item.kind}${item.kind === 'packages' ? ' assistant-finding--package' : ''}`} data-requirement-status={item.requirementEvaluation?.overallStatus}>
    <div className="assistant-finding__type"><span><T>{names[item.kind] ?? 'Care option'}</T></span>{item.provenance.sourceKind === 'synthetic' && <StatusBadge status="demo" />}</div>
    {item.kind==='doctors'&&<span className="doctor-monogram" aria-hidden="true">{item.title.replace(/^Dr\.?\s+/i,'').split(' ').slice(0,2).map(part=>part[0]).join('')}</span>}
    <h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>
    {item.facts.city && <LocationObject city={String(item.facts.city)} country={item.facts.country ? factValue(item.facts.country).replaceAll('-', ' ') : undefined}/>}
    {!(item.provenance.sourceKind === 'synthetic' && ['hospitals','doctors'].includes(item.kind)) && <p className="assistant-finding__description">{item.kind==='packages'&&item.facts.hospitalName?String(item.facts.hospitalName):item.detail}</p>}
    {item.provenance.sourceKind === 'synthetic' && ['hospitals', 'doctors'].includes(item.kind) && <small><T>{"Synthetic provider record · Not a live provider"}</T></small>}
    {item.kind === 'packages' && <div className="assistant-package-facts"><PriceBlock compact item={factsPrice(item.facts)} sample={item.provenance.sourceKind==='synthetic'}/>{typeof item.facts.durationDays === 'number' && item.facts.durationDays > 0 ? ` · ${item.facts.durationDays} days` : ''}<small><T>{item.provenance.sourceKind==='synthetic'?'Sample price':priceTypeLabels[String(item.facts.priceType ?? 'estimate')] ?? 'Price not published'}</T>{' '}<T>{"· Not a provider quote"}</T></small></div>}
    {item.kind==='packages'&&typeof item.facts.inclusions==='string'&&item.facts.inclusions&&<ServiceCapsules status="included" values={item.facts.inclusions.split('; ').slice(0,2)}/>}
    <RequirementResults evaluation={item.requirementEvaluation} />
    <div className="assistant-finding__actions">{['hospitals','doctors','packages'].includes(item.kind)&&<SaveButton kind={item.kind==='hospitals'?'hospital':item.kind==='doctors'?'doctor':'package'} recordId={item.provenance.recordId}/>} {item.href && <Link href={item.href}><T>{"View details →"}</T></Link>}
      {onRequest && ['hospitals','doctors'].includes(item.kind)&&<details><summary><T>{'More options'}</T></summary><button type="button" disabled={disabled} onClick={()=>onRequest(`Verify ${item.title}`)}><T>{'Check provider information'}</T></button>{item.kind==='hospitals'&&<><button type="button" disabled={disabled} onClick={()=>onRequest(`Show packages for ${item.title}`)}><T>{'Explore packages'}</T></button><button type="button" disabled={disabled} onClick={()=>onRequest(`Organize documents for ${item.title}`)}><T>{'Organize documents'}</T></button></>}</details>}
      {item.provenance.sourceKind!=='synthetic'&&['hospitals','doctors','packages'].includes(item.kind)&&<Link href={assistanceHref(item.kind==='hospitals'?'hospital':item.kind==='doctors'?'doctor':'package',item.provenance.recordId,'ai_finding')}><T>{'Request assistance'}</T></Link>}
    </div>
    <div className="evidence-strip"><BookOpen size={14} aria-hidden="true"/><T>{item.provenance.sourceKind === 'synthetic' ? 'Demo data' : item.provenance.sourceKind === 'external' ? 'External catalog data' : 'MedBridge data'}</T></div>
    <details className="assistant-finding__evidence"><summary><T>{"View evidence and full details"}</T></summary><p>{item.matchReason}</p>
      <dl className="assistant-metadata">{Object.entries(item.facts).filter(([key]) => !/(?:Id|Slug)$/.test(key)).map(([key, value]) => <div key={key}><dt><T>{factLabel(key)}</T></dt><dd>{factValue(value)}</dd></div>)}</dl>
      <footer><T>{item.provenance.sourceKind === 'synthetic' ? 'Demo data' : item.provenance.sourceKind === 'external' ? 'External catalog data' : 'MedBridge data'}</T> · {item.provenance.label} <T>{"· Retrieved"}</T>{' '}<LocalDate value={item.provenance.retrievedAt}/></footer>
    </details>
  </article>;
  return findings.length>0&&<div className="assistant-finding-grid">{findings.slice(0,3).map(renderFinding)}{findings.length>3&&<details className="assistant-more-findings"><summary><T>{'More published options'}</T> · {findings.length-3}</summary>{findings.slice(3).map(renderFinding)}</details>}</div>;
}
