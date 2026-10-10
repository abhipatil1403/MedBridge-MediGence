# Data retention, explicit deletion and restoration

Assessment: 10 October 2026; starting release `9dae6c4`. **Control NO-GO; provider
pilot NO-GO.** The owner confirmed there is no approved retention/hold policy or
RPO/RTO. No automatic expiry, organization purge, account purge or backup-erasure
claim is introduced. Read with [the safety assessment](PRODUCTION_SAFETY_AND_PROVIDER_PILOT.md)
and [scanner setup](DOCUMENT_SECURITY_AND_SCANNER_SETUP.md).

## Inventory and policy decisions

Production metadata inspection found 87 application/private tables and 219 foreign
keys before this migration. It read schema, grants, bucket counts and categorical
scan state only, without retrieving patient content. Both private document buckets
contained zero objects and the scan queue was empty. Counts are a dated observation.

Every period below marked pending needs the responsible organization/privacy owner
to approve its purpose, clock, period, holds, deletion approver and backup treatment.
No blanket period follows from the local exercise or this document.

| Category / tables | Owner, purpose and dependencies | Current rule / clock | Authorized action and expiry / limitations |
|---|---|---|---|
| Auth users, profiles, portal accounts, roles | Individual and platform; identity, sessions, access, references from business/audit tables | Retention pending; account closure clock undecided | Staff access revocation/deactivation exists. No new account erasure. Some Auth/profile FKs cascade while others restrict; broad deletion could destroy evidence or fail. Privacy owner must approve an account procedure. |
| Cases, case members, consents, case status history | Patient; scoped care preferences and evidence of authorization | Retention pending; case closure/consent withdrawal clock undecided | Consent revocation stops future authorized use; it is not erasure. Patient/staff scope and immutable history preserved; no cascading purge. Case holds/purge are pending. |
| Inquiries: support cases, messages, events, tasks, document requests, provider consents, document grants, operation receipts, message reads | Patient plus approved recipient organization/assigned Support; reviewed inquiry, response attribution, retries and consent evidence | Retention pending; resolution/withdrawal clocks undecided | Patient withdraws consent or documents through existing commands. Bytes/history remain; no claim of physical deletion. Multi-table legal/operational holds and approved purge remain pending. Genuine response evidence is retained. |
| Assistant document workspaces, coordination audit and private care objects | Patient; explicit administrative checklist, versions and confirmed package | Existing owner-selected removal; triggered by explicit user action. No automatic expiry | Removal now commits a protected cleanup job with metadata removal, retires scan authorization and confirms Storage absence before completion. Replaced files remain until explicitly removed. Filename/hash/checklist snapshots in existing coordination audits are retained; minimizing/redacting those historical snapshots needs approved evidence rules. |
| Legacy case documents and recovery documents | Patient; consented metadata and care coordination | Retention pending; document withdrawal/case closure clocks undecided | Existing scoped access plus scan gate; no new blanket physical purge. The assistant deletion job does not pretend to cover these records. |
| Provider documents, submissions, records/revisions, verification runs/checks, section/field reviews, reference claims, ownership and organization verification | Provider and authorized Admin/reviewer; identity, publication and provenance | Retention pending; archive/supersession/authority withdrawal clocks undecided | Archive and authority suspension exist; revision references and audit FKs prevent casual erasure. Physical purge, orphan reconciliation and hold coverage outside registered removal identities remain pending. |
| Document security jobs, deletion jobs, registered-identity holds | Platform security and authorized owner/Admin; immutable object identity, verdict, tombstone, leased recovery | No automatic expiry. Explicit removal initiates cleanup. Hold begins on confirmed Super Admin action and ends only on explicit authorized release | Service-only bounded cleanup; owner-scoped request; Super Admin recovery of already authorized jobs. A hold blocks removal and consumes no retry. No override to clean. Holds after an attempt starts are refused because in-flight Storage deletion cannot be recalled. No broad organizational hold system is claimed. |
| Conversations/messages, agent tasks/runs/actions/approvals/outputs, workflows/runs/steps, care plans/tasks | Individual; provenance, partial results, replay and approval evidence | Retention pending; conversation/task completion clocks undecided | Existing authenticated isolation. No bulk erasure of executions/approvals, no cascade of unrelated users. User-pasted sensitive text may be present; no approved content-retention period exists. |
| Temporary assistant visitors and rate limits; exchange-rate cache | Visitor/platform; temporary session and abuse protection, public currency retrieval | Existing technical session TTL: 24 hours; rate window one day. Cleanup is opportunistic during visitor operations, not a newly approved enterprise retention rule | Existing finish/delete and expiry checks continue. No independent scheduled purge or backup expiry is proven. Cache deletion/policy pending; public conversion data is not patient content. |
| Saved items, recent searches, recovery journeys/tasks/events/support links | Individual; personal progress and recovery coordination | Retention pending; removal/completion clocks undecided | Existing owner actions and withdrawal remain scoped. No new cross-table purge or automatic erasure of history. |
| Published/reference catalog, source records, drafts/checklists, organization/team/invite/messages/settings | Provider/platform; reviewed public reference facts, ownership and governance | Retention pending; unpublish/archive/invite expiry clocks vary by existing workflow | Existing reviewed publication and archival continue. Public facts can retain private source/reviewer details; publication is not consent to expose internal history or delete provenance. |
| Audit events, portal notifications, Operations incidents/recovery attempts | Platform and scoped staff; accountability, in-app notice and actual operational results | Retention pending; incident closure/delivery/audit event clocks undecided | Lifecycle audit adds actor/category/state/timestamps, not file bytes, filenames, paths, signed URLs or checksums. It does not redact older audit snapshots. No expiry or fake incident/delivery evidence. |
| External copies and backups | Supabase DB/Auth/Storage; Vercel deployment/logs; Cloudflare Workers AI requests; recipients' downloaded copies | Provider/project configuration and organization approval pending | AI may receive user text and authorized context, never uploaded file bytes from this control. Third-party request/log retention, caches, downloaded copies and backup rotation need independent decisions/evidence. No malware sample/document is sent to a public scanner. No new external communications. |

