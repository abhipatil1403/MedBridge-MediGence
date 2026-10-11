# Focused release-readiness audit — 11 October 2026

## Scope and baseline

Repository HEAD and fetched `origin/main`: `5279eafe39b72c2bc4b9df0b48e5efa61464695c`.
Production alias: https://medbridge-medigence.vercel.app.
Vercel deployment `dpl_9rLEqLw3yjWvFymy4ePoNudhPZae` is `READY`, target
`production`, and reports the same Git SHA. Its framework is Next.js and its
configured build-command override is null; `package.json` has separate build,
test, lint and typecheck commands.

This is an audit, not an activation or implementation release. No application,
migration, permission, credential, billing, production configuration or enable
flag was changed. This report is local and uncommitted. The pre-existing untracked
`docs/FOUNDATION_APPROVAL_RECORD.md` was preserved.

## Tests actually executed

All four gates below ran once in this audit and exited 0. There was no failing
test attempt and no duplicate targeted rerun.

| Command / gate | Actual result | Evidence boundary |
| --- | --- | --- |
| `npm test` | 35 files passed, 12 skipped; **1,098 tests passed, 45 skipped**, 1,143 total; 39.79 seconds | Node Vitest suite; fixture/mocked services and local HTTP/TCP error-contract checks. Does not imply the skipped live/SQL/scanner tests passed. |
| `node --env-file=.env.local scripts/validate-public-catalog-live.mjs` | **39 read-only gates passed** | Actual hosted public catalog/provenance, QA exclusion, private-column/table denial and anonymous privileged-RPC denial. No privileged positive write test. |
| `MEDBRIDGE_TEST_ORIGIN=https://medbridge-medigence.vercel.app node scripts/smoke-discovery.mjs` | **Passed**, exit 0 | Actual discovery/parser/suggestions/empty/error cases, public/auth/portal route responses and canonical links. The script does not print an assertion count; none is invented. HTTP/HTML checks do not prove interactive browser journeys or real model inference. |
| Artifact-only read-only HTTP assertions | **5 endpoint checks passed** | Expected status, no-store responses, exact minimal public liveness body and basic sensitive-marker denial on protected endpoint errors. |

Fresh endpoint evidence:

| Endpoint | HTTP | Cache | Interpretation |
| --- | --- | --- | --- |
| `/api/health` | 200 | `no-store` | Minimal `{status: "ok"}` liveness; not dependency readiness. |
| `/api/health/ready?portal=admin` | 401 | `no-store` | Anonymous dependency diagnostics denied; no authenticated positive readiness probe performed. |
| `/api/portals?portal=admin&resource=operations_overview` | 401 | `no-store` | Anonymous Operations access denied. |
| `/api/internal/operations-monitor` | 401 | `private, no-store` | Unauthorized worker access denied; not monitor connectivity evidence. |
| `/api/internal/document-scans` | 401 | `private, no-store` | Unauthorized scanner access denied; not a scan or processing activation. |

Fresh logs are local under
`C:\Users\Lenovo\.codex\artifacts\medbridge-release-audit-20261011`:
`full-tests.txt`, `public-catalog.txt`, `production-smoke.txt`, `health-checks.txt`
and `health-checks.json`. Deployment/environment CLI artifacts remain private;
secret values were not printed or copied into this report.

### Existing results reviewed, not rerun

The baseline's `docs/EXTERNAL_INTEGRATION_ACTIVATION.md` and the private
`medbridge-integration-20261010` reports record:

- Final full suite: 1,098 passed, 45 skipped; earlier attempt: 1,097 passed,
  1 failed, 45 skipped (local HTTP receiver fixture timing). The baseline contains
  that fixture correction; the new full run above passed.
- Fresh local PostgreSQL install/seed and all 23 database validation scripts
  passed, including RLS, publication, inquiry/provider coordination, consent,
  scanner security, deletion and monitoring. Migration reapplication passed.
- Two genuine local ClamAV tests passed in the final daemon attempt; the first CLI
  attempt failed. The pipeline used real local SQL/HTTP/ClamAV but an in-memory
  Storage-byte adapter. It did not verify hosted Storage or a production scanner.
