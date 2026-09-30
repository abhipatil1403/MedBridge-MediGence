import type { ResultRequirementEvaluation } from '@/lib/requirements/RequirementTypes';

const statuses = { exact: 'Exact', related: 'Related', unknown: 'Not specified', not_met: 'Not met', incomplete: 'Needs confirmation', not_applicable: 'Not applicable' };
export function RequirementResults({ evaluation }: { evaluation?: ResultRequirementEvaluation }) {
  if (!evaluation?.evaluations.length) return null;
  return <div className="assistant-requirements" role="region" aria-label="Requirement evaluation">
    <h4>Requirements</h4><p>{evaluation.overallStatus === 'fully_satisfies' ? 'Applicable requirements documented' : evaluation.overallStatus === 'does_not_satisfy' ? 'Required criteria not met' : evaluation.overallStatus === 'partially_satisfies' ? 'Some requirements remain unconfirmed' : 'Insufficient catalog evidence'}</p>
    <ul>{evaluation.evaluations.filter((item) => item.status !== 'not_applicable').map((item) => <li key={item.requirementId}>
      <strong>{item.label}</strong><span>{statuses[item.status]}</span>
      <details><summary>Evidence and reason</summary><p>{item.explanation}</p>
        {item.evidence.length > 0 && <ul>{item.evidence.map((value, i) => <li key={i}>{value}</li>)}</ul>}
        {item.sourceFields.length > 0 && <small>Catalog fields: {item.sourceFields.join(', ')}</small>}
      </details>
    </li>)}</ul>
    {evaluation.evaluations.some((item) => item.status === 'not_applicable') && <details><summary>Other requirements do not apply to this entity</summary>
      <ul>{evaluation.evaluations.filter((item) => item.status === 'not_applicable').map((item) => <li key={item.requirementId}>{item.label}: Not applicable</li>)}</ul>
    </details>}
  </div>;
}
