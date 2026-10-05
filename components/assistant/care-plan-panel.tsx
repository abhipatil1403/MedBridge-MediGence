'use client';
import { LocalNumber, LocalDate } from '@/components/experience/translation';

import { Localized } from '@/components/experience/localized';

import { T } from '@/components/experience/translation';
import type { CarePlan } from '@/lib/agents/schemas';
import { planningResultGroup, resultGroupLabel } from '@/lib/agents/treatment-planning/results';
import { statusLabel } from '@/components/ui/status-badge';
import { ComparisonResults } from './comparison-results';

export function CarePlanPanel({ plan, busy, onTaskAction }: { plan: CarePlan; busy: boolean;
  onTaskAction: (taskId: string, action: 'complete' | 'reopen') => void }) {
  const tasks = plan.tasks.filter((task) => task.status !== 'cancelled');
  const completed = tasks.filter((task) => task.status === 'completed').length;
  return <Localized as="section" className="assistant-context__panel assistant-care-plan" aria-label="Your care plan">
    <p className="eyebrow"><T>{"YOUR COORDINATION PLAN"}</T></p><h2>{plan.title}</h2>
    <p>{plan.goal}</p><p>{[plan.context.city, plan.context.country].filter(Boolean).join(' · ') || 'Destination not chosen'}</p>
    {Boolean(plan.context.requirements?.length) && <details open><summary><T>{"Saved requirements"}</T></summary><ul>{plan.context.requirements!.map((requirement) => <li key={requirement.id}>{requirement.label}<T>{requirement.desired === false ? ' · excluded' : ''}</T></li>)}</ul></details>}
    <p className="assistant-care-plan__progress" role="status">{completed} <T>{"of"}</T>{' '}{tasks.length} <T>{"planning tasks complete ·"}</T>{' '}{statusLabel(plan.status)}</p>
    {plan.context.budget && <p><T>{"Your budget preference:"}</T>{' '}{plan.context.budget.currency} <LocalNumber value={plan.context.budget.amount}/>
      <T>{plan.context.budget.currency === 'INR' ? ' · No currency conversion applied' : ' · Compared with sample package prices'}</T></p>}
    <ol className="assistant-care-plan__tasks">{tasks.map((task) => {
      const group = ['completed', 'blocked'].includes(task.status) ? planningResultGroup(task) : undefined;
      return <li key={task.id}>
      <strong>{task.title}</strong><span>{statusLabel(task.status)}</span>
      {group && <small>{group.findings.some((f) => f.requirementEvaluation && f.requirementEvaluation.overallStatus !== 'fully_satisfies') ? 'Catalog results · requirements unconfirmed' : resultGroupLabel(group)}</small>}
      {task.description && <p>{task.description}</p>}
      {task.comparison && <details><summary><T>{"Saved comparison"}</T></summary><ComparisonResults comparison={task.comparison} /></details>}
      {task.requiresApproval && <p><T>{"Confirmation required ·"}</T>{' '}{task.approvalStatus}<T>{". This action is not connected."}</T></p>}
      {plan.status !== 'cancelled' && task.requiresUserAction && ['review', 'preferences'].includes(task.taskType) && !task.requiresApproval
        && !['blocked', 'cancelled'].includes(task.status) && <button type="button" disabled={busy}
          aria-label={`${task.status === 'completed' ? 'Reopen' : 'Mark done'}: ${task.title}`}
          onClick={() => onTaskAction(task.id, task.status === 'completed' ? 'reopen' : 'complete')}>
          <T>{task.status === 'completed' ? 'Reopen' : 'Mark done'}</T></button>}
    </li>; })}</ol>
    {plan.findings.length > 0 && <details><summary><T>{"Saved catalog findings ("}</T>{plan.findings.length})</summary>
      <ul className="assistant-care-plan__findings">{plan.findings.map((finding) => <li key={finding.provenance.recordId}>
        {finding.href ? <a href={finding.href}>{finding.title}</a> : <span>{finding.title}</span>}
        <small><T>{finding.requirementEvaluation ? finding.requirementEvaluation.overallStatus === 'fully_satisfies' ? 'Applicable requirements documented' : 'Review requirement evidence' : finding.matchType === 'exact' ? 'Exact catalog match' : 'Related catalog information'}</T> · {finding.provenance.sourceKind === 'synthetic' ? 'Demo data · Synthetic' : finding.provenance.label}</small>
        <small>{finding.matchReason}</small>
        <small><T>{"Record"}</T>{' '}{finding.provenance.recordId.slice(0, 8)} <T>{"· Retrieved"}</T>{' '}<LocalDate value={finding.provenance.retrievedAt}/></small>
      </li>)}</ul>
    </details>}
    <small><T>{"Planning progress records searches and your reviews. It does not confirm medical suitability, booking, or care delivery."}</T></small>
  </Localized>;
}
