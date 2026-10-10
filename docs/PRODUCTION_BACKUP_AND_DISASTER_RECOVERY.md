# Production backup and disaster recovery

Audit: 10 October 2026. Verified starting/deployed commit: `6951330`.
Read with [retention and deletion](DATA_RETENTION_DELETION_AND_RESTORE.md) and
[production safety](PRODUCTION_SAFETY_AND_PROVIDER_PILOT.md).

**Production recovery assurance: BLOCKED / NO-GO.** This document is a concrete
activation and restore design, not evidence that a backup job or paid add-on exists.
RPO, RTO, backup retention, automatic expiry and recovery approvers are unapproved.
Automatic expiry remains disabled. The provider pilot remains NO-GO independently.

## Actual configuration and evidence

The official authenticated Supabase CLI reports project `xnzdrsqjdabsbcgymwgn`
in organization `cmmgxllhvbahkesfnwzb`, region `ap-south-1`, ACTIVE_HEALTHY,
PostgreSQL 17.6. Current backup response: `backups: null`, `pitr_enabled: false`,
`physical_backup_data: {}`, `walg_enabled: true`. No backup entry or physical
recovery interval is listed. The earlier retention report projected this as an empty
list; retain the raw distinction. WAL-G enabled alone proves neither backup completion
nor recoverability. No configuration or billing change was made by this release.

The initial organizations list did not expose a plan, and the initial dashboard audit
was signed out. After the user signed in, the authenticated dashboard directly
confirmed **Free plan / Nano compute**. The scheduled backup page explicitly excludes
project backups on Free. The plan quote shows Pro from $25/month with seven days of
daily DB backups; the PITR page shows a Pro add-on starting at $100/month. PITR also
requires eligible compute. These are observed starting prices, not an approved purchase
or guaranteed total including usage/compute. No subscription/add-on was changed.

The Team page shows exactly one member, the current session's Owner. That member is
still listed under the **MFA disabled** filter. No dedicated recovery operator or
independent approver is configured. Owner membership is verified, but a successful
backup restore and restore audit are not. MFA enrollment/recovery codes require the
owner's own authentication setup; no account factor, invite or permission was changed.
Storage S3 connection is already enabled; its Access keys table contains **no keys**.
No key was created or copied. Source credential separation and a protected destination
remain pending, and an enabled endpoint alone is not object backup coverage.

Metadata-only production audit finds two buckets (`care-documents`,
`provider-documents`), both private and limited to 3,145,728 bytes. Each currently
contains zero objects; scan jobs, deletion jobs and active holds are empty. This is
not a successful object-backup test. Quarantine is a persisted scan state on objects
in these private buckets, not a separately backed-up quarantine bucket. Include every
scan state and unregistered/orphan object in backup inventory, never only clean files.

Latest migration: `20261010131000`. Nine prerequisite checks pass: required private
buckets, lifecycle RLS, ordinary browser table/RPC denial, gate presence, missing-gate
denial, tombstone guard, restrictive direct Storage policy and blocked-gate-only
reconciliation. The gate is false during normal production service. These checks
inspect definitions/grants/aggregate metadata; behavioral tests remain necessary.

Repeat the safe audit with authorized operator access:

```powershell
npx --yes supabase@2.120.0 backups list --project-ref xnzdrsqjdabsbcgymwgn --output json
npx --yes supabase@2.120.0 db query --linked --project-ref xnzdrsqjdabsbcgymwgn --file scripts/audit-production-recovery.sql --output json
```

Keep the resulting operator artifacts private. This query returns no patient rows,
object paths, signed links or credentials. It does not download backups or prove
object bytes exist. A false prerequisite is an investigation item, never permission
to bypass authorization. Missing relations make the audit fail rather than pass.

## Supported platform capabilities

- Managed daily DB backups are documented for Pro, Team and Enterprise, with plan
  dependent history. Free projects are advised to keep independent exports.
- PITR is a paid add-on for those paid plans and requires at least Small compute.
  Enable it only after an owner approves its cost and recovery period. Its configured
  recovery interval must then be genuinely visible and restorable.
- Database snapshots contain Storage metadata, **not Storage object bytes**. Separate
  byte backup is required regardless of managed DB backup/PITR status.
