# External integration activation and operational verification

Audit: 10 October 2026. Verified starting repository and production commit:
`093ba0571ad270959bd8258901ccdf34ed3f942d`.
Read with [the monitoring runbook](PRODUCTION_MONITORING_AND_INCIDENT_RESPONSE.md),
[scanner setup](DOCUMENT_SECURITY_AND_SCANNER_SETUP.md) and
[production safety prerequisites](PRODUCTION_SAFETY_AND_PROVIDER_PILOT.md).

## Actual production status

| Integration | Implemented | Configured | Reachable | Tested | Operational |
| --- | --- | --- | --- | --- | --- |
| Independent uptime monitoring | HTTP checks and thresholds in existing worker | No approved external account or checks evidenced | Public application and liveness respond; external checker unverified | Local worker QA; production liveness only | BLOCKED |
| Monitoring worker/host | Durable ledger, locking, bounded retries and recovery signals | No approved independent host, supervisor, private state path or dedicated credential | No production worker evidenced | Five local worker checks; unit tests | BLOCKED |
| Alert receiver and credentials | Restricted authenticated JSON transport and stable idempotency keys | No receiver URL/token or approved operational recipient | No production receiver to test | Local receiver HTTP acceptance, deduplication and failure tests only | BLOCKED |
| Delivery receipt reconciliation | Write-ahead attempts, acceptance/unknown states; existing in-app receipt reconciliation | No selected external provider or recipient receipt adapter | No external receipt channel | QA acceptance is tested; actual delivery is unverified | BLOCKED; recipient-delivery reconciliation requires a selected receiver contract |
| Private ClamAV scanner | Restricted claim/result protocol, genuine engine, quarantine and download checks | Production scanner enable flag/token and approved private host absent | Production scanner endpoint denies unauthenticated access; no worker evidenced | Local engine/pipeline results below; no production scan | BLOCKED |
| Incident escalation ownership | Existing role-checked incidents, owner checks, immutable audit and scoped Support queue | Named primary/deputy, coverage and escalation route unapproved | Operations/readiness reachable by authorized QA Admin | 29 production-safe Operations checks and local authorization checks | BLOCKED |

