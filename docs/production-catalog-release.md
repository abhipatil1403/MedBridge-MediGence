# Production catalog release — 4 October 2026

## Scope

Preserves the current application, portals, publication commands and agent runtime. Public catalog data now passes one database visibility boundary. Synthetic rows remain available for private QA and isolated regression fixtures; normal anonymous or patient catalog queries cannot select them.

### Modules and routes

- Database: canonical visibility, publication proof, active organizations, visible parent references, dated affiliations/services, current accreditation evidence and safe provenance. Internal verification columns are not granted to anonymous or ordinary authenticated clients.
- Catalog repository: explicit public hospital/doctor columns, shared safe provenance, canonical hospital–doctor/package relationships and treatment destinations derived from published offerings. Search retains parsing, ranking and filters; accreditation filters use actual current published evidence.
- Existing Discovery, Comparison and requirement tools consume this same anonymous repository. Missing information stays unknown. No new agents or QA fallback were added.
- Public UI: `/`, `/discover`, `/hospitals`, `/doctors`, `/packages`, `/treatments`, `/compare`, and the hospital/doctor/package/treatment detail routes. Provider detail sections are conditional on published information. Package price/source/duration/disclaimer have separate layout. Structured package services retain included/excluded/conditional/not_confirmed and contradiction semantics.
- Admin: city source classification and source reference controls. Portal hospital/doctor reads use the safe column list while private verification history keeps its existing access checks.

### Applied migrations

- `20261004100000_production_catalog_visibility.sql`
- `20261004101000_public_catalog_column_privacy.sql`

Both applied successfully to hosted Supabase by the owner. Existing synthetic cities receive a synthetic classification; no hosted QA reference/provider was relabeled as real. Both migrations were reapplied locally to verify idempotence. History, drafts, source records and canonical data are preserved. Reverting the visibility migration alone would reopen the previous synthetic exposure; any rollback must retain the public boundary and match repository column permissions.

## Validation

- Full suite: **736 passed, 23 files**, including opt-in live Cloudflare, authenticated conversation/planning/intake persistence and verification regressions.
- Final catalog/search changes: **43 targeted tests passed**, including real anonymous PostgREST against an isolated local database, published accreditation filtering, canonical relationships, Discovery, Comparison and requirement evidence.
- Nine native PostgreSQL validation scripts passed: base RLS, agent RLS, planning, documents, verification, portal RLS, portal workflows, catalog governance and the new production catalog scenario. New scenario verifies draft/rejected/archived exclusion, source classification, all nine provider record kinds, evidence/review/correction/resubmission/approval/publication, V1 preservation during V2 draft and approval, explicit V2 replacement, archive and retained history, package states and private columns.
- **70 hosted portal workflow checks** passed against the local production server: provider/support/admin/patient roles, evidence upload, assignment preservation, section review, audit, consent, cross-tenant isolation and privately published synthetic exclusion from public pages and existing agents. Fixture accounts are disabled, files removed and organizations archived after each run; immutable audit history is retained.
- **23 read-only hosted anonymous checks** passed: ten catalog tables empty, internal verification columns denied, private document/revision/review/audit access denied, search/package/provenance helpers empty.
- Lint, TypeScript and optimized production build passed.
- Responsive checks: 320, 375, 390, 430, 768, 1024 and 1440. Local published package/hospital/doctor/treatment details and empty public directories/Discovery have no horizontal overflow or broken images. Price blocks have no collisions. Browser console/hydration errors were absent.
- Public smoke checks cover parsing with an empty catalog, source classification, suggestions, error/empty states, workflow/auth/portal routes and hidden seed detail URLs.

## Test isolation and reproduction

Positive first-party publication is tested **only** in disposable local databases named `production_catalog_*`, as selected by the owner. The browser fixture is clearly labeled LOCAL VALIDATION and is not a real provider or offer. There is no production fixture switch.

`validate-production-catalog.sql` rolls back by default. `keep_fixture=1` is reserved for the isolated local browser database. `pg-catalog-reference-fixtures.sql` is guarded against use outside these named local databases.

Historical live agent tests read synthetic catalog facts from a test-only file generated by `export-local-catalog-fixture.mjs`; Cloudflare and private Supabase persistence remain live. The persistence alignment option reads synthetic treatment IDs without changing hosted catalog data. These tests are separate from the real anonymous PostgreSQL/RLS publication tests.

The loopback-only `tests/fixtures/local-catalog-gateway.mjs` adapts the Supabase REST prefix to local PostgREST running as **anon**. It strips external authentication headers and exposes no auth, storage or service-role API.

Read-only hosted gate: `node --env-file=.env.local scripts/validate-public-catalog-live.mjs`; set `MEDBRIDGE_EXPECT_EMPTY_CATALOG=1` only when no legitimate listing is expected. Existing opt-in portal and discovery smoke scripts now assert production visibility rather than seed minimum counts.

## Current limitations

Production correctly has **no real published providers or reviewed public reference data yet**. No fabricated first-party listing was published to populate it. Administrators must source, review and publish legitimate countries/cities/specialties/treatments before publishing real provider listings. Unavailable data does not become a substitute recommendation or clinical assurance.

Next.js may stream an HTTP 200 shell before resolving an unavailable detail route. Such responses resolve to the noindex not-found page and contain no QA listing; release checks verify this rendered outcome as well as the database exclusion.

See the assessment for the pre-change inventory and enforcement decisions. Responsive screenshot proof is stored outside Git in the Codex visualization folder under `production-catalog`.
