# Compound intent orchestration

## Root cause and model

The mutually exclusive workflow classifier selected comparison when `compare` appeared anywhere in a compound request. Comparison normalization then started at that clause, discarding the treatment in the opening sentence. The new action parser runs before that classifier and before single-record references for explicit compound searches. Safety and conversation ownership checks still run first.

`lib/orchestration/CompoundRequest.ts` defines a strict Zod request with shared requirements, unique operations, topologically ordered dependencies, clarification metadata, and persisted operation status. The parser consumes the existing RequirementExtractor output. ContextMerger uses the existing planning context and published catalog identities; it does not parse another set of entities or budgets.

Supported operations: `discover_hospitals`, `discover_doctors`, `discover_packages`, `evaluate_requirements`, `compare_results`. Existing standalone discovery, treatment planning and destination comparison remain available. This change does not introduce travel or recovery agents, external booking integrations, or clinical decisions.

## Execution and data integrity

- Hospital and doctor discovery have no artificial dependency on each other. Direct package discovery can run independently when no hospital discovery was requested.
- When both hospitals and packages are requested, packages depend on actual exact hospital candidates. Every package search passes a verified hospital slug, treatment, and destination to the existing tool. Returned package associations are joined from the published package/hospital records and include hospitalId, hospitalSlug, hospitalName and city.
- The existing evaluator evaluates each result before the dependent package batch, after package retrieval, and before persisted references are attached. Comparison consumes those evaluated candidates through the existing comparison formatting/schema; it performs no rediscovery or model call.
- One existing runtime performs at most eight tools in at most two batches. Tool allowlists, tool timeouts, run bounds, authenticated case access, leases, and action/task/run persistence remain active. Searches with identical inputs are reused when their catalog and normalized requirement signatures still match. Changed prices, associations, additions (including formerly empty searches), and changed requirements invalidate reuse. Cached facts are projected from the current published snapshot. Calls beyond the bound are marked incomplete.
- Requirement evaluation preserves exact, related, unknown, not_met, incomplete and not_applicable. A requested accommodation inclusion remains unknown unless catalog evidence supports it. Absence of a requirement does not create it. Budgets are evaluated against documented USD sample prices without converting currencies. Compound searches retain partial candidates instead of hiding unmet requirements.
- A failed operation preserves successful records and marks its operation incomplete. Dependent searches do not use failed or empty hospital results. Comparisons are skipped when their requested input data failed. Empty successful searches remain distinct from failures. A single hospital produces an explicit missing-second-candidate limitation. Two-city comparisons retain empty sides.

## Context, references and persistence

The compound request is saved in the existing care plan context and assistant response metadata; operation/search tasks use the existing care plan tasks. The existing references are built from the final rendered groups. There is no additional reference store or SQL migration.

Hospital detail, its package and package ordinals use existing deterministic resolution. Budget questions such as “Is it under $5,000?” retrieve and evaluate the referenced package rather than running a fresh search, and update the saved budget. “What about Pune?” continues the saved compound operation graph with the current treatment, budget and package requirement. A later budget revision takes precedence over the original budget. “Compare those two” compares a unique sourced pair, clarifies an ambiguous pair, and preserves existing destination-comparison follow-ups. Refresh restores the same context and references from Supabase.

## Automated validation

`tests/compound-intent.test.ts` covers the required regression, hospital-to-package identity propagation, action order, explicit two-city package comparison, one/zero hospital results, empty packages, operation failures, referenced budget changes, ordinal/pair references, persisted context reload, retained location-change requirements, unchanged single-intent workflows, accommodation evidence, cached searches, unsupported procedures, dependency validation, and avoiding accidental hospital discovery from a package association.

The opt-in `tests/planning-live.test.ts` additionally runs the compound request against the development Supabase catalog, reloads the saved graph with a fresh store, follows hospital/package/budget/location/comparison requests, checks real hospital association, persisted response references, and verifies another owner cannot read the compound plan. Its disposable identities and owned rows are cleaned up.

Quality gates passed: lint, TypeScript typecheck, production build, the complete suite (215 passed; 18 opt-in tests skipped), and the relevant live Supabase integration test (1 passed, executed separately). The compound file contains 23 tests. Cache tests cover changed prices/associations and newly populated empty searches; live persistence verifies cache signatures survive reload and an identical compound replay needs no new tools. The final browser replay also preserved the same two sourced records without new catalog tool calls. The configured server-secret scan checked changed files and browser assets and found no matches.

## Browser validation

Scenarios A–G passed against the local production build and development Supabase catalog using a disposable authenticated test account:

| Scenario | Observed result |
| --- | --- |
| A: main compound request | No clarification; one Mumbai hospital; its linked USD 4,700 sample package; exact applicable requirements; explicit missing-second-hospital limitation. Accommodation was not invented. |
| B: first hospital | Resolved `demo-care-mumbai` from the saved compound result. |
| C: its package | Searched through the referenced hospital and returned `sample-knee-replacement-1`. |
| D: under USD 5,000 | Retrieved the same package; its listed USD 4,700 price satisfied the new bound, and the saved budget changed to USD 5,000. |
| E: Pune | Retained knee replacement, the revised USD 5,000 budget and package requirement; no Pune hospital; linked packages and comparison skipped honestly. |
| F: Mumbai and Pune | Reused the known treatment; Mumbai's sourced records and Pune's empty side remained distinct; no cheaper destination was invented. |
| G: refresh and continue | Reopened the saved conversation, restored the comparison and used the first package reference successfully. |

No browser warning/error logs or hydration errors appeared. Screenshot evidence: `medbridge-compound-intent.png` in the Codex visualization directory. This is local production-build validation; Vercel was not separately validated.

## Remaining limits

The current catalog is synthetic and sparse. Missing providers, prices, features and destinations remain explicit. Candidate comparisons describe documented attributes, not medical quality or winners. Travel/recovery operations require future implementations through appropriate evidence and integrations. The bounded tool/task limits may leave larger requests incomplete and require a narrower request.