- Five local monitor-worker checks passed. These verify HTTP acceptance and durable
  ledger behavior, not genuine recipient delivery.
- Lint exited 0 with zero errors and one existing unused-expression warning;
  TypeScript and webpack production build exited 0. These are historical results,
  not fresh executions in this audit.

Unchanged baseline and no code edits provided no concrete reason to repeat the
build, lint, TypeScript, 23 SQL scripts or real scanner setup. They remain prior
baseline evidence, while the fresh default regression and hosted read-only gates
above establish the audit's current evidence. No independent security scan or
complete browser acceptance is claimed.

Hosted Operations, inquiry, portal and agent persistence gates were not rerun:
they create accounts, change staff roles, or persist workflow/health/actions.
In particular, `validate-production-operations-live.mjs` creates Auth identities
and staff roles despite its production-safe label. Running it would contradict
this task's prohibition on credential/permission changes. Existing script
authorization requirements were preserved.

## Critical journey coverage

| Journey | Existing automated coverage reused | Remaining evidence gap |
| --- | --- | --- |
| Discovery and comparison | `comparison`, `requirements`, `compound-intent`, `governed-packages`, catalog budget/snapshot and agentic reference/execution tests. Exact bare-list comparison failure, canonical inputs, airport-transfer context, provenance, missing evidence and partial outcomes are covered. Fresh production discovery smoke and public privacy gate passed. | No fresh hosted multi-turn assistant/package persistence gate; complete browser selection/comparison interaction is not automated. |
| Authentication and authorization | `auth-return-path` rejects unsafe/looping redirects; portal role mapping and authenticated tool-owner contracts. Existing SQL/RLS gates exercise tenant/principal/owner isolation; fresh anonymous production denial checks passed. | Magic-link delivery, expired/replayed links, cookie/session recovery and role changes through an actual browser are not covered by the default suite. Positive hosted role checks were not repeated. |
| Provider inquiry and responses | `patient-inquiries` and `inquiry-evidence-projection` enforce reviewed revision, explicit consent, attributable persisted response and truthful patient/AI status. Existing local inquiry lifecycle test covers duplicate response, rollback, missing evidence and withdrawal; SQL inquiry/coordination scripts exist. | Local lifecycle opt-in is skipped in the fresh default run. No actual provider participation, real inquiry receipt/response or human acceptance. |
| Consent-controlled documents | Coordination, scanner security, cleanup API and deletion tests cover file signatures/size, clean proof/checksum, blocked pending/quarantined/failed states, withdrawal during delivery, interrupted deletion and safe errors. Historical SQL enforces recipient/owner isolation. | Production ClamAV/hosted Storage round trip and restore are unverified. Default scanner tests use protocol doubles; the genuine-engine opt-ins were skipped. |
| Admin publication | Portal, provider-verification, verification-UX, reference-onboarding and governed-package tests cover draft/schema validation, reviewer scope, source constraints and honest evidence. Existing SQL governance/workflow/visibility tests cover actual publication boundaries; fresh public privacy gate passed. | No automated complete authenticated browser review/approve/publish journey. Fresh positive publication writes were intentionally excluded. |
| Support operations | Inquiry projections, Operations contracts/server/monitor tests and workflow recovery cover attention thresholds, truthful failures, authorization contracts, safe telemetry, bounded retries and deduplication. Historical SQL checks cover assigned scope, internal notes and audit. | Complete browser assignment/response/escalation and genuine operational acknowledgement remain unverified; external alert delivery is blocked. |
| AI tool execution | Runtime/orchestration/tool tests cover authoritative schemas, supported normalization, permissions, contextual references, bounded correction/recovery, timeouts, partial results, duplicate prevention and persisted-state contracts. | Actual-model and real persistence opt-ins are skipped. Default fixtures do not establish model availability or database transaction behavior; historical isolated SQL/persistence evidence is separate. |

Tests run under the configured Node environment. Rendering helpers use
`renderToStaticMarkup`; there is no checked-in Playwright/Cypress browser suite or
browser runner dependency. HTTP smoke tests do not replace browser interaction.
No coverage percentage is available: Vitest has no configured coverage threshold
or reporter, and assertion counts are not a measure of journey completeness.

