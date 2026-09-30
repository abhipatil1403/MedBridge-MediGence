# HospitalMatchingAgent

## Architecture

`lib/agents/HospitalMatchingAgent.ts` is deterministic evidence coordination inside the existing compound executor. Its strict input reuses Requirement[] for treatment, location, budget, requested price documentation, duration, features and requested services, plus the existing operation enum for retrieval/comparison intent. Operation/requirement IDs must be unique. It has no database query implementation, model decisions, independent comparison or persistence store.

Hospital searches use the existing Discovery/SearchService tools. The existing RequirementEvaluator checks current published record ID and slug, treatment links, destination, specialty and other applicable criteria. Linked package searches use actual hospital slugs; ContextMerger verifies package/hospital identities and supplies hospital ID, slug, name and city. Budgets/features/duration remain not_applicable on hospital cards and are visibly evaluated at package level.

Each package is evaluated independently. A hospital combination uses one evidence package, never a price from one package plus features from another. Shared treatment/location requirements must hold for both records. Strong matches require sourced evidence for every required criterion; unknown requested accommodation produces partial_match. Missing packages, price or duration data produce insufficient_evidence. Explicit contradictory evidence produces does_not_match. Unknowns, incomplete retrieval, related evidence and explicit failures remain distinct; only requested criteria appear. Hospital stay is never substituted for accommodation.

The strict result reuses Finding, RequirementEvaluation and Provenance and verifies summary/status consistency, linked identities and evidence record IDs. Results are ordered by documented requirement satisfaction, related status and explicit failures, with stable ties. These labels do not describe provider quality or clinical suitability.

General requested services use the existing search_services tool. Generic catalog service entries do not establish hospital availability: their hospital criterion remains unknown. Package inclusions such as interpreter/visa/consultation use existing inclusion evidence. There is no invented hospital/service relationship.

## Existing integrations

- The same compound runtime executes bounded searches (eight calls, two batches), records operations/tasks/actions and passes the ordered sourced candidates to the existing ComparisonAgent helper. Comparison does not rediscover them. Zero/one candidates and empty destination sides remain explicit.
- The existing ReferenceDetector/Resolver handles hospital ordinals, hospital → package, new package budgets and location changes. A bare ordinal after a hospital matching response identifies its hospital list. Generic multi-entity lists retain existing ambiguity handling. Hospital-linked follow-ups keep packages that fail a budget so their evidence remains visible.
- Search caching keys the current published records and actual retrieval filters. Budget/feature changes reuse valid catalog results and reevaluate them; location changes query affected hospital/package searches. Changed prices, joins or catalog membership invalidate the affected search. Each hospital retains its own package retrieval completeness.
- Match metadata uses existing owner-scoped conversation response JSON and care-plan task metadata. Reload and continued turns preserve requirements, package associations, missing information, provenance and references. Revised budgets take precedence over the original bound.
- The compact evidence overview uses existing assistant components and styles. Existing sourced cards and comparison tables retain the displayed reference order. Package-level criteria are clearly labelled.

## Validation

`tests/hospital-matching.test.ts` contains 32 behavioral tests: strict input, exact hospital retrieval, hospital/package scope, implicit package searches, accommodation unknown/included/excluded, hospital stay distinction, exceeded budgets, absent prices/packages, incomplete searches, zero/one/multiple candidates, independent ordering, evidence integrity across packages, forged identity rejection, requested-only gaps, comparison integration, hospital/package/budget/location follow-ups, metadata reload, account isolation, caching, duration constraints, services, cost-only requests, explicit specialty caching, comparison/overview/persisted ordinal alignment, discovery regression and five-hospital/25-package result bounds. Hospital evidence uses all displayed groups while the flat response respects its 30-record cap.

The complete existing suite covers requirement matching, compound orchestration, comparison, references, treatment planning, boundaries and ownership. The opt-in live Supabase test checks real hospital/package identity, saved match metadata through a fresh store, cached replay and cross-account RLS. Disposable users and their owned rows are cleaned up.

No SQL migration or new environment variables are needed. Existing authenticated ownership checks, RLS, case consent, tool allowlists, leases, server credentials and demo provenance remain in effect.

Quality gates passed: lint, typecheck, production build, full suite **247 passed / 18 opt-in skipped**, and the separately executed live Supabase integration **1 passed**. The configured-secret scan checked **24 changed files, 25 browser assets and two server secrets**, with **zero matches**.

## Local production browser validation

All exact scenarios A–I passed with a disposable authenticated test account against the development Supabase catalog:

| Scenario | Observed result |
| --- | --- |
| A: Find knee replacement hospitals in Mumbai. | One sourced demo hospital; exact treatment/location; strong hospital requirement match. Package absence is not claimed when packages were not requested. |
| B: Find knee replacement hospitals in Mumbai under $6,000 and check their packages. | Actual linked package; USD 4,700 listed sample; budget exact at package level, N/A at hospital level. |
| C: Find knee replacement hospitals in Mumbai under $6,000 with accommodation. | Partial match; accommodation unknown; hospital stay explicitly distinguished from accommodation. |
| D: Tell me more about the first hospital. | Resolved demo-care-mumbai and retrieved its sourced hospital details. |
| E: Show me its package. | Retrieved sample-knee-replacement-1 through the referenced hospital. |
| F: Is it under $5,000? | Same sourced package, USD 4,700; new budget exact; saved budget updated to USD 5,000. |
| G: What about Pune? | Retained treatment, revised budget, accommodation and package intent; zero sourced Pune hospitals/packages; no alternatives invented. |
| H: Compare Mumbai and Pune. | Existing comparison shows Mumbai's sourced records and an empty Pune side; no cheaper destination or clinical preference invented. |
| I: Refresh and continue. | Conversation, plan, requirements and comparison restored; first package follow-up retrieved the same package, retained USD 5,000 and unknown accommodation. |

Browser warning/error logs were empty, including after refresh; no hydration errors appeared. Screenshot: medbridge-hospital-matching.png in the Codex visualization directory. The browser test account, its owned records and temporary browser/server sessions were cleaned up. This validation used localhost; Vercel was not tested.

## Limits

The current development catalog is synthetic and sparse. Sample prices are not provider quotes. Unknown inclusions and hospital-specific service availability need provider confirmation. Clinical suitability and provider quality cannot be inferred from catalog matches. Large requests can reach the existing tool/task bounds and are marked incomplete. No Vercel validation is claimed.
