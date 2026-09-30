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

## Scope

These tests used synthetic catalog records and disposable accounts. Existing discovery remains available when the planning RPC is missing; a planning request returns a migration-needed state. The earlier layout fixture established layout only; the authenticated checks above establish the tested persistence and button behavior.

External contact, bookings, payments, travel, visa submissions, and clinical decisions are unimplemented. Catalog prices remain sourced sample values; no live offer or provider availability is implied.
