# Provider coordination and visual correction — 9 October 2026

Baseline inspected: `main`, clean at `bdc75b4a86fe94034df3d5dc85fe7206b8c57a7f`.

## Findings before implementation

- Homepage package cards had changed to ivory/sage, while four late CSS selectors
  still assigned near-white price/service foregrounds. Computed opacity was 1.
- Normal scrolling showed one sticky header, correctly at the viewport top. The
  apparent middle-page strip is consistent with a full-page capture artifact.
- Production has one active, non-synthetic provider-submitted organization with
  an active member, but **zero published canonical records for such teams**.
  Public reference listings therefore cannot offer a real provider response.
- Canonical lookup selected the first organization and did not require a current
  governed publication. Generic provider information/document requests did not
  persist their provider response state. Further review was missing. Historical
  message labels inferred roles from present-day staff membership.

## Changes

Shared price/service tokens replace incompatible home overrides. Original price
and currency remain primary; absent service information is explicitly qualified.
Browser contrast and seven-width verification preceded coordination changes.

The existing inquiry commands, messages, events, permissions and notification
system are extended by `20261009100000_provider_inquiry_coordination.sql`:

- Exact canonical, current publication, active team; ambiguity fails closed.
- Late connection requires the patient's explicit named-organization consent.
  An already bound organization is never silently replaced.
- Persisted provider response message, principal and organization; further review
  and explicit operational confirmation; information request and answer times.
- Only a provider-visible patient reply fulfills a provider information request.
- Actual latest response and human-readable next steps across existing portals.
- Independent per-file grants and fresh download checks remain unchanged.
- Receipt-based idempotence prevents duplicate messages/events/notifications.
- Audit metadata records organization and event without patient prose. The audit
  organization-wide RLS column is deliberately not populated, preserving privacy.

No production provider, public listing, contact, email/SMS delivery or booking is
manufactured. Positive provider browser checks use an isolated local database and
a temporary session adapter; production checks use disposable private accounts.
Temporary QA application routes are removed before building or committing.

## Migration and recovery

The additive schema and replacement functions passed a fresh local installation,
the existing database suite, lifecycle checks and migration reapplication before
the migration was applied transactionally through the authenticated Supabase
Management API with its normal migration ledger entry. No database password or
new environment variable is required.

Keep the database extension when rolling back application assets: it preserves
responses, historical consent and audit. Older unconfirmed provider submissions
are intentionally rejected by the new server guard. Prefer a forward fix for a
client compatibility problem; do not delete response history, revert grants or
weaken confirmation to make an old client appear functional.

The final sixteen-section report and browser/database evidence are stored outside
the repository in the `medbridge-provider-20261009` Codex artifact directory.
