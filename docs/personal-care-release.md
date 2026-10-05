# Personalized care experience and Lifetime Recover

## Release scope

Build from the actual production baseline `314dae73a227125496b8746f9ef04b731db91612`, preserving the five published, sourced reference hospitals and doctors. The brief's older baseline and empty-catalog statement are superseded by the existing released state.

Implemented shared currency/preferences, interface localization, account and saved records, accessible navigation, the existing assistant runtime in a lazy public panel, and persistent non-clinical recovery coordination.

## Integration boundaries

- Extend `profiles` for presentation and contact preferences. Reuse email-link auth, browser Supabase client, portal notification preferences and notifications, conversations, care plans, private case documents and consent-aware Support cases.
- Saved records and recovery records use owner-only reads, including for staff. Atomic database commands validate publication and ownership before writes. Recovery support requests share the user's written request only; association does not grant staff access to the recovery journey.
- FX is an indicative presentation conversion. Original amounts/currencies and matching budgets are unchanged. Use ExchangeRate-API's open access daily endpoint, a server-only cache, timestamps, explicit staleness, attribution and original-price fallback. No additional key is required. See [official open access documentation](https://www.exchangerate-api.com/docs/free).
- Visitor assistant state expires after 24 hours. An opaque HttpOnly cookie identifies a private server-only record; the visitor has no Supabase auth identity or patient-table permissions. Tool restrictions deny private reads and actions. A bounded daily quota and turn lease limit public use. Login import is explicit and transactional; it reuses the existing conversation and plan tables.
- Page context is resolved against published catalog records on the server and read through the existing registered tools. No browser-supplied provider claims are accepted.
- Hindi and Marathi are static interface translations. Official provider descriptions, names, source snippets and source URLs remain canonical. Presentation dates, numbers and prices use the selected locale.
- Recovery tasks, milestones and due dates are user-created. A provider association does not imply monitoring, a confirmed appointment or clinical care. Reminders are visible in the account; there is no email/SMS scheduler or booking integration.

## Database rollout

The user applied both migrations successfully to the linked Supabase project:

- `20261004120000_personal_care_experience.sql`: preferences, owner saves/searches, recovery journeys/tasks/events/document and Support associations, server-only FX cache, and authorized commands.
- `20261004121000_temporary_assistant_sessions.sql`: private visitor state, leases/quotas/expiry and atomic authenticated import.

No additional environment variable is required for the free FX endpoint. Existing Supabase server credentials and Cloudflare configuration remain required for the assistant and account APIs.

## Validation evidence

- Fresh installation of all 28 migrations and seed in isolated PostgreSQL; all 13 database validation scripts passed. These cover existing portal/publication/verification/reference behavior, account and recovery owner isolation, staff privacy, Support consent, and temporary conversation authorization/import.
- Complete regression suite: **854 tests passed**, including opted-in Cloudflare, persistence, planning, discovery, case intake, agentic execution, published-catalog and reference gates. Final UI follow-up: **133 focused tests passed**, followed by **86 checks** after the final price/timestamp presentation changes.
- Locale inventory: **1,347 declared interface strings**, with zero missing Hindi or Marathi translations. English remains the canonical interface source. Date-only values preserve their calendar day; timestamp displays use the browser's zone after deterministic UTC hydration.
- Live personal-care API gate: **38 checks** covering genuine FX source/timestamp, profile/preferences, saves and searches, owner isolation, recovery task completion/timeline, actual consented Support, owner/staff notifications, registered recovery reads, clinical boundaries, page context, visitor references/history and explicit import. QA accounts use `example.invalid`, are disabled after the gate, and their Support cases are closed.
- Existing portal integration: **74 checks passed**, including consent revocation, with additional role-separated Provider/Admin/Support/Patient browser checks. Test accounts and records are disabled or archived after completion. Public privacy gate: **26 checks**. Genuine reference gate confirms five published hospitals, five doctors and 146 reviewed claims without invented prices or accreditation.
- Browser checks: anonymous preference and save persistence; English/Hindi/Marathi UI; drawer and assistant focus/Escape behavior; canonical hospital page context and real tool response; signed-in profile saving, saved-item import and assistant-history import; persistent recovery journey, provider association, due task completion, milestone and actual Support request visible in Patient Help.
- Responsive matrix: 320, 375, 390, 430, 768, 1024 and 1440 pixels. Release checks also include lint, TypeScript, production build, repository/browser-bundle secret scanning and console inspection.

Final Git commit, exact matching Vercel READY deployment, and deployed workflow results are recorded in the release response after the push.

## Catalog read performance correction

Browser testing exposed statement timeouts when several prefetched pages loaded complete governed catalog snapshots simultaneously. Public reads now share the existing three-statement queue within each server process. Catalog navigation links disable speculative prefetch. Ordinary public RLS checks still run for every read; no service-role catalog bypass or publication cache was added. A regression test verifies the concurrency bound across simultaneous snapshots and failure release.

## Practical limits

Production currently contains no packages or prices. Positive conversion, package-save and publication tests must use the isolated `production_catalog_personal_*` database; do not seed production.

The free model provider has usage limits, and the free FX endpoint updates daily. Stale indicative rates are labeled and bounded to seven days; missing rates fall back to the original amount. Lifetime Recover records user coordination rather than clinical monitoring, clinician-reviewed milestones, appointments or emergency care. Existing secure document workflows are linked; private document contents are not sent to the public assistant. No unsupported voice, attachment, payment or booking control was added.
