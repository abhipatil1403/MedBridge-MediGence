import { LocalDate, LocalNumber } from '@/components/experience/translation';
import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import Link from '@/components/catalog-link';
import { Price } from '@/components/experience/price';
import { PackagePrice } from '@/components/experience/package-price';
import { factsPrice } from '@/lib/catalog/pricing';
import type { Comparison, Finding, PlanningResultGroup } from '@/lib/agents/schemas';
import { comparisonFields, factText } from '@/lib/agents/comparison/format';
import { resultGroupLabel } from '@/lib/agents/treatment-planning/results';
import { FindingCards } from './catalog-results';
import { RequirementResults } from './requirement-results';

function Values({ findings, field }: { findings: Finding[]; field: string }) {
  const supporting = ['treatments', 'specialties', 'infrastructure', 'inclusions', 'exclusions', 'qualifications'].includes(field);
  const valueLabel = (finding: Finding) => {
    const value = factText(finding, field);
    if (field === 'verification' && finding.provenance.sourceKind === 'synthetic') return 'Demo — unverified';
    if (field === 'country' || field === 'consultationMode') return value?.replaceAll('-', ' ').replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
    return value;
  };
  const records = findings.filter((finding) => field === 'name' || factText(finding, field) !== undefined);
  return records.length ? <ul>{records.map((finding) => <li key={finding.provenance.recordId}>
    {(field === 'name' || records.length > 1) && (finding.href ? <Link href={finding.href}>{finding.title}</Link> : <strong>{finding.title}</strong>)}
    {field !== 'name' && (field==='listedPrice' ? <PackagePrice item={factsPrice(finding.facts)}/> : field==='samplePriceUsd'&&typeof finding.facts[field]==='number'?<Price amount={Number(finding.facts[field])} currency="USD"/>:supporting ? <details><summary><T>{"View"}</T>{' '}<T>{field}</T></summary><p>{valueLabel(finding)}</p></details> : <span>{valueLabel(finding)}</span>)}
    {field === 'name' && <details><summary><T>{"Source"}</T></summary><small>{finding.provenance.sourceKind === 'synthetic' ? 'Demo data · Synthetic sample' : finding.provenance.label}
      {' · '}{finding.matchType} <T>{"· Record"}</T>{' '}{finding.provenance.recordId.slice(0, 8)} <T>{"· Retrieved"}</T>{' '}<LocalDate value={finding.provenance.retrievedAt}/></small></details>}
  </li>)}</ul> : <span><T>{"Not provided in published information."}</T></span>;
}
function Match({ group }: { group: PlanningResultGroup }) {
  const label = group.status === 'blocked' ? 'Search incomplete' : group.matchType === 'none' ? 'No matching options' : group.matchType === 'related' ? 'Related options' : group.findings.some(f => f.requirementEvaluation && f.requirementEvaluation.overallStatus !== 'fully_satisfies') ? 'Review requested criteria' : `${group.findings.length} matching ${group.findings.length === 1 ? 'option' : 'options'}`;
  return <><strong>{label}</strong><details><summary><T>{"Search evidence"}</T></summary><p>{resultGroupLabel(group)} · {group.matchReason}</p></details></>;
}
export function ComparisonResults({ comparison }: { comparison: Comparison }) {
  const [first, second] = comparison.sides;
  return <Localized as="section" className="assistant-comparison" aria-label="Catalog comparison">
    <h3>{comparison.request.subject?.value} — {first.option.label} <T>{"vs"}</T>{' '}{second.option.label}</h3>
    {comparison.request.budget && <p><T>{"Budget preference:"}</T>{' '}{comparison.request.budget.currency} <LocalNumber value={comparison.request.budget.amount}/>
      <T>{comparison.request.budget.currency === 'USD' ? ' · compared with listed USD sample prices' : ' · no currency conversion applied'}</T></p>}
    {comparison.request.targets.map((target, index) => {
      const a = first.groups[index], b = second.groups[index];
      const fields = comparisonFields[target].filter(([key]) => [...a.findings, ...b.findings].some((finding) => factText(finding, key) !== undefined));
      return <div key={target} className="assistant-comparison__group">
        <h4>{target[0].toUpperCase() + target.slice(1)}</h4>
        <div className="assistant-comparison__scroll" role="region" tabIndex={0} aria-label={`${target} comparison table`}>
          <table><caption>{target[0].toUpperCase() + target.slice(1)} <T>{"· available information"}</T><span className="assistant-table-scroll-mark" aria-hidden="true">↔</span></caption><thead><tr><th scope="col"><T>{"Factor"}</T></th>
            <th scope="col">{first.option.label}</th><th scope="col">{second.option.label}</th></tr></thead><tbody>
            <tr><th scope="row"><T>{"Available options"}</T></th><td><Match group={a} /></td><td><Match group={b} /></td></tr>
            <tr><th scope="row">{target[0].toUpperCase() + target.slice(1)}</th><td><Values findings={a.findings} field="name" /></td><td><Values findings={b.findings} field="name" /></td></tr>
            {[...a.findings, ...b.findings].some((f) => f.requirementEvaluation) && <tr><th scope="row"><T>{"Requirements"}</T></th>
              {[a, b].map((group, side) => <td key={side}>{group.findings.map((f) => <div key={f.provenance.recordId}>{group.findings.length > 1 && <strong>{f.title}</strong>}<RequirementResults evaluation={f.requirementEvaluation} /></div>)}</td>)}
            </tr>}
            {fields.map(([key, label]) => <tr key={key}><th scope="row"><T>{label}</T></th>
              <td><Values findings={a.findings} field={key} /></td><td><Values findings={b.findings} field={key} /></td></tr>)}
          </tbody></table>
        </div>
        {[first, second].map((side) => <details key={side.option.value}><summary>{side.option.label}<T>{": sources and match reasons ("}</T>{side.groups[index].findings.length})</summary>
          {side.groups[index].findings.length ? <FindingCards findings={side.groups[index].findings} /> : <p>{side.groups[index].matchReason}</p>}</details>)}
      </div>;
    })}
    {comparison.subjectFinding && <details><summary><T>{"Shared treatment source"}</T></summary><FindingCards findings={[comparison.subjectFinding]} /></details>}
    <details><summary><T>{"Missing catalog fields"}</T></summary>{comparison.sides.map((side) => <div key={side.option.value}><strong>{side.option.label}</strong>
      {side.missingFields.length ? <ul>{side.missingFields.map((field) => <li key={field}>{field}<T>{": not available in current catalog"}</T></li>)}</ul> : <p><T>{"No missing fields among the compared attributes."}</T></p>}</div>)}</details>
    <ul className="assistant-comparison__limitations">{comparison.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
  </Localized>;
}
