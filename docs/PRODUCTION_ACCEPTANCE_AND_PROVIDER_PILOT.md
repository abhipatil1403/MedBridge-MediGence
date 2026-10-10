# Production acceptance and first provider pilot

Audit date: 10 October 2026. Baseline: `c9a0cf27a2629db76abfba417307e5a2c8bf11cf`.
Production origin: https://medbridge-medigence.vercel.app.

**NO-GO for a real-provider pilot.** The product owner confirmed that no provider is
committed. Production has one provider-submitted organization, zero organizations
marked approved, zero current ownership assignments, zero connected providers, zero
currently eligible provider responses and zero pilot attestations. Five hospitals,
five doctors and seven packages are publicly readable governed reference records;
their publication is not evidence of provider participation. Both document buckets
are private. A controlled technical release and isolated QA can proceed independently.

## Journey acceptance

“Passed in QA” below means actual commands and RLS against disposable PostgreSQL,
not a genuine provider or patient in production. Hosted tests use disposable private
sign-ins and existing public records; they submit no inquiry, upload no document and
create no provider, response, incident or simulated delivery. They do persist private
assistant runs and an actual measured, audited Admin health check.

| Step | Production result | Isolated QA / implementation evidence |
| --- | --- | --- |
| 1. Request service and location | Passed: deployed health-check/Mumbai request | Existing `/api/assistant`, compound intent and requirement extraction |
| 2. Search eligible records | Passed: registered hospital/package reads | Catalog repository, tool validation and public snapshot/RLS scripts |
| 3. Return evidence, comparisons and gaps | Passed: eligible IDs, original amounts/currencies, missing accommodation/transfer, empty surgical search and missing ordinal context | No synthetic match, fabricated price, availability, clinical winner or automatic booking |
| 4. Select and review an inquiry | Passed for server preparation; browser click-through remains a pilot rehearsal gate | Deployed selected hospital resolves to the existing review URL and `review_required`; published revision is required by the form and command |
| 5. Approve sharing | Blocked for a real pilot: no real participant; no production inquiry submitted by this audit | Passed in QA: reviewed Support consent, separate named-organization grant, separate document/recipient/purpose consent |
| 6. Persist and route | Blocked for real-provider routing: no approved connected owner | Passed in QA: exact listing, frozen revision and canonical organization; no-owner state stays honest |
| 7. Provider reads and genuinely responds | Blocked: no committed provider or authorized representative | Passed only with isolated QA actors using actual authority, membership, consent and response commands |
| 8. Patient sees status and response | Blocked for a genuine response | Passed in QA: persisted response, actual sender, status, event and deduplicated in-app notification |
| 9. Support investigates/reconciles | Passed for production authorization and bounded queue; no real blocked inquiry was modified | Passed in QA: assigned scope, explicit escalation, receipt reconciliation, backoff, terminal failures and incident lifecycle |
| 10. Authorization/consent/audit | Passed for hosted read boundaries; full consequential production chain is blocked | Passed in QA: RLS, confirmations, immutable audits, duplicate prevention and immediate revocation |

This is not complete production journey acceptance. Steps 5–8 and the final human
rehearsal need genuine, authorized participants. A reference-only inquiry may reach
Support; the assistant must not describe that as delivery to an active provider.

## Security and recovery findings

- Server routes verify Supabase identity and current portal roles; changing a URL
  cannot grant staff or provider access. Private responses use `private, no-store`.
- Database guards enforce owner, assigned Support, current approved provider authority,
  canonical ownership, active membership and recipient-specific consent. Public reads
  exclude drafts, rejected/unpublished revisions, synthetic fixtures and private evidence.
- Case consent does not grant document access. Each file delivery rechecks authorization;
  storage paths and signed URLs are not public. Revoking one recipient preserves only
  independently granted access. The assistant gets scoped status/metadata, not file bytes
  or internal Support notes; inquiry status/preparation use the controlled existing path.
- Consequential commands use operation receipts and append-only events. Six additional
  SQL assertions verify that original response receipts cannot bypass revoked patient
  consent, suspended organizations or removed team members; denied writes leave no message.
  These checks passed without changing policies.
