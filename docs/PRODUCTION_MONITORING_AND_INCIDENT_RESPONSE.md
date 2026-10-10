# Production monitoring and incident response

## Status and reused controls — 10 October 2026

The existing Admin Operations dashboard, scoped Support **Needs attention**, immutable
audit, role-checked incidents, inquiry escalation and receipt reconciliation remain
authoritative. In-app notification rows represent persisted creation/read state; they
are not external delivery receipts. The public `/api/health` is liveness only. Existing
Admin readiness continues to measure database connectivity with bounded reads.

Production environment inspection found no independent monitor, operational webhook,
scanner worker credential or delivery provider configuration. Independent monitoring,
external alert delivery and on-call coverage remain **BLOCKED** pending actual setup and
verification. Deploying this code does not activate them. No production incident or
patient/provider notification is created by the release tests.

## Restricted dependency probe

`GET /api/internal/operations-monitor` is disabled by default. When explicitly enabled,
it requires a dedicated 32+ character server-side `MEDBRIDGE_MONITOR_TOKEN`. Ordinary
Supabase sessions cannot access it; never distribute `SUPABASE_SECRET_KEY` to a monitor.
The underlying `operations_monitor_probe()` RPC is executable only by `service_role`.
The endpoint exposes strict aggregate counts, a measurement timestamp and configuration
states: no patient, provider, incident or document IDs, content, names, paths, hashes,
signed URLs, raw errors or internal hosts. HTTP 401 means disabled/unauthorized; HTTP
503 means the database probe could not be measured. HTTP 200 means the snapshot was
measured; it does **not** mean every dependency is available. The worker evaluates its
fields. This endpoint is not an AI inference, storage-byte transfer or malware scan.

Counts: categorized request failures/partial failures in five minutes; failed runs
finished in five minutes; queued/running runs older than five minutes; ready pending,
scanning or failed scan jobs older than five minutes; open incidents whose owner lacks
an active authorized Admin role. Awaiting user input/approval is deliberately excluded
from stalled executions. The same correction applies to the existing 24-hour overview.
Storage checks both private document buckets; AI/scanner flags are configuration only.
Scanner worker absence cannot be inferred from an idle queue: no heartbeat proof exists.

## Independent worker and alert contract

`scripts/operations-monitor/worker.mjs` runs on an approved host **outside Vercel**.
It checks `/` and `/api/health`, then the protected aggregate endpoint each 60 seconds.
Requests abort after five seconds, refuse redirects and discard raw response/error data.
An unparseable, stale (>60 seconds) or missing probe never clears dependency signals.
Three consecutive observations open a signal; two measured healthy observations clear
it; unmeasured observations break streaks. Persistent signals receive a notice every
30 minutes. These are diagnostic thresholds, not approved service objectives or SLAs.

The worker writes a strict, private JSON ledger before sending, retains stable alert
IDs across restarts and enforces a single-worker lock. It refuses a damaged ledger,
target mismatch or a full 100-entry ledger rather than dropping any delivery evidence.
No entry expires automatically. Approve an archive policy before extending this limit.
Provision durable private disk/ACLs and
backup the ledger under an approved operator policy. This is not disaster recovery
assurance. A stale lock after a crash requires an operator to verify that the old worker
has stopped before removing **only that lock**. Never delete the ledger to retry alerts.

An approved HTTPS JSON receiver must support `Idempotency-Key` and authenticate the
dedicated bearer credential. Send only fixed signal/event/severity/time/action fields.
The receiver must deduplicate the same ID across uncertain requests; exactly-once
recipient delivery cannot be guaranteed by a client timeout. Maximum three attempts,
30/60-second waits (delay capped at 120 seconds), no retry for permanent 4xx other than
429. Timeout/network/429/5xx remains `unknown` until accepted or exhausted. HTTP 2xx is
`accepted`, **never delivered/read**. No configured receiver means `not_configured`
and zero attempts. Failed/unknown transport generates a separate attention signal;
if the receiver itself is unavailable, local structured logs and the independent
dead-man/log monitor are required. No automatic patient/provider resend is introduced.

