# Document security, quarantine and scanner setup

Assessment: 10 October 2026. Runtime baseline: `a87b2df`.
**Production scanning activation: BLOCKED. No approved worker host exists.**
**Provider pilot: NO-GO.** The scanner integration is implemented and genuinely tested
in isolated QA. That is not evidence of production scanning or provider acceptance.

## Existing gaps and enforcement

Previously, uploads were validated by size, extension, MIME and magic bytes, but no
malware verdict existed. Private owner Storage SELECT policies also permitted a user
to request Storage downloads/signing directly. Application authorization alone could
not enforce quarantine on that alternative path.

`20261010120000_document_security.sql` adds a separate, immutable file identity and
service-controlled security queue for `care-documents` and `provider-documents`.
The checksum, length and MIME belong to that identity, not owner-editable JSON.
New files are registered before upload and made claimable after Storage persistence.
Files without a registered successful verdict are blocked, including legacy files.

| Control | Evidence and current assessment |
|---|---|
| Persisted lifecycle | PASS in QA: pending_scan → scanning → clean / quarantined / scan_failed. Missing, stale, malformed, unavailable or inconclusive evidence never becomes clean. |
| Genuine engine | PASS in isolated QA: ClamAV 1.4.6, official FreshClam signatures 28149; harmless PDF accepted and EICAR embedded in a valid PDF quarantined by the actual engine. Production configuration and genuine hosted scan: BLOCKED. |
| Downloads | PASS in QA: inquiry, assistant, provider evidence and legacy Support proxies require existing scoped authorization plus clean verdict, exact byte size/hash and a final clean check after buffering. Attachment/no-store responses expose no Storage URL. |
| Direct Storage / new signed URLs | PASS at SQL/RLS boundary: a restrictive SELECT policy rejects ordinary anon/authenticated reads and signing of both document buckets, even when clean. Service-role scanner/server access remains privileged. Hosted policy checks are recorded in the release report. |
| Historical signed URLs | BLOCKED until investigated: previously issued bearer links may remain usable until expiration. New policy does not prove historical-link revocation. Seek Supabase-supported revocation or approved object relocation/deletion if such links exist; never bulk move real documents without authorization. |
| Sharing and consent | PASS in QA: share/review commands require clean; original current consent, recipient/file grant, provider ownership and staff assignment checks remain. Withdrawal/revocation tests retain the original access denials. No scan verdict supplies consent. |
| AI | PASS for current architecture: matching/preparation rejects unscanned files; case document metadata SELECT requires clean in addition to case scope and the application's existing processing-consent check. No extraction/OCR or raw document content is sent to the model. |
| Worker authority | PASS in QA: dedicated server credential and live lease required; ordinary sessions cannot read scanner payloads or submit results. Reports bind to stored bytes and current lease. Browser users cannot edit scan states or call the privileged RPCs. |
| Recovery | PASS in QA: two-minute leases, three attempts, persisted 30/60/120-second backoff, expired final lease → blocked failure. Identical result acknowledgement preserves one audit. Explicit Super Admin retry queues a new real scan; it cannot mark clean. |
| Security audit | PASS in QA: event records contain opaque job ID, state and categorical failure only. No names, paths, checksum, signatures, body, bearer URL or token in scanner logs/audit. Existing inquiry/consent audit remains intact. |
| Retention / backup / deletion | PARTIAL: existing explicit removal retires the verdict before deletion; failed object cleanup stays blocked. No new retention scheduler, backup purge or erasure guarantee exists. Approved retention, quarantine expiry, failed-cleanup and restore procedures remain BLOCKED. |

The engine credential is a trusted security boundary. A party possessing it can fetch
leased private payloads and report a verdict; protect and rotate it as a server secret.
Checksum verification prevents substitution, not a compromised scanner. Malware
scanning does not guarantee absence of malware, validate clinical content or certify
regulatory compliance.

## Production configuration: do not enable yet

Vercel cannot host the persistent ClamAV daemon. ClamAV is free software; an approved
private machine, adequate RAM/disk and an operator are still required. A private Linux
host with Node.js and ClamAV is the supported deployment shape. The worker polls
MedBridge outbound over HTTPS. Do not expose clamd TCP to the internet and do not give
the worker a Supabase service key or patient/staff credentials.

1. Obtain approval for a named host, operator, patient-data processing location,
   incident procedure and temporary-file/signature-update handling. No real patient
   document may be sent to an unapproved host.
2. Install the host's supported ClamAV/clamd/FreshClam packages and Node.js. Pin and
   record the actual engine version. Run FreshClam and verify successful database
   validation, then keep its update service running. An empty database or signatures
   older than 48 hours cause MedBridge to block results.
3. Configure clamd with a private Unix socket accessible only to the worker account
   and ClamAV account (or `TCPAddr 127.0.0.1` plus a private loopback port). The socket
   transport scans in memory; it avoids writing patient bytes to worker disk.
   Use these limits alongside the distribution's required database/user/socket settings:

   ```text
   StreamMaxLength 3M
   MaxFileSize 3M
   MaxScanSize 20M
   MaxRecursion 16
   AlertExceedsMax yes
   AlertEncrypted yes
   MaxThreads 2
   LogVerbose no
   ```

   Limit host access and logging; ClamAV itself may report signatures, so restrict its
   logs and avoid attaching those logs to patient records. Monitor FreshClam updates,
   worker heartbeat and blocked queue depth. No independent monitor is configured
   by this repository.
