# Treatment planning validation — 30 September 2026

## Verified

- Complete default automated suite: 65 passed, 18 optional integration tests skipped. Planning tests exercise real discovery/search code with a synthetic catalog and controlled persistence/provider dependencies.
- Planning coverage: creation, reuse, saved context, USD budget updates, INR handling without conversion, two/three-tool execution, clarification, duplicate prevention, actual review status transitions, approval boundaries, ownership, overlapping turns, bounded tool permissions, model failure, provenance, clinical boundaries, partial failure, cancellation, and a new specialty request independent of the previous surgery.
- Live DiscoveryAgent reliability suite: 8 passed against the configured Supabase catalog and Cloudflare provider. These live tests use an in-memory execution store and do not establish live care-plan persistence.
- The care-planning migration was applied in a disposable local PostgreSQL 18.1 database alongside existing migrations. Both `validate-agent-rls.sql` and `validate-planning-rls.sql` passed with rolled-back test data. Checks include owner isolation, revoked case membership, denied patient writes/RPC execution, duplicate constraints, execution foreign-key scope, approval constraints, lease tokens/concurrency, and repeated atomic saves.
- Supabase response timestamp offsets are normalized and tested before validating restored plan data.
- Browser checks used the production `/assistant` sign-in shell and a separately labeled local HTML fixture rendered from the actual `CarePlanPanel` component. At 320, 375, 390, 430, 768, and 1440 pixels, neither had horizontal overflow. Panel tasks, progress, optional budget text, and expanded provenance were visible. No console errors were captured in these checked views.

## Live validation after the remote migration

The user successfully applied `20260930090000_care_planning.sql` with `supabase db push`. The opt-in planning test then passed against the configured remote Supabase project. It verified real plan/task persistence, context and budget continuity, hospital/package/doctor searches, owner isolation, denied direct patient writes, review updates, execution links, and stable task order after reload. A fresh plan also succeeded with a deliberately unavailable model provider and real catalog tools. Temporary integration identities and their owned data were removed afterward.

Authenticated browser checks used temporary test accounts and the local production build. They covered initial planning, an initial USD 6000 budget, package continuation, hospital/package/doctor requests, generic-hospital clarification, heart-doctor discovery, and unsupported-procedure handling. Refresh restored the same conversation, budget, and review state. Plan counts and task counts in Supabase confirmed follow-ups reused the existing records. A separate local production server with deliberately invalid model configuration still created a saved plan with hospital and package findings; the checked browser views had no captured console errors.

The deployed application at `https://medbridge-medigence.vercel.app/assistant` was also tested through its authenticated UI. Initial plan creation, package continuation, budget updates, hospital/package/doctor findings, marking a review complete, refresh persistence, and restoration after navigating away all passed. The deployed view showed the saved-order and cached-match-status corrections from commit `54200ab`. Expanded sourced findings were checked at 320, 375, 390, 430, 768, and 1440 pixels with no horizontal overflow and no captured console or hydration errors. Production model configuration was not changed for the outage test.

Browser validation found two display defects and the subsequent checks verified their fixes: atomic task saves now retain an explicit position in existing task metadata, and reused findings determine the returned match heading rather than the current run's empty tool-output list. No additional migration is required for these corrections.

After the fixes, the default suite again passed all 65 tests (18 optional integration tests skipped), and the strengthened opt-in planning test passed. Lint, typecheck, and production build passed. Exact-value scans of the changed files and 25 client assets found neither configured server secret.

## Independent planning result aggregation

The former planning response reused one global `discovery.matchType` for multiple search tasks. Runtime discovery summaries described newly executed tools, so cached findings could be paired with a zero-result heading. Recomputing one global heading from all findings still could not describe mixed hospital/package/doctor results independently.

Planning now persists `discovery.matchType` and `matchReason` on each completed discovery task in the existing `care_plan_tasks.metadata` JSON. Criteria changes clear this metadata together with findings. Older plans derive it from their saved sourced findings and persist it on the next planning turn. No database migration is required.

The strict response schema adds optional `resultGroups`, containing a task ID, requested target, execution status, match state/reason, and the group's sourced findings. Validation rejects match states inconsistent with the group's findings. The existing flat `findings` array is retained. Planning responses omit the global discovery banner; ordinary DiscoveryAgent responses retain their existing contract and UI. Failed groups render “Search incomplete” rather than a completed zero-result search. The response cards and saved task panel show each group's own state.

Checks executed for this correction:

- `npm run lint`, `npm run typecheck`, and `npm run build` passed.
- Complete default suite: 72 passed, 18 opt-in integration tests skipped. The new cases cover hospital/package exact-exact, none-exact, exact-none, none-none, and related-exact; cached package continuation for every pair; exact hospital/package with empty doctors; legacy metadata recovery; strict group validation; budget invalidation; and partial search failure. Heart-doctor Cardiology/Mumbai/exact and unsupported underwater brain surgery with related Brain & Spine Surgery regressions passed.
- Opt-in live planning test: 1 passed against the configured Supabase project. It verifies task match metadata after reload, cached package groups, saved budget/context, ownership isolation, execution links, and existing discovery regressions using temporary accounts.
- Authenticated local production `/assistant`: the four requested turns (initial knee replacement in Mumbai, packages, USD 6000 budget, hospitals) passed. Initial results had separate exact hospital/package groups; package and hospital continuations displayed only the relevant exact group. Refresh restored the conversation, USD 6000 budget, plan, and both task match states.
- An additional real catalog search with a USD 4000 budget produced exact hospitals and no packages. Both independent states remained visible in the response and plan panel after refresh. No false global zero-result heading appeared. Captured browser error/warning logs were empty in the checked flow.
- The changed files and 25 generated client assets contained neither configured server secret in an exact-value scan. Temporary browser and integration identities and their owned data were cleaned up.

Files changed: `lib/agents/schemas.ts`, `lib/agents/treatment-planning/agent.ts`, `lib/agents/treatment-planning/tasks.ts`, new `lib/agents/treatment-planning/results.ts`, `components/assistant/assistant-workspace.tsx`, `components/assistant/care-plan-panel.tsx`, new `components/assistant/catalog-results.tsx`, `tests/planning.test.ts`, `tests/planning-live.test.ts`, and this validation document.

These aggregation browser checks used the local production build with remote Supabase. They do not establish that the new commit has deployed to Vercel. Previously saved assistant messages remain readable in their original flat format; new planning turns return result groups.

## Scope

These tests used synthetic catalog records and disposable accounts. Existing discovery remains available when the planning RPC is missing; a planning request returns a migration-needed state. The earlier layout fixture established layout only; the authenticated checks above establish the tested persistence and button behavior.

External contact, bookings, payments, travel, visa submissions, and clinical decisions are unimplemented. Catalog prices remain sourced sample values; no live offer or provider availability is implied.