`signal_cleared` means this measured condition no longer meets its threshold. It never
auto-resolves an incident, asserts patient recovery or proves a consequential retry
succeeded. Scanner configuration alerts cannot authorize downloads or mark a file clean.

## Exact external setup still required

1. Owner approves an independent host/account, operational-only receiver and named
   primary/deputy on-call operators. No such approvals or credentials are supplied yet.
2. Provision public HTTP checks for `/` and `/api/health` from outside the hosting
   environment. Configure repeated-failure confirmation and operator notifications.
   Better Stack supports HTTP status monitors with custom headers; Prometheus with
   Alertmanager is another option if infrastructure already exists. Account capability,
   costs and delivery configuration must be reviewed by the owner. No service is purchased.
3. Configure only `MEDBRIDGE_MONITOR_ENABLED=true` and a dedicated random
   `MEDBRIDGE_MONITOR_TOKEN` in Vercel. Use the same restricted token on the independent
   worker, with `MEDBRIDGE_MONITOR_ORIGIN`, absolute private `MEDBRIDGE_MONITOR_STATE_PATH`,
   approved `MEDBRIDGE_OPS_ALERT_URL`, separate `MEDBRIDGE_OPS_ALERT_TOKEN` and
   `MEDBRIDGE_OPS_ALERT_APPROVED=true`. No `NEXT_PUBLIC_` prefix. Do not put tokens in
   URLs, code, screenshots or logs. The worker needs no Supabase/application credential.
4. Implement/verify the receiver's idempotency and genuine recipient acknowledgement.
   If an existing transport cannot honor this JSON contract, adapt it and test in QA
   before activation. A generic webhook is not an already integrated email/SMS provider.
5. Supervise the worker and configure an **independent** missed-check/dead-man alarm and
   an alert for its fixed `monitor_check` failures. An application or worker cannot
   reliably notify its own total outage. The current worker has no heartbeat transport;
   its supervisor/monitor must provide that coverage. Verify alerts with an expressly
   authorized operational test recipient and sandbox failure, never patient/provider data.
6. Record actual monitor IDs, outside-host check timestamps, alert acceptance/delivery
   evidence, owner/deputy acknowledgement and rollback instructions in a private runbook.
   Do not set an “active” status based on environment variables alone.

Vendor references: [Better Stack HTTP monitor API](https://betterstack.com/docs/uptime/api/create-a-new-monitor/)
and [Prometheus alerting architecture](https://prometheus.io/docs/alerting/latest/overview/).

## Incident handling and recovery

Authorized Admins review safe diagnostics in Operations. Support continues to see only
its assigned/authorized inquiries. No global incident or document visibility is granted
to Support, providers or patients. Select the existing incident component and actual
operational severity; use Application for monitor/scanner infrastructure and Notification
for operational delivery failures. Create a genuine incident only after observing an issue.
Assign an active Admin; if none is assigned/available, escalate to the project owner via
the **approved** channel. The UI and probe flag incidents whose owner lost authorization.
Named on-call coverage is not inferred from staff-role rows.

Progress through the existing revision-checked lifecycle and structured resolution,
preserving its audit and idempotency. Clear signals and historical healthy checks are
evidence to inspect, not proof of resolution. Receipt reconciliation remains read-only
and bounded; never replay consent, documents, messages or external actions on uncertainty.
An exhausted/unknown alert requires receiver/ledger investigation; do not generate a
new ID or reset attempt counts to bypass deduplication. Configure a separate channel for
provider outage escalation, since a failed receiver cannot deliver its own failure alarm.

Rollback: disable the dedicated probe, stop the independent worker and revoke its token;
keep the ledger/audit for investigation. Existing application operations and document
quarantine continue. No automatic expiry is implemented. Retention/RPO/RTO, a genuine
ClamAV host and scan, recovery assurance, provider participation and consent acceptance
remain independent prerequisites. **Operational readiness and provider pilot: NO-GO.**
