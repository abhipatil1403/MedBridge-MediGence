# Production safety and controlled provider pilot

Audit date: 10 October 2026. Baseline: `97e3aa890d70efaa235f46a9b4525e0b7f98a585`.
Read alongside [the acceptance plan](PRODUCTION_ACCEPTANCE_AND_PROVIDER_PILOT.md).
**Decision: NO-GO. No real provider has confirmed participation.**

Backup activation audit (10 October): [production backup and disaster recovery](PRODUCTION_BACKUP_AND_DISASTER_RECOVERY.md)
records current official API evidence, the database/private-object consistency design,
operator access requirements and genuine Supabase restore acceptance procedure.
No listed recovery point or enabled PITR exists in the collected evidence. Signed-in
follow-up confirms Free/Nano excludes managed backups, one Owner with MFA disabled,
and S3 enabled with no keys. Independent object backup, latest restriction ledger,
operator separation, target and RPO/RTO remain pending.
This release does not activate a backup schedule, change billing or claim Storage
recovery from the prior local filesystem exercise. Recovery assurance remains NO-GO.

Retention follow-up (10 October): [data lifecycle and restore assurance](DATA_RETENTION_DELETION_AND_RESTORE.md)
adds durable cleanup to existing explicit assistant-file removal, protected holds,
fail-closed restoration checks and genuine isolated DB/file restoration evidence.
No retention policy or RPO/RTO is approved. Production backups returned no available
snapshots and PITR disabled; separate Storage backup and current-change ledger remain
unverified. Production recovery assurance and the provider pilot remain NO-GO.

Scanner follow-up (10 October): [document security and setup](DOCUMENT_SECURITY_AND_SCANNER_SETUP.md)
records the new fail-closed quarantine control, genuine isolated ClamAV evidence and
blocked production activation. No approved scanner host exists. The assessment and
validation counts below describe the preceding `a87b2df` release; they are retained as
historical evidence. The follow-up does not satisfy retention, historical signed-link
revocation, operational coverage or real-provider acceptance requirements.

## Assessment and evidence boundaries

PASS below means the stated technical control is implemented and tested. It does not
mean that a real organization completed acceptance. Isolated PostgreSQL fixtures are
not production providers, patient records, delivery receipts or operational incidents.
In-app notifications are saved records, not evidence of a human reading them.