- Actual local persistence/recovery testing interrupts a saved registered read, injects
  a dependent failure, verifies two attempts, preserves hospital evidence, skips the
  dependent comparison and restores one output/message without another completed action.
  Production lost-response recovery returns the original run without another tool action.
- Telemetry is allowlisted categorical metadata; error/log projections do not contain
  patient prose, documents, tokens or raw stack traces. Tool activity is projected to
  compact persisted status. Hosting log access still needs operational access control.
- A QA cleanup gap was found in the package live script: it banned its disposable
  account without explicitly revoking its session or archiving its conversations.
  Cleanup now signs out before banning, disables the portal account, archives its
  private conversations and checks failures while retaining immutable audit history.
- The hosted airport-transfer run exposed duplicate counting: search and requirements
  returned the same five records, but the summary counted ten. The summary now uses
  the same unique, bounded findings as the cards. A regression failed before the fix
  and passes afterward. At that audit baseline, the original invalid array comparison
  proposal remained rejected without executing its service; the follow-up below fixes
  that separate argument defect.

No production authorization defect was reproduced in this audit. A hosted model follow-up
did produce `TOOL_INPUT_INVALID`: the run truthfully failed with `partially_completed`
activity and five preserved findings. The first package live gate stopped after 29
checks; this failure is retained as evidence, not converted to a pass. Model argument
reliability is an operational risk even with strict validation. This does not certify
every possible access path or replace the required real-provider rehearsal.

### Comparison argument follow-up (10 October 2026)

Starting baseline: `dc09686c691868fb9d9dc585cd6a418d57c657eb`.
Read-only inspection of both failed airport-transfer runs reproduced the same model
proposal: `compare_providers` received a bare array of the five returned public package
UUIDs, rather than the registered strict object `{ "recordIds": [ ... ] }`.
Both persisted calls had `TOOL_INPUT_INVALID` and no validated input. Schema rejection
was correct; the defect was model argument shape plus the lack of narrow compatibility
at the execution boundary. The harness surfaced a genuine failed step. The prior runs
and their five valid findings remain retained; neither has been rewritten as successful.

The registry still requires its original strict object schema. Before validating it,
the registered execution boundary wraps only an unambiguous, unique, one-to-ten UUID
array for `compare_providers`. It preserves every ID and its order. Empty, mixed,
oversized, duplicate or malformed inputs are rejected without executing comparison;
unknown/out-of-scope records still fail the existing scope and availability checks.
Extra object fields and constraints are never silently removed. Planning uses the same
adapter, and comparison now retains requirement evaluations and missing evidence.

Raw and validated inputs are retained in private execution state. Equivalent array and
object proposals share the existing cache key and persisted action hash. An actionable
`TOOL_INPUT_INVALID` observation lets the model correct an argument; existing tool,
failure and iteration budgets bound recovery. External/write authorization, confirmation
requirements and database policies are unchanged. No migration is required.

Verification attempts, including failed test assertions, are preserved in the release
report and command logs:

| Attempt | Exact result |
| --- | --- |
| Baseline strict rejection regression | 1 passed, 56 skipped; confirms the original array rejection |
| Targeted attempt 1 | 143 passed in 3 files |
| Targeted attempt 2 | 144 passed in 3 files, including the five-record transfer sequence |
| Targeted attempt 3, with real PostgreSQL | 145 passed, 1 failed: new UI assertion expected the wrong existing partial-status label |
| Targeted attempt 4, with real PostgreSQL | 145 passed, 1 failed: new UI assertion expected `Failed` instead of the existing `Could not complete` label |
| Targeted attempt 5, corrected assertions | 146 passed in 4 files, including both actual PostgreSQL tests |
| First full suite | 1,009 passed, 40 skipped |
| Final full suite, with additional opt-in PostgreSQL test | 1,009 passed, 41 skipped; PostgreSQL opt-in tests separately passed above |
| Lint and TypeScript | Both initial and final runs passed |
| Production webpack build | Passed |
| Fresh database/security gate | All 20 SQL scripts passed, plus migration reapplication and network lifecycle rerun |
| Configured-secret/browser scan | Passed; no configured private value in tracked source or browser JavaScript |
| Package live attempt 1, local production build | 47 checks passed; disposable account cleanup passed |
| Package live attempt 2, tightened persisted-argument check | 47 checks passed; disposable account cleanup passed; no comparison requested on the transfer turn |

