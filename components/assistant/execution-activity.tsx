import type { RunActivity } from '@/lib/agents/execution-schemas';
import { StatusMark } from './response-presentation';

export function ExecutionActivity({ activity }: { activity: RunActivity }) {
  return <section aria-label="Recorded agent activity" className="assistant-activity">
    <div className="assistant-activity__header"><h3>Recorded activity</h3>
      <p role="status" className="assistant-status" data-status={activity.state}><StatusMark status={activity.state} />{activity.state.replaceAll('_', ' ')}</p></div>
    {activity.steps.length > 0 && <details className="assistant-activity__details"><summary>{activity.steps.filter(step => ['completed', 'reused'].includes(step.status)).length} of {activity.steps.length} steps completed</summary>
      <ol className="assistant-activity__steps">{activity.steps.map((step) => <li key={step.id}>
        <StatusMark status={step.status} /><div><strong>{step.label}</strong><span>{step.status === 'failed' ? 'Couldn’t be completed' : step.status === 'reused' ? 'Reused a recent result' : step.status}
          {step.status === 'completed' || step.status === 'reused' ? ` · ${step.recordCount} sourced records` : ''}</span></div>
      </li>)}</ol></details>}
    {activity.warnings.length > 0 && <ul>{activity.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
  </section>;
}
