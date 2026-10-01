import Link from 'next/link';
import type { Comparison, Finding, PlanningResultGroup } from '@/lib/agents/schemas';
import { comparisonFields, factText } from '@/lib/agents/comparison/format';
import { resultGroupLabel } from '@/lib/agents/treatment-planning/results';
import { FindingCards } from './catalog-results';
import { RequirementResults } from './requirement-results';

function Values({ findings, field }: { findings: Finding[]; field: string }) {
  const records = findings.filter((finding) => field === 'name' || factText(finding, field) !== undefined);
  return records.length ? <ul>{records.map((finding) => <li key={finding.provenance.recordId}>
    {finding.href ? <Link href={finding.href}>{finding.title}</Link> : <strong>{finding.title}</strong>}
    {field !== 'name' && <span>{factText(finding, field)}</span>}
    <small>{finding.provenance.sourceKind === 'synthetic' ? 'Demo data · Synthetic sample' : finding.provenance.label}
      {' · '}{finding.matchType} · Record {finding.provenance.recordId.slice(0, 8)} · Retrieved {new Date(finding.provenance.retrievedAt).toLocaleDateString()}</small>
  </li>)}</ul> : <span>Not available in current catalog</span>;
}
function Match({ group }: { group: PlanningResultGroup }) {
  return <><strong>{group.matchType === 'exact' && group.findings.some((f) => f.matchType === 'exact' && f.requirementEvaluation && f.requirementEvaluation.overallStatus !== 'fully_satisfies') ? 'Catalog results · review requirements' : resultGroupLabel(group)}</strong><p>{group.matchReason}</p></>;
}
export function ComparisonResults({ comparison }: { comparison: Comparison }) {
  const [first, second] = comparison.sides;
  return <section className="assistant-comparison" aria-label="Catalog comparison">
    <h3>{comparison.request.subject?.value} — {first.option.label} vs {second.option.label}</h3>
    {comparison.request.budget && <p>Budget preference: {comparison.request.budget.currency} {comparison.request.budget.amount.toLocaleString('en-US')}
      {comparison.request.budget.currency === 'USD' ? ' · compared with listed USD sample prices' : ' · no currency conversion applied'}</p>}
    {comparison.request.targets.map((target, index) => {
      const a = first.groups[index], b = second.groups[index];
      const fields = comparisonFields[target].filter(([key]) => [...a.findings, ...b.findings].some((finding) => factText(finding, key) !== undefined));
      return <div key={target} className="assistant-comparison__group">
        <h4>{target[0].toUpperCase() + target.slice(1)}</h4>
        <div className="assistant-comparison__scroll" role="region" tabIndex={0} aria-label={`${target} comparison table`}>
          <table><caption>{target} catalog attributes<span className="assistant-table-scroll-mark" aria-hidden="true">↔</span></caption><thead><tr><th scope="col">Factor</th>
            <th scope="col">{first.option.label}</th><th scope="col">{second.option.label}</th></tr></thead><tbody>
            <tr><th scope="row">Catalog matches</th><td><Match group={a} /></td><td><Match group={b} /></td></tr>
            <tr><th scope="row">Records</th><td><Values findings={a.findings} field="name" /></td><td><Values findings={b.findings} field="name" /></td></tr>
            {[...a.findings, ...b.findings].some((f) => f.requirementEvaluation) && <tr><th scope="row">Requirements</th>
              {[a, b].map((group, side) => <td key={side}>{group.findings.map((f) => <div key={f.provenance.recordId}><strong>{f.title}</strong><RequirementResults evaluation={f.requirementEvaluation} /></div>)}</td>)}
            </tr>}
            {fields.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>
              <td><Values findings={a.findings} field={key} /></td><td><Values findings={b.findings} field={key} /></td></tr>)}
          </tbody></table>
        </div>
        {[first, second].map((side) => <details key={side.option.value}><summary>{side.option.label}: sources and match reasons ({side.groups[index].findings.length})</summary>
          {side.groups[index].findings.length ? <FindingCards findings={side.groups[index].findings} /> : <p>{side.groups[index].matchReason}</p>}</details>)}
      </div>;
    })}
    {comparison.subjectFinding && <details><summary>Shared treatment source</summary><FindingCards findings={[comparison.subjectFinding]} /></details>}
    <details><summary>Missing catalog fields</summary>{comparison.sides.map((side) => <div key={side.option.value}><strong>{side.option.label}</strong>
      {side.missingFields.length ? <ul>{side.missingFields.map((field) => <li key={field}>{field}: not available in current catalog</li>)}</ul> : <p>No missing fields among the compared attributes.</p>}</div>)}</details>
    <ul className="assistant-comparison__limitations">{comparison.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
  </section>;
}
