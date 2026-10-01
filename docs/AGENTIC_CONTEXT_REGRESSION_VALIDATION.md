# Agentic conversational context regression

Validated on 2026-10-01 against local production Next.js, live Supabase and the Vercel production alias.

## Confirmed root cause

Two permanent tests failed before the correction:

1. The hospital-matching response scoped a bare ordinal to hospitals. An out-of-range ordinal produced a discovery clarification with no findings. The following `first one then` reconstructed mixed hospital/package context without retaining the previous hospital query scope and became ambiguous.
2. The reference execution adapter handled short replies only when an ambiguous response had a matching candidate type/name. `yes` matched nothing and returned `undefined`, allowing normal orchestration and model planning. Initial model planning received the latest message without the owned structured conversation context, so there was no application boundary preventing an unrelated search proposal.

The existing deterministic resolver itself remains authoritative and unchanged. This correction retains its decisions, list scope and structured inputs across clarification turns.

## Changes

- Reference continuations run before compound/general workflow selection. A complete new search containing `their packages` still uses its existing intra-request dependency graph; it is not misclassified as an older-list reference.
- Pending clarification is strict schema data: ID, original request, question, actual candidate records/types/names, expected entity-selection answer, conversation/run IDs, original query/list context and timestamp. It persists in existing assistant response/output metadata and active care-plan context. No migration is required.
- Ordinal corrections inherit the pending entity scope. Candidate choices use actual IDs and are checked again against the currently published ID/slug pair. Nonselecting acknowledgements repeat clarification without a model or tool invocation. Explicit new goals clear saved reference clarification state.
- The runtime receives owned server history, active coordination plan, structured findings, result groups, actual ordered references, pending clarification, prior tool statuses, requirements and comparison data. Factual findings retain IDs, facts, relationships, evaluations and provenance; they are not reconstructed from prose. Private case objects are not added to this context.
- Unresolved/ambiguous reference execution authorizes no tool. Resolved execution authorizes only its exact deterministic tool/input pair. The registry boundary checks this after Zod validation and before cache/service access. A direct runtime reference without a prepared resolution produces clarification instead of model planning. Reference runs cannot enter observation/model fallback.
- Short `no`/`ok` replies are accepted by the request schema; whitespace and empty requests remain invalid.
- The question component omits null/undefined, their literal sentinel strings, object placeholders and empty values. Progress renders only known labelled operations with actual statuses, in readable text. Hospital criteria and linked-package criteria are explicitly separated in both the evidence panel and derived summary.
- Partial results, one-provider comparison limitations, existing tool validation, permissions, budgets, RLS and provenance are retained. Case Intake receives no new workflow capability.

The reported literal `null` and blank progress rows were not reproduced with the valid initial local response. Defensive rendering and regression tests now cover them explicitly; production inspection confirmed actual labels/statuses and no placeholder question.

## Automated and live gates

| Check | Result |
|---|---|
| New permanent regression tests | 44 passed |
| Targeted new + existing reference tests | 99 passed |
| Complete ordinary suite | 387 passed; 20 opt-in live tests skipped |
| ESLint | Passed without warnings |
| TypeScript | Passed |
| Local production build | Passed |
| Live Supabase execution/RLS test | 1 passed, expanded with the exact regression and fresh store instances |
| Source/client secret scan | No matches against configured runtime server credentials |
| Diff whitespace review | Passed |

The expanded live test verifies actual seeded record IDs beginning `cddb10ae` and `1ec68b66`, pending clarification persisted in the care plan, exact ordinal correction, `yes` executing zero tools, restored hospital→package lookup, no further model calls on reference turns, output persistence, result retry idempotency, owner isolation, RLS-protected private runs and denial of direct user run mutations. Disposable identities and their owned data are cleaned up. Existing catalog records are unchanged.

Regression coverage includes mixed result groups, candidate type/name selection, seven nonselecting acknowledgements, ordinal scope, serialized refresh, missing recent history, unavailable records, explicit unrelated new goals, references after partial/tool failure, structured execution context, direct runtime and registered-tool blocking, question sentinel values, populated/incomplete progress and package-level requirement language.

## Manual local and production validation

The exact requested sequence was submitted through the authenticated browser on both localhost and `https://medbridge-medigence.vercel.app/assistant` using disposable users:

| Request | Verified response/tool behavior |
|---|---|
| `Find knee replacement hospitals in Mumbai under $6,000, check their packages, tell me what's missing, and compare them.` | Actual Mumbai demo hospital and USD 4,700 demo package; partial completion; comparison incomplete with one provider |
| `Tell me more about the second one.` | Only one hospital in that list; pending clarification; zero tool calls |
| `first one then` | Mumbai hospital `demo-care-mumbai` resolved deterministically; only `get_hospital` |
| `yes` | Clarification; `waiting_for_input`; zero tool calls; no guessed selection/search |
| Reload → `Show me its packages.` | Actual associated knee package; only the authorized hospital-scoped `search_packages` |

Production persisted run/output inspection corroborates browser results. No facial plastic surgery or other unrelated treatment appeared. Progress has actual hospital/package/requirement/comparison entries; there are no blank rows or null/undefined/object question placeholders. Hospital evidence distinguishes linked-package budget/package criteria. Refresh preserves the owned context.

Production browser console inspection returned zero errors and warnings. The 390×844 mobile viewport had equal document/content widths (375 CSS pixels excluding the scrollbar), with readable clarification and controls and no horizontal overflow. The viewport override was reset after inspection.

In the production initial compound run, a model comparison proposal was invalid and rejected. Actual hospital/package/requirement results were preserved and the response remained partial. This is an existing framework limitation, not an unrelated search or a fabricated peer.

## Deployment and limits

The validated source was deployed through the authenticated Vercel CLI after local gates passed. Production deployment `dpl_5roNhzpzfpJSjAbGNhWFzHWZo7JB` reached **READY** and was aliased to `https://medbridge-medigence.vercel.app`. Its URL is `https://medbridge-medigence-fxpd3rbue-abhipatil1403-gmailcoms-projects.vercel.app`.

The Git checkpoint follows validation with the required message `fix: preserve agentic conversational context`, then push to `origin main` and comparison of local/tracking/actual remote SHAs. The CLI deployment validated the working source before this commit so production could be tested before the Git checkpoint. A subsequent Git-triggered deployment contains the same application changes plus this report; deployment and final SHA are reported separately.

Genuinely mixed references still require a type/name selection. An acknowledgement never selects a candidate. Missing/stale records and insufficient comparison peers remain explicit. The catalog is synthetic/demo where labelled, sample prices are not provider quotes, and no medical suitability, booking or external action is inferred. No new environment variables, patient workflow, model provider or database migration is needed.