4. Deploy this repository's `scripts/document-scanner/engine.mjs` and `worker.mjs`
   together from the verified release. They require only Node built-ins. Run the worker
   under a dedicated unprivileged service account and a supervisor that restarts on
   interruption. Allow outbound HTTPS only to the approved MedBridge origin and
   FreshClam mirrors as required. Keep token files mode 0600 and outside Git/logs.
5. Generate a random token with at least 32 bytes of entropy locally. Set these
   **server-side** Vercel variables and the matching worker secret. Never use a public
   framework prefix or put actual credentials into this document:

   | Location | Variable | Value |
   |---|---|---|
   | Vercel server | `MEDBRIDGE_DOCUMENT_SCANNER_TOKEN` | Generated secret |
   | Vercel server | `MEDBRIDGE_DOCUMENT_SCANNER_ENABLED` | Keep `false` until approved testing is authorized |
   | Worker only | `MEDBRIDGE_DOCUMENT_SCANNER_TOKEN` | Same secret |
   | Worker only | `MEDBRIDGE_SCANNER_ORIGIN` | Approved bare HTTPS production origin |
   | Worker only | `CLAMD_SOCKET` | Private local Unix socket path |
   | Worker alternative | `CLAMD_PORT` | Private loopback port; host is fixed to 127.0.0.1 |

   CLI fallback is supported with `CLAMSCAN_PATH` and `CLAMAV_DATABASE_DIR`, but
   writes an opaque payload in a private temporary directory and deletes it in
   `finally`. Prefer INSTREAM. Crash cleanup and backup handling still need host policy.
6. First test the actual deployment in an isolated MedBridge/Storage environment with
   harmless fixtures and the genuine engine. Enable that environment's scanner flag,
   run `node scripts/document-scanner/worker.mjs --once`, and inspect the persisted
   verdict and authenticated access. Confirm clean, quarantine, outage, consent
   revocation, unauthorized signing and recovery. A worker exit alone is insufficient.
7. After host approval and an authorized production acceptance plan, configure both
   secrets, set the production flag to `true`, redeploy Vercel, and supervise
   `node scripts/document-scanner/worker.mjs`. A genuine, authorized hosted scan must
   pass before document-bearing pilot activity is considered. No such evidence exists
   at this release. Disabling the flag blocks new claims/results; previously clean files
   remain clean until retired/requeued. Requeue affected jobs when invalidating evidence.

## Authorized review and recovery

Super Admin can inspect categorical metadata through
`GET /api/portals/document-security?portal=admin` using their normal authenticated
session. It exposes no payload/download URL. An explicit
`POST` with `{ "id": "<job UUID>", "confirmed": true }` requests a retry of a ready
quarantined/failed job. Removed files and active/pending jobs cannot be retried.
There is no override-to-clean control or quarantine download for ordinary users.
Do not blindly retry a detection: investigate on the approved security host or request
a legitimate replacement. Keep incident ownership and evidence handling scoped.

If a worker crashes, wait for lease expiration. Claim recovery is transactional and
bounded; do not reset attempts repeatedly to simulate success. A mismatched hash,
expired lease or malformed result is rejected with a generic response. Only an exact
acknowledgement retry is idempotent. Recover interrupted upload metadata through the
existing upload flow; do not overwrite a registered object's immutable byte identity.
Legacy files require authorized resubmission or a separately reviewed registration
procedure. There is no automatic backfill or automatic transmission of historical
patient files to the new scanner.

## Evidence boundaries and validation

- Default tests use explicit doubles to verify failure contracts, never production
  malware detection. SQL positive permission fixtures have an isolated database guard
  and synthetic clean metadata; they are not engine evidence and must never run hosted.
- Opt-in `document-scanner-real.test.ts` runs actual ClamAV against a harmless PDF
  and the official harmless antivirus pattern. `document-scanner-pipeline-local.test.ts`
  uses real PostgreSQL/RLS, actual route handlers, an HTTP worker and genuine ClamAV;
  only Storage byte transport is an in-memory QA adapter. It verifies persisted clean
  and quarantine states, checksum delivery, acknowledgement replay and signing denial.
- Local Windows antivirus blocked a disk EICAR fixture; a PDF prefix plus the pattern
  did not detect. Those attempts were not passes. INSTREAM and a valid embedded-file
  PDF produced genuine detection. Host antivirus was not disabled.
- Exact attempt counts, deployment SHA, production policy evidence and remaining
  dependencies are in the release artifact report. No production fake document,
  clean verdict, provider response or external scan receipt was created.

Primary references: [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html),
[scanning limits](https://docs.clamav.net/manual/Usage/Scanning.html),
[signature management](https://docs.clamav.net/manual/Usage/SignatureManagement.html),
[Supabase access control](https://supabase.com/docs/guides/storage/security/access-control),
[signed downloads and revocation](https://supabase.com/docs/guides/storage/serving/downloads).

The real provider, authorized representative, consent rehearsal, Support/on-call,
independent alerts, retention/deletion approval and restore evidence remain required.
**NO-GO for the provider pilot.**