## Explicit assistant-file deletion

`20261010130000_document_deletion_recovery.sql` adds protected jobs/holds and a restore
gate. The existing authenticated route still binds the exact tool/input to a user
confirmation; the model cannot authorize removal. Server workspace ownership,
conversation scope and active-account checks remain in place. The metadata-save
trigger locks removal and cleanup intent in one transaction; a hold rolls it back.
Legacy removed metadata can register its persisted immutable identity **for retirement
only**, never for a scan verdict. Failed uploads/metadata commits can enqueue only an
unambiguous registered object under the same owner/workspace/random document ID.

The server claims a two-minute lease, removes only the job's canonical object, asks
Storage for object info, and acknowledges completion only on explicit absence plus
absence of the `storage.objects` row. A remove response, timeout, access denial or
missing ACK is not completion. Three attempts with persisted backoff bound retries;
expired final leases remain `cleanup_failed`. Jobs and categorical audit survive
failure/restart. Exact request/ACK replay and repeated owner removal do not duplicate
the persisted removal revision or cleanup audit. Concurrent workers cannot own the
same live lease. Exhaustion requires named operator investigation and separately
reviewed recovery; there is no automatic attempt reset or infinite retry loop.

States: `queued`, `deleting`, `cleanup_failed`, `held`, `deleted`. `deleted` means the
specified live object passed the absence checks at that time, **not** account erasure,
metadata deletion, immediate physical media erasure, recipient-copy recall or backup
erasure. Restored copies must be reconciled before service resumes. Replaced versions,
inquiry withdrawals and provider archives remain separate lifecycle actions.

The existing UI retains “Retry stored-file removal” for removed history. Failed tool
and recovery API responses remain failures with safe, actionable text; completion is
returned from persisted state. Matching/preparation/download/preview/AI metadata and
sharing retain their original consent/tenant checks plus the scan boundary. Every
deletion tombstone blocks clean access even if a stale verdict is restored. Ordinary
Storage SELECT remains denied for both buckets, including clean files, so clients
cannot create new download/signing bypasses.

Super Admin operations, using the normal authenticated Admin session:

- `GET /api/portals/document-cleanup?portal=admin`: at most 100 categorical rows,
  without storage paths, filenames, actor IDs or payloads.
- `POST` same URL with `{ "id": "<cleanup job UUID>", "confirmed": true }`:
  retries an existing owner-authorized request only. Held/backoff/active/exhausted
  jobs produce a failure; a completed job returns its persisted completion.
- Existing authenticated Supabase client `rpc('document_retention_hold',
  {p_security:<registered security job UUID>,p_active:true,
  p_category:'legal_review'|'operational_review'|'security_incident',p_confirmed:true})`:
  only an active Super Admin can apply/release a registered assistant-workspace hold. Release uses `p_active:false` after an
  authorized hold review. Staff/patients with no assigned role are explicitly denied,
  including direct scanner-review RPC calls. These controls do not create an approved
  legal policy, protect unregistered data, or guarantee preservation after deletion starts.

