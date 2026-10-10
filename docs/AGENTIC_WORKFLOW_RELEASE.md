# Agentic workflow orchestration — 10 October 2026

## Audit and reuse

Baseline: main `f8584cd`, including production operations `f17f40b`.
This release extends the existing runtime; it introduces no orchestration framework,
agent hierarchy, scheduler, model provider, database table or migration.

| Capability | Audited implementation and outcome |
| --- | --- |
| Goal interpretation | Existing QueryNormalizer, RequirementExtractor, deterministic route guards and Cloudflare structured planning. Explicit criteria remain distinct from clinical suitability. |
| Multi-step execution | Existing OperationPlanner/OperationExecutor and registered execution boundary perform independent discovery followed by hospital-linked package reads, requirements and comparison. These execute real services and persist run/task/action/output records. |
| References and evidence | Existing ordered conversation references, catalog snapshots, source IDs, field evaluations and source research. Unpublished and QA records remain excluded by the production database functions. |
| Coordination tasks | Existing care plans/tasks and user-created Recover tasks. Reviews, preferences and unsupported external actions retain explicit user boundaries. No fabricated clinical milestone, assignment or deadline is added. |
| Inquiry and documents | Existing transactional inquiry commands/receipts, per-recipient consent, revisions, patient/Support/provider access, private files and reviewed request form. Provider responses require a real authorized persisted response. |
| Observability | Existing execution checkpoints and operational projections; no patient prose or documents are added to operational telemetry. |

The existing discovery, comparison, compound matching, planning, verification and
document workflows execute tools, rather than merely returning an LLM plan. Booking,
payments, email/SMS, travel purchasing and clinical agents are not connected execution
integrations. The Automation Map includes future concepts, not shipped transports.

## Gaps closed

1. Signed-in history was polled, but its live `activity` was not rendered. The existing
   activity component now shows authoritative planning/execution/observation, attempts,
   retries, failures and completed reads. A prior run is not shown as a new request's
   progress. Completed catalog responses retain the same expandable saved activity
   after refresh. Verification keeps its existing field-evidence presentation.
   There is no fabricated animation or model-written progress.
2. Tool reads previously timed out or failed with no deterministic transient retry.
   Eligible catalog reads now permit two invocations, with a 200 ms backoff, under the
   existing eight-invocation and 80-second request budget. Only explicit transient codes
   and catalog timeouts qualify; unknown errors, validation, authorization, configuration,
   private reads, writes, proposals and external operations are not automatically retried.
3. Refresh restored history but could not resume an interrupted run. New server-only
   JSON checkpoints store the validated original request/plan, catalog digest, invocation
   count and recovery count in existing `agent_runs.metadata`. Recovery is explicit,
   owner-scoped and serialized by the existing 150-second conversation lease. A run must
   have stopped updating for at least 180 seconds; it receives at most one recovery.
4. The original run ID and prior call evidence are preserved. Completed catalog reads
   are reused only after the current public snapshot digest matches and input/output
   schemas validate. Changed publication/evidence triggers fresh eligible reads. The
   invocation budget includes prior invocations. Pending old tasks are marked interrupted,
   completed actions are not repeated, and a saved output returns without tool replay.
5. Inquiry creation language was routed to a status lookup. A selected real published
   listing is now read through the existing detail tool and handed off to the existing
   request form, retaining the conversation ID. The form reloads current publication,
   collects the actual question and requires reviewed Support consent. No natural-language
   acknowledgement supplies consent, submits an inquiry, shares documents or grants access.
6. A saved output can be restored from history even if a process stopped before adding
   its assistant message. Confirmed duplicate recovery repairs final message/run bookkeeping
   idempotently. History GET never executes tools. Each tool also checks that the context
   actor is the persisted run owner.

## Scope and recovery limits

Automatic recovery is limited to unfinished, latest, owned catalog workflows. Case-linked
workflows, private inquiry/Recover/document reads, research, verification, proposals,
clinical requests and consequential actions are excluded. Old version checkpoints cannot
resume; their history remains readable. Cancellation or a changed goal/publication is
respected through the existing current plan and routing rules. There is no background job,
automatic inquiry replay, external resend or expanded patient permission.

Zero matches and absent/incomplete sources remain evidence gaps. A comparison with a
failed dependent search is skipped or marked incomplete; successful sourced candidates
remain visible. A request's API `status` can retain its existing compatibility value while
`activity.state` records `partially_completed`; Operations consumes that authoritative state.

## Validation workflow

Default suite: `npm test`; lint, TypeScript and production webpack build use the existing
commands. New deterministic coverage is in `tests/workflow-recovery.test.ts` and existing
inquiry tests. The hanging-read regression now waits for both bounded timeout attempts.

The opt-in `tests/workflow-persistence-local.test.ts` runs the actual Supabase persistence
classes and registered catalog services against a migrated, loopback PostgreSQL database
through a test-only SQL transport. It reads actual locally published fixture records,
persists a real hospital read, simulates a process stop, resumes that same run, injects a
dependent read failure, verifies bounded retries, skipped comparison, preserved evidence,
activity equivalence, unique output/message, no duplicate completed action and foreign-user
RLS denial. Fault injection and provider fixtures never run against production.

`scripts/validate-agentic-workflows-live.mjs` requires explicit opt-in. It uses existing
real published records and disposable private identities to check multi-step execution,
checkpoints/history, duplicate recovery, cross-user denial and inquiry preparation with
no inquiry/document/provider side effect. Its optional loopback browser broker keeps
temporary credentials in memory; do not record callback fragments. QA accounts are
disabled, banned and signed out, and conversations archived after checks.

Exact release results, deployed SHA and browser evidence are recorded in the release
report. Independent monitoring, email/SMS and a real participating-provider response pilot
remain external dependencies. Local QA provider responses do not establish production
provider participation. No new environment variables are needed in Vercel.

Validated before release: 991 default tests passed, 40 opt-in tests skipped; the
separate live Cloudflare test and loopback PostgreSQL persistence test each passed.
A fresh database install, all 20 SQL validation scripts and operations migration
reapplication passed. All 39 hosted public-catalog/privacy gates passed. The local
production server passed 19 hosted-data workflow checks. Browser review restored
real sourced results and opened the existing request review with explicit Support
consent and no connected provider claim. No inquiry was submitted during these checks.

## Rollback

There is no database migration. Reverting application changes restores the prior runtime;
existing JSON checkpoints and immutable action history can remain. Do not rewrite audit
history or replay consequential operations. Old readers continue to ignore extra JSON
fields through their existing validated projections.
