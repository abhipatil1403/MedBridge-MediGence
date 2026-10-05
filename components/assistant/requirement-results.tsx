import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import type { ResultRequirementEvaluation } from '@/lib/requirements/RequirementTypes';
import { StatusMark } from './response-presentation';

const statuses = { exact: 'Exact', related: 'Related', unknown: 'Not specified', not_met: 'Not met', incomplete: 'Needs confirmation', not_applicable: 'Not applicable' };
export function RequirementResults({ evaluation }: { evaluation?: ResultRequirementEvaluation }) {
  if (!evaluation?.evaluations.length) return null;
  const content = <Localized as="div" className="assistant-requirements" role="region" aria-label="Requirement evaluation">
    <h4><T>{"Requirements"}</T></h4><p><T>{evaluation.overallStatus === 'fully_satisfies' ? 'Applicable requirements documented' : evaluation.overallStatus === 'does_not_satisfy' ? 'Required criteria not met' : evaluation.overallStatus === 'partially_satisfies' ? 'Some requirements remain unconfirmed' : 'Insufficient catalog evidence'}</T></p>
    <ul>{evaluation.evaluations.filter((item) => item.status !== 'not_applicable').map((item) => <li key={item.requirementId}>
      <div className="assistant-requirement-title"><StatusMark status={item.status} /><strong>{item.label}</strong></div><span className="assistant-status" data-status={item.status}>{statuses[item.status]}</span>
      <details><summary><T>{"Evidence and reason"}</T></summary><p>{item.explanation}</p>
        {item.evidence.length > 0 && <ul>{item.evidence.map((value, i) => <li key={i}>{value}</li>)}</ul>}
        {item.sourceFields.length > 0 && <small><T>{"Catalog fields:"}</T>{' '}{item.sourceFields.join(', ')}</small>}
      </details>
    </li>)}</ul>
    {evaluation.evaluations.some((item) => item.status === 'not_applicable') && <details><summary><T>{evaluation.resultType === 'hospitals' ? 'Package requirements are evaluated separately' : 'Other requirements do not apply to this entity'}</T></summary>
      <ul>{evaluation.evaluations.filter((item) => item.status === 'not_applicable').map((item) => <li key={item.requirementId}>{item.label}: <T>{evaluation.resultType === 'hospitals' ? 'Evaluated at package level' : 'Not applicable'}</T></li>)}</ul>
    </details>}
  </Localized>;
  return evaluation.overallStatus === 'fully_satisfies' ? <details className="assistant-requirement-summary"><summary><T>{"Requested criteria documented · view evidence"}</T></summary>{content}</details> : content;
}
