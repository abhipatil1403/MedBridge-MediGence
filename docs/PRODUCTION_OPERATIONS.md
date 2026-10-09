# Production operations and recovery

## Initial audit — 10 October 2026

Clean main at 6a0d6a14ede431d64759c81fb895a8da833564ac.

Existing: Next.js liveness /api/health; private Supabase RLS; atomic database inquiry
commands and operation receipts; existing immutable audit and in-app notifications;
current authority/canonical provider readiness; bounded AI execution/model retry and
persisted agent runs/actions; scoped Support queues. No configured email/SMS transport,
webhook, background delivery queue, scheduled external health monitor or alert drain.
The Automation Map contains future concepts; they are not implemented integrations.

Missing: bounded authenticated readiness probes and verified check history; explicit
operational stale-work thresholds; safe Admin aggregation of execution failures;
request failures when a transaction rolls back; a minimal incident lifecycle; read-only
receipt reconciliation after uncertain request outcomes; evidence distinguishing
provider capability from a real participating-provider acceptance test.

## Infrastructure reused and boundaries

Extend existing Admin navigation/API, portal settings, agent runs/actions, inquiry events,
operation receipts, notifications and audit. Add only incident state and bounded recovery
attempts where no existing lifecycle fits. Health probes never call AI or scan patient data.
Failure telemetry is a strict metadata projection, not raw prompts/messages/files/errors.
Operational thresholds are administrative policy, never clinical urgency. Escalation is
explicit and invokes the existing inquiry state machine. Recovery reconciles receipts;
it never replays patient messages, consent, provider responses or external actions.
External delivery/uptime monitoring remain unconfigured until a real integration is set up.
No production provider fixture or fabricated provider acceptance will be created.

## Operator runbook

Open **Admin → Operations** with an active Admin or Super Admin account. Support has
**Needs attention**, restricted by the existing inquiry assignment/authorization rules.
Patients and provider accounts cannot access the privileged overview or readiness data.

1. Select **Check health**, review the confirmation and submit. The server measures
   connectivity before recording a result. Check its timestamp and last successful check;
   an old successful result is historical evidence, not a statement about current health.
2. Review overdue work and its actual last meaningful activity. Open the existing inquiry
   to inspect authorized context. **Escalate** requires confirmation and the current
   revision, uses the existing status transition and records its administrative reason.
3. For a failed inquiry request, select **Check original receipt**. A confirmed receipt
   means the original transaction committed. An unknown result means it has not been
   confirmed; contact an authorized operator before attempting any consequential action.
   This control never replays the original command.
4. Open an incident with a component, operational impact and active Admin owner. Progress
   through Open → Acknowledged → Investigating → Resolved → Closed. Record a structured
   resolution note before resolving/closing. Ownership/status changes retain the original
   and new values in the existing immutable audit trail.
5. Review provider prerequisites. A current approved organization, canonical listing
   authority, active authorized team and routing capability are required. Pilot acceptance
   additionally requires an actual consented inquiry, a current authorized provider response,
   a persisted in-app notification and explicit Admin attestation that a real provider
   participated. Suspension, lost authority or revoked consent invalidates current readiness.

### Threshold policy

Defaults: unassigned 24 hours, Support 48 hours, provider 72 hours, patient 168 hours.
Admin may change whole-hour values: 1–720 hours for the first three, 1–1,440 for patient
information. Times are stored/compared in UTC and displayed in the selected timezone.
Meaningful activity is submission, message, status change, information request, provider
sharing/response or a document request/upload/replacement/review. Viewing a page,
reading a message or changing a monitoring setting does not reset waiting time.
Closed/resolved/cancelled, legacy and consent-revoked inquiries are excluded. Elapsed
time never changes status automatically and does not infer medical urgency.

## Health contract and measurement boundaries