- Supabase's S3 endpoint does not support bucket versioning or undelete. Source S3
  access keys bypass RLS and cover all buckets; they are privileged operator secrets,
  not a read-only credential. Do not weaken application Storage policies to export.
- Manual restore requires auditing platform/Auth/extensions/managed-schema custom
  policies and migration history as well as application data. Logical export commands
  must be checked for included schemas; a schema-only dump is not a data backup.

Sources checked for this audit: [managed backups](https://supabase.com/docs/guides/platform/backups),
[subscription](https://supabase.com/docs/guides/platform/billing-on-supabase),
[platform roles](https://supabase.com/docs/guides/platform/access-control),
[S3 credentials](https://supabase.com/docs/guides/storage/s3/authentication),
[S3 limitations](https://supabase.com/docs/guides/storage/s3/compatibility),
[DB/Storage migration](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Recovery design to approve and activate

| Component | Required protection | Present state |
|---|---|---|
| PostgreSQL | Verified managed backups if entitled, or encrypted independent logical exports covering application/private schemas, Auth, roles, custom Storage policies and migration history; inspect actual inclusion and compatibility | No listed managed recovery point; independent production exports not configured |
| Private objects | Separate encrypted object snapshots in an approved account/destination; include care, inquiry and provider evidence, pending, failed, quarantined, held and orphan objects | No destination, credentials, job or completion evidence available |
| Current restriction ledger | Independent, ordered preservation of deletions, removed metadata, withdrawn consent, document grants, holds, account/role/membership suspension and ownership changes after the DB snapshot | Not implemented/configured; snapshot-era records alone are insufficient |
| Platform and release | Git SHA, migration version, extensions, custom roles/policies, Auth settings, Storage settings, operator secret mappings and approved infrastructure configuration | Git/migrations available; external settings and key recovery require owner inventory |
| Monitoring | Independent scheduled-job completion, freshness, failure, destination capacity and restore-drill alerts with genuine delivery and named owner/deputy | In-app Operations exists; independent monitoring/external delivery and coverage pending |

### Backup consistency and completion contract

Use a uniquely identified snapshot set with source project, start/end UTC times,
database recovery point/export snapshot, Git SHA, migration version, full bucket
inventory, scan/deletion/consent ledger watermark and a protected manifest. Private
manifest entries bind bucket/key, exact byte length and SHA-256 to the corresponding
immutable scan identity. Protect names, hashes, tenant metadata and delta payloads as
sensitive data; public logs show only set ID, phase, counts and categorical failures.
Never send exported data to AI or return signed URLs from an Operations endpoint.

The first controlled backup should run during approved maintenance: stop all writes,
uploads, scan/deletion workers and external actions, drain in-flight requests, record
restriction state, capture DB and object snapshots, check hashes and complete the set
before reopening. Quarantine remains inaccessible. A maintenance interval, measured
duration and supported export method require approval; no production shutdown is
performed here. Online snapshots subsequently need a tested consistent snapshot plus
durable change capture and deletions/role/consent reconciliation. Do not call a set
consistent solely because copies finished around the same time.

A set is complete only after the DB artifact is readable, every inventoried object
has verified destination bytes, ledger watermark is reconciled, and an authenticated
manifest/completion record is written. Missing bytes, changed hashes, pagination
failure, interrupted transfer or unavailable ledger keep the set FAILED/INCOMPLETE.
Retries use immutable set/object identities and checksums; partial uploads cannot
replace an older completed set. Do not mirror source deletion into all historic copies
with an unreviewed sync/delete command. Backups must obey approved holds/deletion
policy; no automatic pruning or new retention period is introduced.

### Frequency, retention and access

Owner must select snapshot interval, independent ledger capture interval, retention
and restore rehearsal frequency after approving data sensitivity, cost and RPO/RTO.
These fields remain **PENDING**, not assumed daily objectives. A platform daily-backup
feature, if available, is a technical cadence rather than an approved service promise.
Do not launch an unattended schedule without destination, failure coverage and policy.

Use a separately approved worker and private encrypted backup destination outside
the production project's failure domain. Destination write principal should lack
delete/restore capability; a separate restore operator should read only the approved
set. Retention administrator and recovery approver should be distinct where staffing
allows. Verify actual IAM deny behavior, encryption-key recovery, transport encryption,
access/audit records and account isolation; naming roles is not configuration evidence.
Source Supabase privileged credentials remain inherently broad: separate them from
the runtime secret, restrict worker host/network, rotate them, and audit usage. Do not
claim RLS constrains generated S3 keys. Never put backup keys in Vercel browser env,
Git, command lines, logs or completion receipts. Approved secret-store configuration
and a recoverable encryption key are prerequisites, not placeholders to fill in chat.

### Completion and failure visibility

An approved independent monitor must check both completed DB/object set freshness
and ledger continuity. Missing completion, checksum mismatch, expired operator auth,
full destination, partial transfer or missed schedule opens an actionable alert with
set ID, phase, safe error category, age, owner/deputy and runbook link. Avoid paths,
filenames, keys and patient details. Test an authorized synthetic failure and actual
notification acknowledgement outside production patients. Current in-app records and
a public health endpoint do not prove this delivery; no external alerts were created.

## Genuine isolated restore acceptance procedure

**BLOCKED for Supabase object recovery:** no approved isolated Supabase target or
backup destination/credentials was available at audit time. Docker is installed but
its Linux engine was unavailable. No hosted project was created, no production backup
was downloaded and no patient object was copied. The previous real PostgreSQL/local
filesystem exercise is supplemental evidence, not a Supabase Storage restore pass.

After environment and access approval:

1. Name source QA project, distinct target, protected backup account and independent
   approver. Refuse production IDs, unapproved destinations and genuine patient data.
   Disable outbound notifications/webhooks/AI/worker side effects on the target and
   block application traffic externally. Use only harmless synthetic documents and
   disposable QA principals, including other-tenant and suspended provider accounts.
2. Prepare QA clean/held/quarantined/pending objects through actual Supabase Storage
   and the real scan workflow where approved. If verdicts are fixtures, explicitly
   limit the claim to recovery of persisted states, not new malware detection.
   Save sizes/hashes, relations, memberships, grants and actual DB migrations/policies.
3. Create a real DB backup and separate encrypted object snapshot with completion
   manifest. Independently retain actual post-snapshot consent withdrawal, deletion,
   hold and membership suspension records. Record their order/watermark and integrity.
4. Restore DB to the distinct target using the selected supported method. Verify all
   required schemas/roles/policies/triggers/history, platform encryption settings and
   credentials. Before any route opens, set the recovery gate true through authorized
   operator access. A normal dump contains false; restoration does not isolate itself.
5. Restore bytes through the real Storage API/S3 endpoint into private buckets with
   canonical keys and verified hashes. Restoring `storage.objects` alone creates no
   bytes; copying bytes without matching metadata/scan identity is also incomplete.
   Resolve restore-method/platform ownership conflicts through an approved, tested
   procedure. Keep overwritten/mismatched/unregistered/quarantined identities blocked.
6. Replay the protected latest restriction ledger before exposure. Preserve actor,
   ordering and immutable identities; deny on missing/ambiguous deltas. Reconcile all
   inquiry recipient/file grants, Support consent, case memberships, provider ownership,
   team access, account suspension and holds, not just assistant tombstones. Never
   infer current authorization from an old successful receipt. Safely invalidate old
   sessions/links as required by the incident plan; downloaded copies cannot be recalled.
7. With the gate blocked, call service-only `document_deletion_reconcile()` and process
   eligible assistant tombstones through the existing bounded cleanup mechanism.
   Verify actual API absence and metadata absence; respect holds/backoff/exhaustion.
   Inquiry/provider/account purge remains outside this queue and requires approved
   category-specific treatment. Reconciliation is not a complete delta importer.
8. Exercise actual private Storage access and application proxies with owner,
   authorized recipient, revoked recipient, outsider, suspended provider and ordinary
   staff. Direct read/signing must remain denied. Clean legitimate object hash survives;
   deleted, missing, mismatched, pending and quarantined objects remain inaccessible.
   Check missing/blocked gate denial, audit history, retry idempotency and interrupted
   reconciliation. Record DB restore duration and object restore plus reconciliation
   duration separately, failures, counts/hashes and final permitted/denied results.
9. Obtain the named approval, reopen only the isolated QA service and verify with
   monitoring. Production cutover needs separate approval, approved objectives,
   actual restore evidence and current authoritative restriction ledger. Keep old
   system isolated/rollback available without reviving revoked access. Stop and
   leave the gate closed when any required evidence is missing.

## Owner activation checklist

- [x] Verify actual Supabase subscription/compute, backup entitlement and existing
  member role/MFA in the signed-in dashboard: Free/Nano, managed backups excluded,
  one Owner with MFA disabled. S3 enabled with no access keys.
- [ ] Owner completes MFA and recovery-code setup, approves operator separation,
  and verifies actual restoration permission/audit through the approved rehearsal.
- [ ] If absent/insufficient, explicitly approve paid plan/compute/PITR costs, or approve
  independently hosted export strategy and operating cost. No purchase is authorized.
- [ ] Approve backup data destination/region, worker host, account/IAM, credentials,
  encryption/key recovery, holds/retention and independent latest-restriction capture.
- [ ] Approve isolated Supabase target and disposable fixture scope; authorize operators.
- [ ] Approve RPO/RTO, maintenance window, cadence, retention, restore/cutover approvers,
  named owner/deputy, alert channel and escalation procedure.
- [ ] Obtain genuine completed DB/object snapshot, tested restore/delta reconciliation,
  policy/tenant/scan/deletion checks and actual failure-alert acknowledgement.

Until these are satisfied: **production recovery assurance and provider pilot NO-GO**.
The release evidence report records exact test attempts and deployment separately.

## Release validation and limitations

No application code, RLS, migration, expiry schedule, billing or hosted backup setting
was changed. Added only this runbook, links from existing safety/lifecycle reports and
the read-only operator SQL audit. No existing runtime defect was reproduced requiring
a new behavioral regression; existing consent/deletion/scanner/recovery tests were run.

- Targeted document safety: 138 passed across four files. An earlier filter selected
  three existing files and passed 127 tests; it omitted the cleanup API file, so the
  corrected four-file run is the relevant result.
- Full suite: 1,078 passed, 45 opt-in skipped; 34 files passed, 12 skipped.
- Fresh isolated PostgreSQL install/seed, 22 SQL validation scripts, chronological
  Operations migration reapplication and provider-network rerun: passed on attempt 3.
  Attempts 1 and 2 stopped at enforced disposable QA name guards (visitor, then
  package); neither was a complete pass. No guard was relaxed.
- Lint: zero errors, one pre-existing scanner-engine warning. TypeScript and production
  webpack build passed. Secret audit: 534 repository files / 103 browser assets clean.
- Hosted read-only public/privacy gate: 39 passed. Hosted operator audit: all nine
  prerequisites true on the corrected query. Initial audit matched the wrong textual
  form of the reconciliation guard; it returned one false check. Source inspection
  and existing behavior established a harness error, then the predicate was corrected.
- Supplemental restore: real `pg_dump`/`pg_restore` on loopback PostgreSQL 18.1 with
  three real local filesystem object snapshots; one tombstoned object removed after
  replay, revoked sharing/quarantine/holds/tenant/RLS/missing-gate checks passed.
  Dump: 853,935 bytes / 509 ms; restore plus reconciliation: 6,357 ms. Scan verdicts
  were contract fixtures. This is **not** production PostgreSQL 17.6 or a genuine
  Supabase Storage API restore, and does not pass the required hosted object gate.

No live patients, provider responses, external communications or production data
restoration were used. Backup activation, hosted object restore, independent alerts,
approved retention and RPO/RTO remain BLOCKED after this documentation release.

Signed-in follow-up verified plan/compute/backup entitlement, sole Owner membership,
disabled MFA and absence of S3 keys directly in Dashboard. These close the former
subscription-visibility gap; they do not activate a backup or satisfy operator
separation. No paid upgrade or persistent credential creation was authorized. The
owner must choose an approved independent backup path or review paid DB protection;
both paths still require separate Storage backup and a genuine isolated restore.
