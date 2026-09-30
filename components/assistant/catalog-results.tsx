import Link from 'next/link';
import type { Finding, PlanningResultGroup } from '@/lib/agents/schemas';
import { resultGroupLabel } from '@/lib/agents/treatment-planning/results';

export function PlanningResultGroups({ groups }: { groups: PlanningResultGroup[] }) {
  return <>{groups.map((group) => <section key={group.taskId} aria-label={`${group.target} results`}>
    <div className="assistant-match-state" role="status"><h3>{group.target[0].toUpperCase() + group.target.slice(1)}</h3>
      <strong>{resultGroupLabel(group)}</strong><p>{group.matchReason}</p></div>
    <FindingCards findings={group.findings} />
  </section>)}</>;
}

export function FindingCards({ findings }: { findings: Finding[] }) {
  return findings.length > 0 && <div className="assistant-finding-grid">{findings.map((item) => <article key={item.provenance.recordId} className="assistant-finding">
    <span>{item.kind.replaceAll('_', ' ')} · {item.matchType === 'exact' ? 'Exact match' : 'Related information'}</span><h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3><p>{item.detail}</p>
    <p className="assistant-match-reason">{item.matchReason}</p>
    {Object.entries(item.facts).slice(0, item.kind === 'packages' ? 8 : 5).map(([key, value]) => <div className="assistant-fact" key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong><span>{value}</span></div>)}
    <footer>{item.provenance.sourceKind === 'synthetic' ? 'Demo data' : item.provenance.sourceKind === 'external' ? 'External catalog data' : 'MedBridge data'} · {item.provenance.label} · Record {item.provenance.recordId.slice(0, 8)} · Retrieved {new Date(item.provenance.retrievedAt).toLocaleDateString()}</footer>
  </article>)}</div>;
}