| Surface | Meaning and bounds |
| --- | --- |
| `/api/health` | Public liveness: this application responds; no detailed internal state. |
| `/api/health/ready?portal=admin` | Fresh authorized role check; database read probe, at most two attempts, 2-second deadline each with abort, 100 ms transient backoff. Authentication has a 5-second deadline. HTTP 200/503 for measured ready/not-ready; 401/403 for denied access. |
| Readiness cache | Per-process single flight; successful results 30 seconds, failed results 5 seconds. Original measured timestamp is retained. No scheduled uptime coverage is implied. |
| Manual check | Forces a measured probe, then a server-only audited write with a 3-second deadline. Same actor/operation ID returns the original persisted check. Latest 10 verified results and last successful timestamp are visible. |
| Storage | Confirms the configured inquiry bucket exists and is private. It does not test upload/download end to end on every probe. |
| AI | `configured_not_probed` or `not_configured`; no model invocation in a health check. |
| External delivery/monitoring | `not_configured`; no fabricated external availability or delivery claim. |

The readiness definition is core database connectivity. Storage or AI configuration is
reported separately. Public responses never contain credentials, internal hosts or raw
database errors. Detailed operational responses use `private, no-store`.

## Metric definitions

All overview counts are measured at `asOf`; rolling windows start at `windowStart`
(24 hours earlier). No uptime percentage, clinical score or synthetic success rate exists.

| Metric | Source, scope and definition |
| --- | --- |
| New inquiries | Consented, nonlegacy inquiries created in the last 24 hours, including subsequently closed items while consent remains valid. |
| Active inquiries | All current eligible nonterminal inquiries, not limited to 24 hours. |
| Unassigned | Eligible active inquiries with no assigned Support user; may overlap provider/patient waiting counts. |
| Support/provider/patient waiting | Current attention category: provider/patient waiting states take precedence; otherwise assignment determines unassigned versus Support. |
| Overdue | Current eligible inquiries whose last meaningful activity meets/exceeds the relevant threshold. Queue is capped at 50 matching records, ordered overdue then oldest. |
| Failed requests | Last 24 hours, latest 30 failed or partially completed metadata events with a failure category from the instrumented inquiry/assistant POST routes. These are observed requests, not a complete hosting log or all historical failures. |
| Notifications | In-app rows created in the last 24 hours, split by current `read_at` within that same cohort. Unread does not mean queued, sent, delivered or failed externally. |
| AI runs | Runs created in the last 24 hours: final persisted statuses; unfinished after five minutes is an investigation signal, not a confirmed timeout. Durations use actual persisted start/end timestamps when available. |
| Model retry recovery | Instrumented request completed after an observed successful additional model attempt. Historical retry outcomes before this release are not measured. |
| Failed tools | Latest 30 failed tool actions within 24 hours, with allowlisted tool identifier and categorical failure only. |
| Incidents | Current persisted incident state, latest 30 records; this is operational impact, never clinical urgency. |
| Provider readiness | Current provider-submitted organizations and existing network authority/publication/team facts. Reference catalog publication does not establish provider participation. |

## Recovery, notifications and telemetry

The existing inquiry transaction/receipt is authoritative. Reconciliation uses the
original actor, operation ID and action, then stores only a categorical receipt result.
It never copies the receipt payload. Source-level locking and unique constraints prevent
concurrent duplicate processing. Maximum three checks, with 30/60-second waits before
subsequent checks (the backoff calculation is capped at 120 seconds). Final outcomes are
completed, unknown or permanently failed. Permission, consent, validation/configuration
and unknown categories are not automatically retried. An existing receipt may still prove
commit even when a failure was classified as permanent.

Readiness retries only safe reads. The existing bounded model retry remains unchanged.
No new queue, background replay, automatic message resend, consent replay, document sharing
or Recover-task creation is introduced. In-app notifications remain atomic with their
source command; operation IDs prevent duplicate incident notifications on command retry.
No email/SMS attempt record or webhook state is invented for absent transports.

Request telemetry uses strict allowlists: correlation/operation/execution UUIDs, event
kind, action, final outcome, categorized errors, measured duration, retry count and
categorical model failures. No prompts, message bodies, patient identity, documents,
signed URLs, tokens, raw stack traces or provider payloads are stored here. Existing
runtime records are projected to safe fields. If telemetry persistence fails, a fixed
`operations_telemetry_unavailable` log is emitted and the product outcome is preserved;
telemetry recording is bounded by two seconds and is best effort.

