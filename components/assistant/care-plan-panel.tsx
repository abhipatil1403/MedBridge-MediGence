'use client';
import type { CarePlan } from '@/lib/agents/schemas';
import { planningResultGroup, resultGroupLabel } from '@/lib/agents/treatment-planning/results';
import { ComparisonResults } from './comparison-results';

export function CarePlanPanel({ plan, busy, onTaskAction }: { plan: CarePlan; busy: boolean;
  onTaskAction: (taskId: string, action: 'complete' | 'reopen') => void }) {
  const tasks = plan.tasks.filter((task) => task.status !== 'cancelled');
  const completed = tasks.filter((task) => task.status === 'completed').length;
  return <section className="assistant-context__panel assistant-care-plan" aria-label="Your care plan">
    <p className="eyebrow">YOUR COORDINATION PLAN</p><h2>{plan.title}</h2>
    <p>{plan.goal}</p><p>{[plan.context.city, plan.context.country].filter(Boolean).join(' · ') || 'Destination not chosen'}</p>
    {Boolean(plan.context.requirements?.length) && <details open><summary>Saved requirements</summary><ul>{plan.context.requirements!.map((requirement) => <li key={requirement.id}>{requirement.label}{requirement.desired === false ? ' · excluded' : ''}</li>)}</ul></details>}
    <p className="assistant-care-plan__progress" role="status">{completed} of {tasks.length} planning tasks complete · {plan.status.replaceAll('_', ' ')}</p>
    {plan.context.budget && <p>Your budget preference: {plan.context.budget.currency} {plan.context.budget.amount.toLocaleString('en-US')}
      {plan.context.budget.currency === 'INR' ? ' · No currency conversion applied' : ' · Compared with sample package prices'}</p>}
    <ol className="assistant-care-plan__tasks">{tasks.map((task) => {
      const group = ['completed', 'blocked'].includes(task.status) ? planningResultGroup(task) : undefined;
      return <li key={task.id}>
      <strong>{task.title}</strong><span>{task.status.replaceAll('_', ' ')}</span>
      {group && <small>{group.findings.some((f) => f.requirementEvaluation && f.requirementEvaluation.overallStatus !== 'fully_satisfies') ? 'Catalog results · requirements unconfirmed' : resultGroupLabel(group)}</small>}
      {task.description && <p>{task.description}</p>}
      {task.comparison && <details><summary>Saved comparison</summary><ComparisonResults comparison={task.comparison} /></details>}
      {task.requiresApproval && <p>Confirmation required · {task.approvalStatus}. This action is not connected.</p>}
      {plan.status !== 'cancelled' && task.requiresUserAction && ['review', 'preferences'].includes(task.taskType) && !task.requiresApproval
        && !['blocked', 'cancelled'].includes(task.status) && <button type="button" disabled={busy}
          aria-label={`${task.status === 'completed' ? 'Reopen' : 'Mark done'}: ${task.title}`}
          onClick={() => onTaskAction(task.id, task.status === 'completed' ? 'reopen' : 'complete')}>
          {task.status === 'completed' ? 'Reopen' : 'Mark done'}</button>}
    </li>; })}</ol>
    {plan.findings.length > 0 && <details><summary>Saved catalog findings ({plan.findings.length})</summary>
      <ul className="assistant-care-plan__findings">{plan.findings.map((finding) => <li key={finding.provenance.recordId}>
        {finding.href ? <a href={finding.href}>{finding.title}</a> : <span>{finding.title}</span>}
        <small>{finding.requirementEvaluation ? finding.requirementEvaluation.overallStatus === 'fully_satisfies' ? 'Applicable requirements documented' : 'Review requirement evidence' : finding.matchType === 'exact' ? 'Exact catalog match' : 'Related catalog information'} · {finding.provenance.sourceKind === 'synthetic' ? 'Demo data · Synthetic' : finding.provenance.label}</small>
        <small>{finding.matchReason}</small>
        <small>Record {finding.provenance.recordId.slice(0, 8)} · Retrieved {new Date(finding.provenance.retrievedAt).toLocaleDateString()}</small>
      </li>)}</ul>
    </details>}
    <small>Planning progress records searches and your reviews. It does not confirm medical suitability, booking, or care delivery.</small>
  </section>;
}
