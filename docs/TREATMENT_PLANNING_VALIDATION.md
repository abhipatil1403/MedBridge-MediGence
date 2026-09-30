# Treatment planning validation — 30 September 2026

## Verified

- Complete default automated suite: 65 passed, 18 optional integration tests skipped. Planning tests exercise real discovery/search code with a synthetic catalog and controlled persistence/provider dependencies.
- Planning coverage: creation, reuse, saved context, USD budget updates, INR handling without conversion, two/three-tool execution, clarification, duplicate prevention, actual review status transitions, approval boundaries, ownership, overlapping turns, bounded tool permissions, model failure, provenance, clinical boundaries, partial failure, cancellation, and a new specialty request independent of the previous surgery.
- Live DiscoveryAgent reliability suite: 8 passed against the configured Supabase catalog and Cloudflare provider. These live tests use an in-memory execution store and do not establish live care-plan persistence.
- The care-planning migration was applied in a disposable local PostgreSQL 18.1 database alongside existing migrations. Both `validate-agent-rls.sql` and `validate-planning-rls.sql` passed with rolled-back test data. Checks include owner isolation, revoked case membership, denied patient writes/RPC execution, duplicate constraints, execution foreign-key scope, approval constraints, lease tokens/concurrency, and repeated atomic saves.
- Supabase response timestamp offsets are normalized and tested before validating restored plan data.
- Browser checks used the production `/assistant` sign-in shell and a separately labeled local HTML fixture rendered from the actual `CarePlanPanel` component. At 320, 375, 390, 430, 768, and 1440 pixels, neither had horizontal overflow. Panel tasks, progress, optional budget text, and expanded provenance were visible. No console errors were captured in these checked views.

## Pending live validation

The configured remote Supabase database did not have `care_plans` when the opt-in planning test was attempted. It stopped before creating temporary test users. CLI database access requires the user's database password, which has not been supplied to this session. The user has been asked to run `supabase db push` in the repository terminal to apply `20260930090000_care_planning.sql`.

After that migration, run `tests/planning-live.test.ts` with `RUN_PLANNING_LIVE=1` and the ignored local environment loaded. The test creates temporary identities, checks real multi-turn persistence/context/reviews and owner isolation, and removes its test data afterward.

Authenticated manual planning, browser refresh of a persisted remote plan, live planning with Cloudflare unavailable, and the deployed Vercel application have not been verified in this checkpoint. The layout fixture does not establish persistence, hydration, or button-action behavior. Existing discovery remains available when the new planning RPC is missing; a planning request returns a migration-needed state.

External contact, bookings, payments, travel, visa submissions, and clinical decisions are unimplemented. Catalog prices remain sourced sample values; no live offer or provider availability is implied.
