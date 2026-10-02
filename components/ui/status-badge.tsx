const states: Record<string, { label: string; mark: string; tone: string }> = {
  verified: { label: 'Verified', mark: '✓', tone: 'success' },
  completed: { label: 'Complete', mark: '✓', tone: 'success' },
  reused: { label: 'Saved result', mark: '✓', tone: 'success' },
  current: { label: 'Current', mark: '✓', tone: 'success' },
  conflicting: { label: 'Conflicting', mark: '!', tone: 'warning' },
  stale: { label: 'Stale evidence', mark: '!', tone: 'warning' },
  aging: { label: 'Aging evidence', mark: '○', tone: 'warning' },
  partial: { label: 'Partially verified', mark: '◐', tone: 'warning' },
  partially_completed: { label: 'Partially complete', mark: '◐', tone: 'warning' },
  verification_incomplete: { label: 'Verification incomplete', mark: '!', tone: 'warning' },
  unverified: { label: 'Not verified', mark: '○', tone: 'neutral' },
  internal_only: { label: 'Catalog only', mark: '○', tone: 'neutral' },
  not_found: { label: 'No source statement', mark: '○', tone: 'neutral' },
  not_applicable: { label: 'Not applicable', mark: '–', tone: 'neutral' },
  unknown: { label: 'Freshness unknown', mark: '○', tone: 'neutral' },
  pending: { label: 'Pending', mark: '○', tone: 'neutral' },
  waiting_for_input: { label: 'Your input needed', mark: '○', tone: 'neutral' },
  awaiting_confirmation: { label: 'Confirmation needed', mark: '○', tone: 'neutral' },
  failed: { label: 'Could not complete', mark: '!', tone: 'error' },
  cancelled: { label: 'Cancelled', mark: '–', tone: 'neutral' },
  demo: { label: 'Demo data', mark: '', tone: 'demo' },
};
export function statusLabel(status: string) { return states[status]?.label ?? 'In progress'; }
export function StatusBadge({ status }: { status: string }) {
  const state = states[status] ?? { label: 'In progress', mark: '○', tone: 'neutral' };
  return <span className="status-badge" data-tone={state.tone}><span aria-hidden="true">{state.mark}</span>{state.label}</span>;
}