The local live airport-transfer turn completed with five preserved package findings and
`partially_completed` activity because transfer evidence was unknown. It requested no
comparison tool on that turn; this is explicitly reported by the sanitized diagnostic.
It is not claimed as live execution of the adapter. Forced bare-list execution, malformed
input correction/exhaustion, constraint retention, contextual references and truthful
failure projection pass the regressions. Actual PostgreSQL verifies one comparison
action for equivalent proposals and one restored output/message after a lost response.
The latest production package gate and exact deployed SHA must be checked after push;
their results belong in the final release report, not inferred from local success.

**Provider pilot remains NO-GO.** These checks do not establish a real partnership,
consent, operational coverage, document-handling approval, independent monitoring,
external delivery, backup/restore or a genuine provider response.

## Measured capabilities and pending dependencies

| Capability | Verified state | Required operational action |
| --- | --- | --- |
| Public liveness | Actual hosted HTTP 200 | Independent monitor and authorized alert recipient; an app cannot alert through its own outage |
| Private readiness | Admin-only actual DB probe; 202 ms measured probe in this audit | Operator must review failures; cached configuration is not continuous uptime evidence |
| AI | Real deployed catalog workflows and one live Cloudflare structured response | Model availability varies; keep honest partial/failure states and human escalation |
| Notifications | Atomic persisted in-app records, deduplication tested in QA | Agree manual portal-check coverage during a pilot |
| Coordination email/SMS and failure alerts | `not_configured`; no delivery evidence (authentication email links are separate) | Authorized transport/sender/recipient test if required; no outreach is authorized by this audit |
| Incidents and recovery | Existing Admin lifecycle and receipt checks pass in QA | Name an on-call owner and deputy; reconcile an uncertain commit before any repeat submission |
| File safety | Private buckets, file type/signature/size and recipient checks | Malware scanning is absent; prohibit patient-document uploads in the initial pilot until approved controls are in place |
| Retention and restore | Immutable history retained; no automatic purge introduced | Approve retention policy and verify backup/restore capability and recovery objectives; no production restore was exercised |

## Pilot checklist and owners

Role ownership below is a requirement, not a claim that a person has accepted a duty.
The existing Super Admin is `abhipatil1403@gmail.com`; Support, on-call and provider
representative assignments remain to be agreed.

| Gate | Accountable owner | Evidence required before pilot start |
| --- | --- | --- |
| Real partner | Product owner + provider representative | Committed organization, representative sign-in email, scope and dates; currently missing |
| Authority | Admin reviewer independent of provider | Current evidence, official-channel contact confirmation, explicit reviewed authority decision; registration alone is insufficient |
| Team | Provider admin | Real email-bound invite acceptance, least-privilege roles, tested member removal; no password/token sharing |
| Listing ownership | Admin | Exact canonical hospital binding and separately scoped doctor/package ownership, no conflicting owner; current readiness says connected |
| Publication | Provider + Admin reviewer | Evidence-backed frozen revision, section/field review and explicit publication; prices are references, not quotes |
| Patient participation | Participant + privacy/operations lead | Explicit informed approval of exact reviewed inquiry, named recipient and purpose; no real patient data in QA |
| Documents | Privacy/operations lead | Initially disabled by pilot procedure; enable only after approved malware handling, retention and document-specific consent rehearsal |
| Routing/response | Assigned Support + authorized provider | Real inquiry ID and listing revision, real attributable response, actual patient-visible status/event and in-app notification |
| Coverage | Support manager + named on-call/deputy | Written coverage hours, escalation contact, handover and response target accepted by provider; current default thresholds are not an SLA |
| Monitoring | Hosting/operator owner | Independent public monitor, authorized outage alert and successful alert test; private readiness credential design approved separately |
| Communication | Operations lead | In-app-only protocol with manual checks explicitly accepted, or authorized successful email/SMS delivery and failure-alert tests if required |
| Release/restore | Release owner | Exact deployed SHA, clean tree, passing gates, known rollback target, backup/restore evidence and approved recovery objectives |
| Final decision | Product owner + Admin + provider representative | All gates signed off and no open critical/high security or routing incident |

