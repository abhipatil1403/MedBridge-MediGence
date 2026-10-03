# Provider → Admin → Public publication

Baseline: `062eb4ccd6378ecf05af3f9746964a0caf70a2a6`. This release extends the existing portal commands, immutable provider revisions, private storage, public catalog and agent tools.

## Connected workflow

1. A provider saves an organization and separate locations, specialties, treatments, doctors, facilities, accreditations, international services and packages. Drafts remain private.
2. Documents can be associated with a specific record. Review comments and replacement uploads preserve the previous evidence history.
3. Submission freezes eligible revisions. Administrators receive persisted notifications and opening a submission creates an audit event.
4. Each frozen record receives an append-only section decision, comment, reason and optional scoped evidence reference. Administrators approve sections; assigned Support reviewers can request changes or evidence without gaining approval/publication permission.
5. An overall change request unlocks provider edits. The dashboard links directly to the affected section and displays the exact correction, reviewed revision and current publication.
6. Resubmission freezes the corrected revisions. Overall approval requires every frozen section's latest decision to be approved, with current accepted evidence. Approval alone leaves public data unchanged.
7. Explicit administrator publication projects frozen snapshots into the existing canonical catalog. Later drafts cannot replace published data.
8. Public profiles, Discovery, package search, Comparison and requirement matching consume that governed catalog. Published secondary locations can match hospital searches; package location remains its documented location.

## Database and authorization

The operator applied both migrations to hosted Supabase:

- `20261004090000_provider_section_reviews.sql`: immutable section decisions, RLS, approval/publication gates, section/opening audit and notifications, protected dashboard/summary read models and allowlisted public projections.
- `20261004091000_preserve_section_reviewer.sql`: preserves the assigned reviewer when the first section decision starts review. The live test caught this assignment bug; the regression checks both access and subsequent authorized review.

Historical completed submissions retain their existing behavior. New and pending submissions require section reviews. Direct database commands enforce the gates. Private document paths, reviewer comments and raw verification evidence are excluded from public projections. Publication approval is separate from factual verification.

No new agents, routes, public datasets or required environment variables. Existing `/api/portals`, `/provider`, `/admin`, hospital/doctor/package detail pages and catalog services are extended. Server keys remain in ignored configuration.

## Regression evidence

- Full suite: **721 tests in 22 files**, including all enabled live agent and persistence gates.
- All eight PostgreSQL validation scripts passed: general, agent, planning, documents and verification RLS; portal RLS, workflow and governance. These include tenant isolation, Support approval denial, unresolved/current-evidence approval gates, frozen publication, append-only review history and preserved assignment.
- Optimized build, TypeScript and ESLint passed.
- Repository scan found no configured server credential values in tracked or non-ignored files.
- **70 live integration gates passed locally**, exercising all nine record kinds, private upload, exact section feedback, correction/resubmission, approval/publication, INR currency preservation, current accreditation, hospital/doctor/package public HTML, the actual existing assistant tools, cross-tenant denial, consent, role spoofing and real audit actors. Public discovery smoke checks passed after cleanup.

The browser test additionally performs draft saving, submission, section changes, provider correction, resubmission, section approval, overall approval and explicit publication with isolated synthetic accounts. **63 responsive checks passed** across provider feedback/form, admin dashboard/section history, Support, patient help and all three public detail pages, at widths 320, 375, 390, 430, 768, 1024 and 1440. Refresh preserved saved decisions and versions; browser consoles had no errors or hydration failures. Browser-discovered city-selection and review-table overflow issues were corrected and rechecked.

Synthetic organizations, submissions and listing records are archived, files removed, support requests closed with revoked consent, and test accounts disabled after checks; immutable audit and revision history remains. Earlier archived QA requests were also closed so they do not remain in operational queues. Anonymous reads confirmed zero public QA hospital/package listings.

## Reproduce live checks

With the ordinary application server running:

```powershell
$env:MEDBRIDGE_PORTAL_LIVE_TEST='1'
$env:MEDBRIDGE_TEST_ORIGIN='http://127.0.0.1:3000'
node --env-file=.env.local scripts/validate-portals-live.mjs
```

Set the origin to the production URL to validate deployment. Optional `--browser` exposes isolated actor sessions through a temporary localhost-only broker using the existing auth callback. Finish browser checks with `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4318/finish`, then wait for successful cleanup. Run `scripts/smoke-discovery.mjs` after cleanup, since its expected catalog counts exclude temporary QA providers.

## Product limits

Provider information is labeled according to its provenance; publication does not independently verify clinical claims. Missing package services remain unconfirmed, conditional services remain incomplete matches, and conflicting inclusion statements require confirmation. Documents retain the existing accepted (`approved`), rejected and expired lifecycle; replacement requests use review comments plus a new private upload. Existing invitation sharing remains manual. This release does not activate bookings, payments or clinical decisions.
