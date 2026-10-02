import type { RunActivity } from '@/lib/agents/execution-schemas';
import { StatusMark } from './response-presentation';
import { statusLabel } from '@/components/ui/status-badge';

export function ExecutionActivity({ activity }: { activity: RunActivity }) {
  const done = activity.steps.filter(step => ['completed', 'reused'].includes(step.status)).length;
  const active = ['planning', 'running', 'executing'].includes(activity.state);
  return <details aria-label="Recorded agent activity" className="assistant-activity" open={active}>
    <summary>{active ? `Working on your request · ${done} of ${activity.steps.length} steps complete` : `${done} completed ${done === 1 ? 'check' : 'checks'} · View activity`}<span className="activity-state">{statusLabel(activity.state)}</span></summary>
    <p className="assistant-status" data-status={activity.state}><StatusMark status={activity.state} />{statusLabel(activity.state)}</p>
    {activity.steps.length > 0 && <div className="assistant-activity__details">
      <ol className="assistant-activity__steps">{activity.steps.map((step) => <li key={step.id}>
        <StatusMark status={step.status} /><div><strong>{step.label}</strong><span>{statusLabel(step.status)}
          {step.recordCount > 0 ? ` · ${step.recordCount} results` : ''}</span></div>
      </li>)}</ol></div>}
    {activity.warnings.length > 0 && <ul>{activity.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
  </details>;
}