Code can enforce authorization, scope, revision, consent, idempotency, audit and truthful
states. It cannot supply a partnership, official contact confirmation, real credentials,
human availability, privacy approval, independent alert ownership or genuine response.

### Human rehearsal and acceptance criteria

1. Real participants sign in through their own email links. Repeat steps 1–10 through
   Customer, Assistant, Provider, Support and Admin interfaces; inspect the exact saved
   IDs/revision/events. The representative enters an administrative response personally.
2. Verify a reference-only or empty result does not promise provider participation;
   missing prices/inclusions stay unknown and no appointment or payment is claimed.
3. Patient reviews exact shared fields before submission. Support consent alone cannot
   expose the request to Provider. Verify a nonmember/other organization cannot access it.
4. With the participant's express authorization, rehearse consent withdrawal and member
   suspension; subsequent reads and response attempts must fail. Revoke documents only
   if document handling has separately passed its gate. Do not use real records for
   destructive/failure injection; keep interruption/timeout simulations in isolated QA.
5. Verify one inquiry, one response and one event/notification per recipient on a lost
   response/retry. Support reconciles original operation IDs; never replays consent,
   sends messages, or invents successful delivery to clear an error.
6. Check the participant sees the actual response and can stop participation. Record
   authorized Admin pilot attestation only after reviewing genuine evidence.

Pilot scope must be signed off before starting: one organization, named authorized
participants, administrative coordination only, defined coverage window and a bounded
inquiry count. No autonomous clinical advice, bookings, payments or external purchases.

### Stop, rollback and exit

- Stop new pilot inquiries on cross-user/org exposure, revoked-consent access, duplicate
  consequential writes, incorrect routing, fabricated status, lost audit or unavailable
  coverage/monitoring. Escalate immediately to the named operator and product owner.
- Admin suspends the organization or revokes ownership/member access as appropriate;
  the patient controls withdrawal of consent. Preserve historical responses and audit.
  Support informs only authorized participants through the agreed channel. Do not delete
  history or use the server key to bypass policy.
- These acceptance releases add no migration; runtime fixes correct the displayed record count,
  normalize unambiguous comparison lists and preserve requirement evidence. Revert the release commit
  through normal Git deployment if needed; do not roll back the production schema or
  replay uncertain operations. Infrastructure/data incidents follow the approved restore plan.
- Exit successfully only after the agreed cohort/window completes with genuine responses,
  accurate patient-visible states, no unresolved critical/high incidents, honored withdrawals,
  completed handover and written acceptance from provider, Support and product owner.
  Otherwise pause or end the pilot and revoke its active access through existing commands.

## Reproducible technical gates

Baseline audit default suite: **993 passed, 40 opt-in skipped**; two additional runtime regressions
cover the observed invalid comparison proposal and duplicated summary count. Separately: **one live Cloudflare test**
and **one actual local PostgreSQL recovery test** passed. Fresh migrations/seed and all
**20 SQL validation scripts** passed, including operation migration reapplication;
the two changed SQL scripts passed again with six new replay/revocation assertions.
Lint, TypeScript and the production webpack build passed.

Hosted gates: **39 public catalog/privacy**, **24 Operations** and **19 agent workflows**
passed. The package assistant gate additionally checks original prices, comparisons,
missing evidence, unsupported treatments and missing conversational context; its final
result and deployed release SHA are recorded in the release report.

Run hosted gates only against existing catalog records with explicit opt-in:
`validate-public-catalog-live.mjs`, `validate-production-operations-live.mjs`,
`validate-agentic-workflows-live.mjs` and `validate-package-assistant-live.mjs`.
Use ignored environment configuration and never log token/password values. Do not run
the production-writing patient inquiry script for this acceptance task. Positive
provider/inquiry fixtures and failure injection belong only in disposable loopback
databases whose names satisfy each SQL script's isolation guard. Independent monitoring,
external delivery, restore rehearsal and the genuine provider journey remain unverified.
