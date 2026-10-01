# Agentic tool execution validation

Validated locally on 2026-10-01 against the production Next.js build, the configured Supabase project and Cloudflare Workers AI. This document records the implemented scope and its limits. Vercel production was **not tested** for this milestone.

## Architecture assessment and extension

The repository already had a strict tool map, Cloudflare planning/synthesis, agent allowlists, catalog services, requirement evaluation, comparison, compound dependencies, ordered references and private run/task/action/output storage. The missing pieces were a recorded execution state machine, a structured observation/next-decision contract, centralized execution validation and bounded recovery. Those are extensions of the existing runtime; the agent workflows and services remain in place. Case Intake is parked and has no new capability in this change.

- `lib/agents/tools.ts`: central typed, versioned Tool Registry with schemas, execution adapters, categories, permission/mode, provenance policy, timeout and recovery policy.
- `execution-state.ts`: states, budgets, call records, canonical cache keys and credential redaction.
- `tool-execution.ts`: validate proposal → authorize → execute existing service → validate result → persist observation. Unknown IDs, wrong versions, invalid arguments and unavailable permissions fail before service execution.
- `observation.ts`: the existing Cloudflare provider chooses another read, continue, clarification, finish or partial completion from actual structured observations.
- `runtime.ts`: model-controlled reads run individually; existing deterministic workflows retain their dependencies and may extend with requirement/comparison analysis. Reference-only requests and fresh saved-result reuse remain deterministic.
- Existing `agent_runs.metadata.execution` records the request, owner, goal, state, steps, inputs, outputs, safe errors, timestamps and provenance. Each normal execution links its existing task. Final output references existing `agent_outputs`; retrying result finalization updates the same row under the existing serialized conversation workflow.
- The authenticated history endpoint returns a compact allowlisted activity projection. Polling restores progress and completed responses; a reload does not execute tools again.

No new database tables, migrations, RLS policies, environment variables, model provider or dependencies are required.

## Registered tools

There are **26 registered IDs**, retaining the 19 previous IDs and adding seven adapters/analysis tools. Each uses strict Zod input/output schemas and version `1`.

| Group | IDs |
|---|---|
| Existing catalog reads | `search_hospitals`, `search_doctors`, `search_treatments`, `search_packages`, `search_countries`, `search_services`, `get_hospital`, `get_doctor`, `get_treatment`, `get_package`, `get_country`, `compare_treatment_options` |
| New aliases using existing services | `get_hospital_details`, `get_doctor_details`, `get_treatment_details`, `get_package_details`, `search_locations` |
| New analysis using existing helpers | `check_requirements`, `compare_providers` |
| Retained consent reads | `get_case_context`, `get_case_documents_metadata` |
| Retained proposals/clarification | `create_case`, `update_case`, `create_agent_task`, `request_external_action`, `request_user_information` |

Analysis accepts actual published catalog IDs observed in the run. Requirements come from the existing deterministic user context, not model-authored constraints. Comparisons preserve selected order and do not select a clinically superior provider. `search_locations` wraps country/travel-note search; cities remain filters on provider/package searches, not a new city directory.

## States and limits

States: `queued`, `planning`, `executing`, `observing`, `waiting_for_input`, `awaiting_confirmation`, `completed`, `partially_completed`, `failed`, `cancelled`. Terminal states cannot resume implicitly. Cancellation is represented and tested; a new cancellation delivery/UI integration is outside this milestone.

| Limit | Value |
|---|---|
| Executions per run | 8 |
| Loop iterations | 8 |
| Initial planning attempts | 2 |
| Repeated executions of a canonical tool | 6 |
| Failures | 3 |
| Proposals | 16 |
| Runtime execution budget | 80 seconds |
| Tool timeout | 12 seconds |
| Model request deadline, including provider malformed-output retry | 25 seconds |
| Within-run read reuse freshness | 60 seconds |

Canonical validated object keys and aliases share cache identity. Array order remains meaningful. Failed calls, approval proposals and consent reads are not cached. Existing cross-turn catalog signatures still govern saved-result reuse. A failed/invalid call is observable and can be corrected; successful sourced results survive incomplete work.

## Automated gates

| Check | Result |
|---|---|
| Complete ordinary suite: `npm test` | **343 passed; 20 opt-in live tests skipped** across 11 passed and 5 skipped files |
| New framework coverage included in ordinary suite | **55 passed** |
| New opt-in Supabase execution test | **1 passed**, including result-finalization retry |
| Existing opt-in treatment-planning regression | **1 passed**, with real Supabase/Cloudflare execution |
| ESLint | Passed |
| TypeScript: `npx tsc --noEmit` | Passed |
| Production Next.js build | Passed |
| Diff whitespace check | Passed |
| Changed source and generated client asset scan against configured server secrets | No matches |

The ordinary suite includes the existing discovery, planning, comparison, references, requirements, compound orchestration, hospital matching and Case Intake regressions. The 20 skipped opt-in tests are not claimed as executed. The two separately executed live tests bring the distinct executed test count for this validation to **345**.

Framework tests cover registry metadata, arbitrary/prototype IDs, versions, strict malformed input/output rejection, valid service execution, sequential decisions, state transitions, failure/correction, empty results, canonical alias reuse, freshness, call/repeat/failure/runtime limits, timeout, recursion, owner/consent boundaries, credential redaction, real record provenance, fabricated/out-of-scope analysis IDs, safe activity DTOs and dynamic runtime recovery. Browser-discovered specialty-only package clarification was corrected through the existing classifier, planner and search service and covered by regression tests. The exact “Compare the two packages” phrase is covered by ordered reference tests.

## Live Supabase validation