## Database and privacy

Migration `20261010100000_production_operations.sql` adds two RLS-protected state tables:
`operational_incidents` and `operational_recovery_attempts`. Authenticated direct writes
and all anonymous access are revoked. Active Admins may read; privileged commands
recheck current authorization and confirmation. Support receives only its existing
authorized attention queue. Disabled accounts/roles are denied.

Follow-up `20261010101000_partial_execution_visibility.sql` includes actual partial failures and execution limits in the existing private overview, preserving successful sourced results.

Existing settings hold policy/latest health; existing append-only audit records hold
commands, measured checks and metadata. Generic settings cannot forge operations keys.
Health/telemetry writers are service-role only. Existing audit immutability and private
document policies are preserved. No public provider/catalog ownership changes occur.

Audit retention follows the existing append-only policy. There is no new automatic
purge: approve a retention/archive process before changing audit history. Local QA
databases/routes are disposable. Live private QA identities are disabled, banned and
their sessions revoked; immutable audit references remain. Production test inquiries,
if used by the existing regression gate, are closed with consent revoked and temporary
documents removed. They never become public provider/catalog fixtures.

## External dependencies and outage recovery

- **External uptime/alerting:** no independent monitor or alert drain is configured.
  Configure an authorized external HTTP monitor for public liveness and its alert
  recipients. Decide an authorized private readiness integration separately; never
  distribute a service-role secret as a monitor credential. Application checks alone
  cannot notify an operator while the application/database is unavailable.
- **Email/SMS:** no delivery transport is configured. Before activation, select and
  authorize a transport, server credentials, verified sender, recipient consent,
  idempotent delivery records and a signature-verified webhook. Map accepted/sent,
  delivered, read, failed and unknown to the actual provider evidence. Do not send
  unsolicited test messages to real recipients.
- **Runtime logs:** hosting logs are available through the existing hosting account,
  not ingested into Operations. The fixed sanitized telemetry-unavailable log needs
  an authorized log alert configuration if proactive alerts are required.
- **Database failure:** readiness returns not-ready. Use hosting/Supabase diagnostics,
  restore connectivity, then rerun an actual health check and reconcile uncertain
  commands against receipts. A dashboard cannot recover a missing database by itself.
- **Real provider pilot:** onboard an actual authorized participating organization and
  obtain genuine patient authorization before testing a response and notification.
  Local QA acceptance is never production participation.

## Validation and performance evidence

Release gates: 959 automated tests passed, 39 opt-in integration tests skipped in the
default suite; one actual Cloudflare model test passed separately. A fresh PostgreSQL
install, all 20 SQL validation scripts and migration reapplication passed. Eight
concurrent identical commands produced one incident, one audit and one notification
per recipient. These are isolated local QA results, not production provider activity.

Browser checks exercised measured health, threshold editing, confirmed escalation,
all incident lifecycle transitions, receipt uncertainty/backoff, denied provider access,
scoped Support, error/loading/empty/success states, English/Hindi/Marathi and widths
320/375/390/430/768/1024/1440. No horizontal overflow; visible main actions met 44 px
height. The queue filter reset found during refresh was fixed and verified.

Populated local benchmark: 1,000 inquiry rows, 20,000 case events (10,000 meaningful) and 2,000 metadata
events. Mean probe 0.10 ms, overview 304.45 ms, existing public snapshot 97.52 ms.
These measure SQL on local PostgreSQL, not production network latency or an uptime SLA.
Operations is fetched only in authorized workspaces; public catalog paths do not execute
the overview. Production measurements and deployed SHA are recorded in the release report.

### Design critic

Score: **93/100 — SHIP** for the operational workspace. Strengths: existing brand/design
system retained; compact records and progressive details; explicit confirmations and
honest integration states; narrow-screen controls; clear scoped Support experience.
P0/P1: none remaining after the refresh-filter fix. P2: the Admin overview is a long
workspace, historical diagnostics are deliberately bounded, and long IDs require
progressive details. These do not block the requested operational release.
