import type { RunActivity } from '@/lib/agents/execution-schemas';
import { T, LocalNumber } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import { StatusMark } from './response-presentation';
import { statusLabel } from '@/components/ui/status-badge';

export function ExecutionActivity({ activity }: { activity: RunActivity }) {
  const done = activity.steps.filter(step => ['completed', 'reused'].includes(step.status)).length;
  const active = ['planning', 'running', 'executing'].includes(activity.state);
  return <Localized as="details" aria-label="Recorded agent activity" className="assistant-activity" open={active}>
    <summary>{active ? <><T>{'Working on your request'}</T> · <LocalNumber value={done}/>/<LocalNumber value={activity.steps.length}/>{' '}<T>{'steps complete'}</T></> : <><LocalNumber value={done}/>{' '}<T>{done===1?'completed check':'completed checks'}</T> · <T>{'View activity'}</T></>}<span className="activity-state"><T>{statusLabel(activity.state)}</T></span></summary>
    <p className="assistant-status" data-status={activity.state}><StatusMark status={activity.state} /><T>{statusLabel(activity.state)}</T></p>
    {activity.steps.length > 0 && <div className="assistant-activity__details">
      <ol className="assistant-activity__steps">{activity.steps.map((step) => <li key={step.id}>
        <StatusMark status={step.status} /><div><strong><T>{step.label}</T></strong><span><T>{statusLabel(step.status)}</T>
          {step.recordCount > 0 ? <> · <LocalNumber value={step.recordCount}/>{' '}<T>{'results'}</T></> : ''}</span></div>
      </li>)}</ol></div>}
    {activity.warnings.length > 0 && <ul>{activity.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
  </Localized>;
}
