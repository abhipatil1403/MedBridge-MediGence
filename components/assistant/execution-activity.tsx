import type { RunActivity } from '@/lib/agents/execution-schemas';

export function ExecutionActivity({ activity }: { activity: RunActivity }) {
  return <section aria-label="Recorded agent activity" className="assistant-context__panel">
    <h3>Recorded activity</h3>
    <p role="status">{activity.state.replaceAll('_', ' ')}</p>
    {activity.steps.length > 0 && <ol className="assistant-task-list">{activity.steps.map((step) => <li key={step.id}>
      <strong>{step.label}</strong><span>{step.status === 'failed' ? 'Couldn’t be completed' : step.status === 'reused' ? 'Reused a recent result' : step.status}
        {step.status === 'completed' || step.status === 'reused' ? ` · ${step.recordCount} sourced records` : ''}</span>
    </li>)}</ol>}
    {activity.warnings.length > 0 && <ul>{activity.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
  </section>;
}
