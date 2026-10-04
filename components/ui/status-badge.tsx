const states: Record<string, { label: string; mark: string; tone: string }> = {
  verified: { label: 'Verified', mark: '✓', tone: 'success' },
  approved: { label: 'Reviewed', mark: '✓', tone: 'neutral' },
  completed: { label: 'Complete', mark: '✓', tone: 'success' },
  reused: { label: 'Saved result', mark: '✓', tone: 'success' },
  current: { label: 'Current', mark: '✓', tone: 'success' },
  conflicting: { label: 'Conflicting', mark: '!', tone: 'warning' },
  stale: { label: 'Stale evidence', mark: '!', tone: 'warning' },
  aging: { label: 'Aging evidence', mark: '○', tone: 'warning' },
  partial: { label: 'Partially verified', mark: '◐', tone: 'warning' },
  partially_completed: { label: 'Partially complete', mark: '◐', tone: 'warning' },
  verification_incomplete: { label: 'Verification incomplete', mark: '!', tone: 'warning' },
  incomplete: { label: 'Incomplete', mark: '!', tone: 'warning' },
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
const explanations: Record<string, string> = {
  approved: 'Approved for publication after source review. Independent clinical quality or accreditation verification is not established.',
  verified: 'Supported by the collected source statements. This does not establish clinical quality or suitability.',
  partial: 'Some requested fields have supporting evidence; others remain unresolved.',
  conflicting: 'Collected values disagree. Review all statements before relying on this field.',
  stale: 'Evidence is older than the configured freshness policy allows.',
  aging: 'Evidence is approaching the configured freshness limit.',
  verification_incomplete: 'The requested check did not collect enough evidence to finish.',
  unverified: 'No authoritative supporting evidence has been established.',
  internal_only: 'This value exists in the catalog and has no collected authoritative support.',
  not_found: 'Retrieved sources contained no statement for the requested field.',
  not_applicable: 'This field does not apply to the selected provider or scope.',
  unknown: 'No applicable freshness policy establishes whether this evidence is current.',
  demo: 'Synthetic example. Not a live, verified or bookable provider or offer.',
  failed: 'The operation could not complete. Retry or review the explanation.',
};
export function StatusBadge({ status }: { status: string }) {
  const state = states[status] ?? { label: 'In progress', mark: '○', tone: 'neutral' };
  return <span className="status-badge" data-tone={state.tone} title={explanations[status] ?? state.label}><span aria-hidden="true">{state.mark}</span>{state.label}</span>;
}