Vercel production environment inspection lists exactly seven existing variables:
`SUPABASE_SECRET_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_AI_MODEL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `NEXT_PUBLIC_SUPABASE_URL`. No monitor, receiver or scanner configuration exists.
The ignored local environment also has no integration credentials. No values are
copied into this report. No available approved external host/account was established
by this audit; a signed-in Supabase account is not such a host or alert receiver.

Actual production measurements: `/` and `/api/health` HTTP 200; anonymous
`/api/internal/operations-monitor` and `/api/internal/document-scans` HTTP 401,
with no-store responses. Official Supabase CLI SQL confirms the monitor migration,
service-only probe execution, private original overview, both private document
buckets, zero scan jobs and zero incidents. Zero jobs/incidents does not prove scanner
availability, monitoring or coverage. The existing AI configuration remains
`configured_not_probed`; this audit does not claim a model-inference test.

## Minimum external setup and authorized responsibilities

The project owner or explicitly delegated infrastructure operator must provide the
accounts/hosts and configure private credentials. No tokens, keys or passwords belong
in chat, browser configuration, source control, screenshots or logs. No billing change
or external notification is authorized by this report.

1. **Uptime/worker:** approve a host outside Vercel and configure supervised execution
   of `scripts/operations-monitor/worker.mjs`. Supply worker-only
   `MEDBRIDGE_MONITOR_ORIGIN`, `MEDBRIDGE_MONITOR_TOKEN` and absolute private
   `MEDBRIDGE_MONITOR_STATE_PATH`. In Vercel set the matching dedicated token and
   `MEDBRIDGE_MONITOR_ENABLED=true`. Configure separate missed-check/supervisor
   monitoring; the worker has no independent heartbeat transport. Record external
   monitor IDs and measured checks. Test three failure observations and two measured
   recoveries against an approved sandbox, without disrupting production.
2. **Alerts:** owner approves an operational-only recipient and HTTPS receiver with
   bearer authentication and durable `Idempotency-Key` deduplication. Configure
   worker-only `MEDBRIDGE_OPS_ALERT_URL`, `MEDBRIDGE_OPS_ALERT_TOKEN` and
   `MEDBRIDGE_OPS_ALERT_APPROVED=true`. Verify authentication, timeout/retry exhaustion,
   restart deduplication and actual recipient receipt. Record receiver message IDs
   privately. Select the receiver's signed receipt protocol and implement/verify its
   reconciliation adapter where needed. HTTP 2xx is only **accepted**, never delivered.
   A failed receiver needs an independently approved escalation channel.
3. **Scanner:** owner approves a private supervised ClamAV host with current signatures
   and restricted egress. Set Vercel `MEDBRIDGE_DOCUMENT_SCANNER_ENABLED=true` and a
   dedicated 32+ character `MEDBRIDGE_DOCUMENT_SCANNER_TOKEN`; configure the matching
   token and `MEDBRIDGE_SCANNER_ORIGIN` only on that worker. Use `CLAMD_SOCKET` or
   loopback `CLAMD_PORT`, or `CLAMSCAN_PATH` with `CLAMAV_DATABASE_DIR`. Follow the
   existing setup runbook. Validate genuine clean and harmless EICAR verdicts with
   non-production files in an approved isolated environment, including quarantine,
   consent/revocation and access checks. Record genuine host/engine/signature evidence.
   Enabling a flag never authorizes document access or bypasses a scan.
4. **Coverage:** owner approves the roster and channel below and verifies operator
   acknowledgement, deputy coverage and recovery permissions. Existing Admin roles
   and a bootstrap email do not establish on-call responsibilities.

| Responsibility | Named person and coverage | Required action |
| --- | --- | --- |
| Primary incident owner | PENDING owner approval | Triage genuine signals, assign authorized incident ownership, record actions |
| Deputy | PENDING owner approval | Confirm coverage, acknowledge escalation, assume ownership when primary unavailable |
| Escalation recipient/channel | PENDING owner approval | Independently reachable fallback when worker/receiver fails |
| Monitor/receiver recovery operator | PENDING designation | Inspect ledger and receiver receipt; preserve stable IDs and bounded attempts |
| Scanner recovery operator | PENDING designation | Restore engine/signature availability; never manually mark files clean |
| Database/Storage recovery operator | PENDING designation and access approval | Follow approved restore/restriction reconciliation procedure before service resumes |

No automatic ledger expiry or data expiry is introduced. Retention and RPO/RTO remain
unapproved. Production document processing remains blocked until genuine scan proof.

## Confirmed defect and narrow correction

A child-process reproduction with a synthetic malformed `MEDBRIDGE_SCANNER_ORIGIN`
confirmed that Node's startup `ERR_INVALID_URL` included the raw configured input.
This occurs before the worker's normal sanitized error handler. The worker now replaces
that parser exception with a fixed configuration error. Tests reject malformed origins
and private query-bearing origins without logging the synthetic marker. No token,
permission, consent, scanner state or production configuration is relaxed.

The malformed scanner transport test now allows two seconds for its responding local
fixture; the separate silent fixture retains the short timeout. This avoids treating
scheduler latency as malformed-response behavior and changes no production deadline.
The local HTTP receiver timeout fixture likewise allows one second for connection
establishment before asserting an unanswered request's uncertain receipt. The receiver
must actually observe that request; this does not weaken the production timeout.

## Validation and release evidence

Local evidence is stored privately under the Codex artifact directory
`medbridge-integration-20261010`; no credentials or private data are committed.

| Gate / attempt | Exact outcome |
| --- | --- |
| Scanner startup reproduction before fix | Raw synthetic malformed origin found in child stderr; disclosure confirmed |
| Targeted attempt 1 | 47 passed, 1 failed; malformed scanner response hit the 50 ms timeout |
| Targeted attempt 2 | 70 passed, 1 failed; HTTP alert timeout occurred before receiver observed request |
| Targeted attempt 3 | 71 passed; before adjusting HTTP fixture timing |
| Targeted attempt 4, final fixtures | 71 passed across four files |
| Full suite attempt 1 | 1,097 passed, 1 failed, 45 skipped; same HTTP receiver timing race |
| Full suite attempt 2, final fixtures | 1,098 passed, 45 skipped; 35 files passed, 12 skipped |
| Fresh local PostgreSQL | All 23 validation scripts passed; full migration install/seed and Operations/monitor reapplication passed |
| Actual local monitoring worker | Five checks passed: authenticated acceptance, restart/recovery, no accepted-event resend, competing lock and corrupt ledger fail closed |
| Genuine local ClamAV attempt 1, CLI | 0 passed, 1 failed; harmless file returned `scan_failed`; not a clean scan or activation |
| Genuine local ClamAV attempt 2, daemon | Two tests passed: clean PDF and EICAR verdicts; real PostgreSQL + actual HTTP worker + ClamAV pipeline including quarantine, blocked download, result idempotency and unauthorized access |
| Production Operations gate | All 29 passed; actual health probe, private QA roles/accounts disabled/banned and sessions revoked afterward |
| Production anonymous privacy gate | All 39 read-only checks passed |
| Production HTTP/SQL observation | Root/liveness 200; private monitor/scanner 401; private buckets and service-only monitor RPC confirmed |
| Lint attempts 1 and 2 | Both exit 0; zero errors, one existing `engine.mjs:21` unused-expression warning |
| TypeScript / webpack build | Both exit 0; webpack compiled, TypeScript finished and all 29 static pages generated |
| Browser secret check attempt 1 | Failed with ENOENT: concurrent build had removed `.next/static`; no security pass claimed |
| Browser secret check attempt 2, generated build assets | Passed: configured private secrets absent from 544 repository files and 104 browser JavaScript assets |
| Staged diff/security review | Five intended files only; whitespace check and configured-secret/credential-pattern audit passed |

The CLI scanner failure is not rewritten as success. The subsequent daemon used genuine
ClamAV 1.4.6, signatures 28149 dated 10 October 2026 11:54:04, with current-signature
validation intact. It ran on loopback with non-production files. The pipeline uses
real local SQL/RLS and HTTP, but an in-memory Storage-byte adapter; it does not prove
hosted Storage scanning or production host connectivity. Expected SQL
`DOCUMENT_SECURITY_BLOCKED` errors are negative assertions in the passing pipeline.
The owned local scanner and PostgreSQL processes were stopped after QA.

The monitoring worker QA uses an isolated loopback receiver and private ledger; it
proves acceptance and persistence, not an external recipient receipt. Production
Operations checks create only disposable private identities and record a measured
health result; they create no provider, inquiry, incident, document or delivery fixture
and send no patient/provider notifications. No production integration was activated;
the before/after configuration matrix is unchanged. No migrations are added.

**Operational readiness and provider pilot: NO-GO.** Missing external integrations,
genuine recipient receipts and approved coverage remain blockers. Real provider
organization/representative participation, consent/document acceptance, approved
recovery targets and verified database/private Storage recovery are independent
prerequisites; none is invented or waived by this audit.