The new live test creates disposable confirmed users, reads the existing published Mumbai knee hospital and linked packages, and verifies:

- Actual run metadata contains owner, completed state, three calls, validated inputs, task links, output records and timestamps.
- Hospital detail alias reuse records a reused call without an extra action: three calls, two service actions.
- Saving the final output again leaves exactly one assistant response row.
- A fresh store instance restores owned terminal activity and can read `executing` activity during an actual catalog operation.
- Another JWT cannot read the conversation, messages or run activity, including when supplying the owner's ID.
- User JWTs cannot directly overwrite private run metadata; persisted calls remain unchanged.
- A controlled package-service outage after a successful real hospital read persists `partially_completed` with completed/failed steps.

The failure injection is test-only dependency substitution with real persistence; it is not a fault endpoint in the application. Test identities and their owned execution data are removed in `finally`. Existing catalog seeds are unchanged.

## Manual application scenarios

Executed through the actual local production app at `http://localhost:3099/assistant` using disposable accounts and the real configured Supabase/Cloudflare services.

| Scenario | Observed result |
|---|---|
| 1. Simple Mumbai knee hospital search | Procedure/city retained; actual `search_hospitals`; sourced demo hospital returned without reasking |
| 2. Hospital plus packages | Associated Mumbai knee package returned; recent hospital evidence reused; USD 4,700 labelled sample price, not a quote |
| 3. Compound budget/accommodation/missing/comparison request | Actual hospital/package reads followed by `check_requirements` and `compare_providers`; insufficient peers and undocumented accommodation remained explicit; partial completion |
| 4. Second hospital follow-up, then “its packages” | India list showed Bengaluru first/Mumbai second; detail selected Mumbai using `get_hospital` without new search; package follow-up retained that hospital |
| 5. “Compare the two packages.” | Specialty-based Mumbai search returned Hip then Knee; actual `get_package` twice preserved order and compared sourced sample facts without clinical ranking |
| 6. Failed tool proposal | Compound run included a real malformed model comparison proposal; strict validation rejected it, persisted failure and retained successful catalog findings |
| 7. Empty result | New Delhi knee hospital search returned zero sourced records and an honest no-match state |
| 8. Incomplete/invalid request | “Find packages in India.” asked the material missing procedure with `waiting_for_input`; empty composer could not submit |
| 9. Refresh during and after execution | Reload during observed compound activity restored owned progress; polling later restored terminal response without replaying calls |
| 10. Second account | Separate signed-in account could not see the first account's conversation/activity; HTTP ownership probe also returned 403 |

The browser failure scenario exercises an actual rejected model proposal. A service outage is covered separately by the live Supabase test and automated runtime recovery tests. The two comparison packages are different procedures under an explicitly broad orthopedic request; their price/duration comparison is catalog information, not treatment selection.

Responsive inspection used a 390×844 viewport and the normal desktop viewport. The mobile document had no horizontal overflow; controls, cards and recorded activity remained readable. The composer has an associated label, buttons have accessible names, activity uses a status role and ordered steps, and navigation retains the skip link. Browser console checks found no errors or warnings during the tested application session. This is manual responsive/accessibility inspection, not a formal accessibility certification.

## Security review

- Authentication and conversation ownership precede activity reads; user JWT RLS remains enforced before private admin projection.
- Actual HTTP probes returned **401 unauthenticated** and **403 cross-account**, without private activity/messages.
- Registered agent allowlists, exact tool/version checks, strict argument schemas and output schemas remain application-controlled; no arbitrary function, code, SQL or model-directed credential access exists.
- Observation tools are read-only and exclude consent-protected case reads. User/tool text cannot grant permissions. Executing write/external/clinical modes are denied; retained proposal tools only record approval requests.
- Credentials are rejected in tool input/output and redacted from the new ledger/model request context. Client activity exposes labels, statuses, counts and safe warnings, not raw input/output or private service errors.
- Operational logs record IDs, status, tool, timing and safe error codes; no new raw patient logging is added. Case context remains in its existing consent-controlled workflow and is excluded from the new observation ledger.
- Source records retain IDs and first-party/external/demo attribution; derived analyses retain underlying IDs. Model-generated coordination explanations are labelled separately from catalog facts.
- No RLS, secret policy or consent restriction is weakened. Changed files and client assets are scanned against configured server credentials before staging; no key is printed or committed.

## Known limitations and deployment

- The current Mumbai knee catalog has one demo hospital and one associated package, so a genuine two-provider comparison is unavailable. Unknown accommodation stays unknown; hospital stay does not establish accommodation.
- Model proposals can still be invalid. Validation rejects them, allows bounded recovery and can return partial completion. This milestone does not guarantee every natural-language goal completes.
- Existing deterministic compound dependencies run before optional model-selected analysis. Reference-only operations remain deterministic. Both use the same registry/runtime and actual service results.
- Runtime timing begins after existing dedicated workflow preparation. Database/finalization latency and platform request limits still apply. Timed-out read promises may finish internally, but their results are excluded. No executing external/write integration is introduced.
- Reload restores activity/results while the server request remains active; it does not restart a crashed process. Background continuation, automatic HTTP replay, external booking/payment, diagnosis and new patient-data flows are outside scope.
- Case Intake remains parked. Catalog data is synthetic/demo where labelled and cannot establish real availability, medical suitability or current provider quotes.
- Deployment checkpoint is the requested commit `feat: add agentic tool execution framework` on `main`, pushed only after gates pass. Local HEAD, tracking ref and actual GitHub branch are checked after push.
- **Vercel production was not tested.** A GitHub push may trigger the configured deployment; this does not verify deployed behavior. No environment or migration action is needed for this milestone.