| Control | Assessment | Implemented / configured / tested / pending |
|---|---|---|
| Reviewed inquiry and consent | PASS (technical) | Creation binds reviewed title/objective to a published listing revision. Support consent is explicit. Provider sharing separately identifies the connected organization and purpose. SQL inquiry and coordination gates exercise missing consent, frozen revision and withdrawal. Real patient/provider rehearsal is pending. |
| Tenant, principal and ownership isolation | PASS (technical) | Verified sessions, active accounts, current ownership/membership and RLS gate reads and writes. Assigned Support and provider projections remain scoped. Cross-owner, unassigned staff, suspended membership and consent revocation checks run in isolated PostgreSQL. No permissions were relaxed. |
| Genuine response and truthful status | PASS after fix | The authenticated context RPC links a same-case message from a provider principal. UI, inquiry GET and owner AI status now require that linked, nonempty response before claiming a provider response or acceptance. Queue rows direct the reader to verify the scoped detail. Stored history remains unchanged. Baseline status-only regressions failed; regression tests and real local lifecycle now pass. A genuine production provider response remains BLOCKED. |
| Retries, partial failure and recovery | PASS (technical) | Actor/operation transaction locks, input-hash conflict checks and receipts bound consequential writes. Retry rechecks current authority. Local tests verify one response on retry, rollback after an injected failure, and denial of historical receipt replay after withdrawal. Persisted agent recovery uses isolated PostgreSQL; external consequential actions are not enabled or inferred. |
| Private storage and delivery | PASS (technical) | Inquiry, assistant and provider evidence buckets are private. Application downloads use fresh authenticated authorization, attachment responses and no-store headers. Recipient/file-specific inquiry grants are required independently of private upload. SQL storage and inquiry gates cover outsider and revoked reads. No application download endpoint returns a public or signed storage URL. |
| Upload validation | PASS for implemented checks | Server validation enforces nonempty files, 3 MB limit, allowed PDF/JPEG/PNG MIME, extension and byte signatures; ownership and active scope are checked. These checks do not prove a file is safe or well formed. |
| Document sharing and withdrawal | PASS for subsequent access | Separate named-recipient grants and current consent guard delivery. Withdrawal stops subsequent unauthorized reads and writes. Previously downloaded copies cannot be recalled. Older case/document workflows use their explicit legacy consent model; do not treat that as equivalent to the new per-file inquiry grants. |
| Sensitive diagnostics / AI boundary | PASS for audited paths | Discovery logs now record an allowlisted category, never the raw downstream error. Regression tests use synthetic filename, stack and URL sentinels. Download errors are generic; file bytes, storage paths and signed URLs are excluded from model context. Case metadata processing remains a separately consented feature. No broad claim that all infrastructure logs have been audited is made. |
| Malware scanning / quarantine | FAIL (absent) | No scanner, quarantine, scan verdict or incident process is implemented or tested. File signatures are not malware scanning. Document-bearing pilot activity must remain blocked until approved controls and genuine tests exist. |
| Retention and physical deletion | BLOCKED | Workspace removal disables access and attempts physical deletion; failed cleanup can leave inaccessible bytes and requires reconciliation. Inquiry withdrawal and provider evidence archival do not physically erase stored bytes. There is no approved retention schedule, automatic purge or complete deletion rehearsal. Define owners, legal retention decisions, purge/failed-cleanup procedure and backup treatment before enabling pilot documents. |
| Signed URL expiration | BLOCKED for any proposed bearer-link workflow | The application does not mint download links. Supabase permits authorized storage clients to request signed links where SELECT policies allow access. Do not promise that consent withdrawal invalidates an already issued bearer link; expiry, object deletion and copied files have separate semantics. Any future sharing-link workflow needs an approved expiry and revocation design plus tests. |
| Operations health and audit | PASS (technical) | Public liveness, privileged measured DB/storage readiness, bounded retries, freshness and an idempotent audit exist. AI configuration is reported as configured, not externally probed. A public health endpoint alone is not independent monitoring. |
| Notifications and delivery | BLOCKED (operational) | In-app records exist and transaction/idempotency checks are tested. External delivery is not configured; there are no email/SMS delivery receipts or alert tests. A provider must explicitly accept an in-app/manual-check protocol, or authorized external delivery must be configured and genuinely tested. |
| Independent uptime and outage alerting | BLOCKED | No independent monitor, named alert account or genuine notification test is available. Operations UI distinguishes this from measured readiness. |
| Incident ownership / coverage / escalation | BLOCKED (human), PASS (technical permissions) | Scoped incident ownership, escalation and bounded recovery commands exist and are tested in QA. Named on-call, deputy, coverage hours, acknowledged escalation path and handover evidence are missing. No fake production incident is evidence. |
| Backup / restore and rollback | BLOCKED for restore assurance | Runtime rollback follows normal Git deployment; no migration is introduced by this fix. Approved recovery objectives, authorized backup access and genuine restore rehearsal are still missing. |
| Participating provider and end-to-end acceptance | BLOCKED | No confirmed organization or authorized representative, agreed coverage, real inquiry receipt/response or completed pilot attestation exists. Public reference listings and QA fixtures are not participation. |

## Confirmed defects and reproduction

1. Construct an inquiry context with any response state (`information_requested`,
   `responded`, `accepted_for_coordination`, `further_review`, `unable_to_coordinate`)
   and no attributable `latestResponse`. Previously, status/next-step text could claim
   a response. Five baseline regressions failed. This demonstrates an incomplete-context
   presentation defect; it does not establish fabricated production responses.
   `effectiveProviderStatus` and the API/AI read projection now report
   `unconfirmed_response`; genuine linked response evidence preserves the original state.
   No database history or recipient authorization changes.
2. Reject public catalog discovery with a downstream error containing synthetic private
   metadata and a URL. Previously, `console.error` logged the raw object. The baseline
   logging regression failed. Discovery now logs only a stable event and allowlisted
   failure category; its HTTP response remains generic.

Tests: `patient-inquiries.test.ts`, `inquiry-evidence-projection.test.ts`,
`discovery-safety-log.test.ts`, and opt-in `inquiry-safety-local.test.ts`.
The local SQL test transport gained `neq` support to exercise the actual owner inquiry
read path; this is a harness correction, not a production authorization change.
The release report records every failed attempt and final validation count separately.

## Release validation

- Default suite: **1,022 passed, 42 opt-in skipped**, 31 files passed / 9 skipped.
- Targeted safety/recovery run: **154 passed across 8 files**, including three actual
  isolated PostgreSQL tests for inquiry lifecycle and persisted agent replay/recovery.