## Findings and distinctions

**Confirmed current test failures or newly reproduced application/security
defects: none within the executed scope.** This is not a claim that all behavior
or infrastructure is secure or verified.

Meaningful release coverage gaps:

1. **No repository CI test enforcement is defined.** There is no tracked
   `.github/workflows` or other CI YAML; `build` does not invoke `test`/`lint`.
   Production deployment has no build-command override. Passing manual tests do
   not ensure a future release runs them. Attempts to inspect GitHub check-runs
   and Actions history could not execute because `gh` is unavailable (both exit 1);
   external branch rules/checks remain unverified, not asserted absent.
2. **Full browser authentication and cross-portal journeys lack automated
   coverage.** Server render assertions and helper/schema tests are valuable but
   cannot detect browser event, navigation, cookie and actual sign-in regressions.
3. **Opt-in integration execution is separate from the default pass.** The 45
   skipped cases span live model/database, local publication/RLS, inquiry lifecycle,
   workflow persistence, scanner and restore tests. Existing tests should be reused
   in approved isolated infrastructure; they are not missing test implementations
   merely because this run skipped them. Genuine hosted Storage recovery and
   recipient-delivery receipt integration still require independent evidence.

Documentation caution: the original control table in
`PRODUCTION_SAFETY_AND_PROVIDER_PILOT.md` describes scanning as absent. Later
`DOCUMENT_SECURITY_AND_SCANNER_SETUP.md` and
`EXTERNAL_INTEGRATION_ACTIVATION.md` document its implemented, fail-closed state
and absent production activation. Treat the older table as historical, not proof
that scanning is currently unimplemented or operational. No runbook was rewritten
as part of this audit.

## External blockers automated tests cannot resolve

Fresh Vercel name-only environment inspection lists the seven existing application
variables, with no monitor enable/token or scanner enable/token configuration.
This supports **not configured** for those application integrations. It does not
prove an independently hosted checker does or does not exist outside inspected
configuration. No independent-checker evidence was available.

| Control | Status / outstanding evidence |
| --- | --- |
| Independent checker and monitor worker/ledger | BLOCKED: approved independent host/account, deployment/supervision, durable private ledger, authenticated checks, measured failure/recovery and missed-check detection are not evidenced. |
| Authenticated alerts and attributable receipts | BLOCKED: approved receiver, operational recipient and credentials missing. Existing transport records HTTP 2xx as `accepted`; it does not consume a recipient receipt. Selected provider receipt reconciliation and real delivery evidence remain pending. |
| Production ClamAV | BLOCKED: approved separate host/processing location, dedicated credentials, genuine current-signature scan and hosted quarantine/access acceptance absent. Keep documents fail-closed. |
| Incident coverage | BLOCKED: named primary/deputy, coverage, acknowledged escalation and recovery responsibilities have not been approved. |
| Genuine provider acceptance | BLOCKED: organization/authorized representative commitment and bounded pilot inquiry/response acceptance missing. Reference listings and QA fixtures are not agreements. |
| Database and Storage restore assurance | BLOCKED: latest documented production audit listed `backups: null`, PITR disabled and no verified object backup. This audit did not requery backup configuration. Database-only/local file restore evidence does not verify production Storage recovery. |
| Retention, holds and RPO/RTO | BLOCKED: approved rules, approvers and recovery targets absent. Automatic expiry must stay disabled; no recovery guarantee is inferred. |

## Recommendation and next action

**Single highest-priority technical next action:** make the existing default
regression suite and approved isolated SQL/RLS gates required release CI checks,
using the existing scripts. This closes the observed enforcement gap without
duplicating tests or activating production integrations. Verify the checks actually
run and block a failing change before relying on them. This recommendation was not
implemented in this audit.

The inspected production release matches the intended baseline and the executed
gates pass. **Provider pilot: NO-GO.** CI, browser acceptance, external safety
verification, approved operational/policy coverage and genuine provider acceptance
remain separate obligations; passing the current suite waives none of them.