No application endpoint mints a signed file URL. Previously issued links, CDN copies
and already downloaded content have separate semantics. Deleting the object prevents
future origin access, but do not promise instantaneous CDN invalidation or copied-byte
recall. [Supabase signed downloads](https://supabase.com/docs/guides/storage/serving/downloads)
and [CDN documentation](https://supabase.com/docs/guides/storage/cdn/smart-cdn) describe
platform behavior; they are not evidence that a historical link has been erased.

## Actual production recovery configuration

Read-only official CLI `supabase@2.120.0 backups list --project-ref <project>` returned:
no listed backups, PITR disabled, null earliest/latest physical backup dates, WAL-G
flag enabled. **The WAL-G flag alone is not recovery evidence.** There is no verified
backup age, approved backup retention, independently configured object backup, latest
consent/deletion ledger, RPO or RTO. No production restore/download was attempted.
The CLI metadata query verified latest pre-release migration `20261010120000`, private
buckets and no stored documents. The temporary CLI version was invoked through npx;
the global install/project dependencies were not upgraded.

Database backups contain Storage metadata, not object bytes; a separate object backup
is necessary. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).
Restore/clone does not by itself recreate all keys, Auth/platform settings and object
content. [Supabase clone documentation](https://supabase.com/docs/guides/platform/clone-project).
Production restore assurance is **BLOCKED**, even though the local procedure passed.

## Isolated restore exercise and evidence boundaries

Opt-in `tests/document-restore-local.test.ts` accepts only guarded loopback QA database
names, no password/hosted URL, and a dedicated QA artifact directory. It clones a
migrated synthetic fixture DB into a disposable source, runs genuine PostgreSQL
`pg_dump -Fc`, creates a different target, and runs actual `pg_restore --exit-on-error`.
Three harmless PDF objects are copied into a separate filesystem backup and genuinely
copied back to the target object adapter. This is **local filesystem Storage transport**,
not hosted Supabase object recovery. Scanner states are explicitly labeled SQL
contract fixtures; this exercise makes no new malware-detection claim.

After the snapshot, actual owner removal deletes one object and actual consent
revocation removes Support access. A separate QA delta file retains the latest
workspace, tombstone and revocation. Restoration deliberately brings stale data back,
then the protected gate blocks file/case access while deltas are replayed. Reconciliation
retires restored deleted identities, requeues genuinely restored objects, and requires
confirmed removal. After the isolated gate opens: revoked Support and other-user
access remain denied; the deleted and quarantined files remain blocked; hold and
legitimate clean-file hash survive; ordinary direct Storage/signing remains denied.
No source/target is production; no patient data or production backup was copied.

`document_deletion_reconcile()` is service-only and refuses an open recovery gate.
It cannot recover missing post-snapshot requests by itself, restore object bytes, or
invent a missing consent delta. Production has no independent delta preservation
configured. Do not reopen service based solely on its return value.

## Proposed operator restore procedure (requires approval)

1. Name incident owner and approving privacy/operations owners. Approve environment,
   backup access, scope, RPO/RTO, keys, retention/holds and who may reopen service.
   Verify actual DB/object backup availability, timestamp, provenance and integrity;
   confirm an independently protected current deletion/consent/role/ownership ledger.
   If any required evidence is unavailable, stop with service isolated.
2. Block **all** application/API traffic and background workers. Rotate/revoke affected
   credentials as the incident requires; do not put keys in SQL artifacts/logs. The
   database gate alone does not isolate Auth, workspace metadata or all platform reads.
3. Restore DB and object bytes into the approved isolated target. Recreate audited
   platform/Auth/storage settings, private buckets, roles/RLS/grants and secret mappings.
   Before exposing routes, set `private.document_recovery_gate.blocked=true` through
   trusted database/operator access. A dump normally contains the prior gate value;
   restoring it does **not** automatically enter maintenance mode.
4. Verify versions/FKs/counts/hashes and scan-state identity. Keep quarantined,
   unregistered and pending files blocked. Replay the independently preserved **latest**
   deletions, consent revocations, suspension/ownership changes and audit evidence with
   an approved import that preserves UUIDs/ordering and does not expand grants. This
   release demonstrates QA replay, not a production delta exporter/importer.
5. Run service-only `document_deletion_reconcile()` while blocked. Process eligible
   tombstones through the cleanup helper/API; inspect failures/holds instead of
   overriding them. Reconcile every DB-to-object reference and orphan under approved
   rules, including inquiry/provider categories outside the new assistant queue. Missing
   bytes are unavailable, never clean. Do not reset quarantine to make tests pass.
6. Run DB/RLS/security/consent/tenant/privacy checks and compare actual deleted objects
   and latest grants. Record measured recovery point/time separately from approved
   targets. Require independent evidence of scanner, monitoring, incident coverage and
   required notification behavior. Preserve the dated report without sensitive payloads.
7. Obtain the named release decision, clear the gate in trusted DB access, and restore
   traffic/workers gradually with genuine monitoring and rollback ownership. A previous
   signed link or recipient copy is not revoked merely because a fresh test is denied.

## Acceptance assessment

| Control | Status |
|---|---|
| Existing explicit assistant removal: authorization, atomic intent, holds, bounded recovery, categorical audit, truthful failure | PASS in unit/API and isolated PostgreSQL/Storage-adapter tests |
| Scan/quarantine, direct signing denial and post-restore deletion/consent enforcement | PASS in isolated contracts; prior genuine local ClamAV evidence preserved |
| Genuine isolated DB dump/restore plus separately restored harmless object files | PASS; measured local results in release artifacts, not approved RPO/RTO |
| Approved retention schedules, broad holds, inquiry/provider/account purge, historical metadata minimization and backup expiry | BLOCKED: no approved policy |
| Production DB/Storage backup coverage, independent change ledger and hosted restore rehearsal | BLOCKED: no available backup evidence/Storage mechanism or approved targets |
| Production scanner host, independent monitoring/delivery, named coverage and real provider acceptance | BLOCKED: separate pending dependencies |

Exact attempts, final counts, deployed SHA and cleanup/configuration evidence are
recorded in the release report. **NO-GO for production recovery assurance and provider pilot.**