- Fresh database install/seed, all **20 SQL validation scripts**, migration reapplication
  and provider-network lifecycle rerun: passed. No new migration is needed.
- Eight simultaneous Operations commands in loopback QA: one incident, one audit and
  one notification. The existing isolated harness was copied to the artifact directory
  with only its loopback port changed to the owned QA server's port; no production
  permissions or application policy changed.
- Hosted baseline: **39 public catalog/privacy** and **24 Operations** checks passed.
  Read-only aggregates confirm private buckets, zero approved organizations, current
  listing ownerships, provider messages and pilot attestations. Operations QA roles,
  unbanned accounts and sessions: zero after cleanup.
- Failed attempts are not passes: five status baseline failures; one logging baseline
  failure; an initial targeted run with 149 passed / 1 failed (disconnected-context
  precedence); a subsequent run with 151 passed / 1 failed (test transport missing
  `neq`). Both were corrected. An intermediate narrower run passed 129 checks before
  the complete 154-check run. A read-only aggregate attempt returned HTTP 400 when
  invoking a private helper; the revised query used table aggregates and succeeded.

Lint, TypeScript, build, browser-secret scan, deployed SHA, final hosted assistant gates
and cleanup evidence are recorded in the release artifact report. These technical
results do not close the real-world dependencies above.

## Practical first-provider checklist

Every row needs a real named owner and verifiable evidence. Do not fill missing evidence
with QA accounts, inferred agreement or generated communications.

| Gate | Responsible participant | Required acceptance evidence |
|---|---|---|
| Organization and representative | Admin + real representative | Official organization identity and contact independently checked; written representative authority; verified MedBridge sign-in; explicit agreement to the bounded pilot. |
| Listing and team | Admin + organization owner | Correct listing/revision and approved publication; canonical ownership; individually invited team accounts and least privilege; nonmember/other-organization denial rehearsal. |
| Scope and patient consent | Patient + Support + provider | One organization, administrative coordination only, agreed cohort/window; patient reviews exact fields and recipient/purpose before Support submission and separately before provider sharing. |
| Inquiry receipt and response | Assigned Support + real representative | Real authorized inquiry ID and frozen revision, genuine provider-read/response record entered by the representative, patient-visible linked response and actual saved events/notifications. Confirm that no booking, payment or clinical acceptance is inferred. |
| Withdrawal | Patient + privacy owner | Authorized rehearsal proves subsequent recipient access and writes stop; explains preserved history and inability to recall downloaded copies. Interrupted/duplicate/failure injection stays in isolated QA. |
| Documents | Privacy/operations owner | Remain excluded by the agreed pilot procedure until malware handling, recipient/file grants, retention, deletion and failed-cleanup/backup treatment are approved and tested. This procedural exclusion is not a server feature flag. |
| Support and on-call | Support manager + named operator/deputy | Written coverage hours, response target, escalation contact, handover and acknowledged responsibility. Default product thresholds are not a promised SLA. |
| Notification and incident procedures | Operator + representative | Explicit acceptance of in-app/manual checks or genuinely tested authorized delivery; independently configured uptime alert and successful alert rehearsal; severity, ownership and escalation procedure. |
| Restore / release | Release owner | Exact production SHA, passing technical gates, reviewed rollback commit, approved backup/restore evidence and recovery objectives. |
| GO decision and pilot attestation | Product owner + Admin + provider | All required rows accepted, no unresolved critical/high safety incident, genuine production acceptance evidence recorded through existing workflow. |

### Stop, rollback and exit conditions

- Stop new pilot activity on unauthorized access, withdrawn-consent sharing, misrouting,
  duplicate consequential effects, unsupported response claims, missing audit or absent
  coverage/alerting. Notify only authorized participants through the agreed channel.
- Suspend/revoke affected ownership or membership through existing Admin controls;
  preserve response/audit history. Patient withdrawal remains under patient control.
  Reconcile uncertain operation IDs; do not replay consent or invent success.
- Revert the runtime release through normal Git deployment if necessary. This release
  creates no migration. Restore infrastructure/data only under an approved restore plan.
- Exit successfully only after the agreed cohort/window has genuine responses, accurate
  patient views, honored withdrawals, completed handover, no unresolved critical/high
  incident and written provider/Support/product acceptance. Otherwise pause or end it.

**NO-GO until all required safety and real-world acceptance gates are satisfied.**
