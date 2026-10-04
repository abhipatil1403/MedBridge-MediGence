# Governed reference catalog release — 4 October 2026

## Published collection

Five real reference organizations were prepared as private drafts, submitted as frozen revisions, individually reviewed, approved and explicitly published using the signed-in Super Admin's ordinary governed workflow. No service-role publication bypass or provider membership was used.

| Exact hospital branch | Doctor | Frozen sections | Sourced claims |
| --- | --- | ---: | ---: |
| Kokilaben Dhirubhai Ambani Hospital, Andheri West, Mumbai | Dr. Sandeep Wasnik | 5 | 26 |
| Deenanath Mangeshkar Hospital, Erandwane, Pune | Dr. Hemant Wakankar | 7 | 34 |
| Max Super Speciality Hospital, Saket, New Delhi | Dr. Balbir Singh | 6 | 29 |
| Manipal Hospital, Old Airport Road, Bengaluru | Dr. Sunil G Kini | 6 | 29 |
| Apollo Hospitals, Greams Road, Chennai | Dr. Veerabahu Muthusamy | 5 | 28 |
| **Total** | **5 doctors** | **29** | **146** |

The anonymous canonical catalog contains **5 hospitals, 5 doctors, 2 treatments, 0 packages and 0 price estimates**. Supporting taxonomy contains India, five cities and three specialties. Seven specialty offerings, five procedure associations and two explicitly documented facilities are published. Synthetic records remain excluded.

Sources are **18 distinct official public pages**, including provider branch pages and doctor directories, the National Portal of India and Pune district government. The [source register](reference-data-onboarding.md#initial-collection) links every page; the immutable starter manifest maps each populated field to its source. Actual collection time: **2026-10-04 07:53:07 UTC**. Editorial review due: **2027-01-02**. Repeated source rows supporting different published revisions are not additional independent sources.

## Meaning of review and verification

Public provenance identifies these listings as **MedBridge reference information / admin_reference**, with external sources. It does not identify them as provider-submitted information.

Organization name claims were verified against the named official source for identity only. Other populated claims were approved following source review. Canonical hospital and doctor verification remains pending; publication does not independently verify licensing, accreditation, clinical quality, medical suitability or appointment availability.

No accreditation attestation or international patient service was published. Doctor experience and consultation modes remain unknown. No packages, accommodation inclusions, fees, quotes, outcomes or appointment slots were inferred. Apollo's doctor profile does not establish current appointment availability. Offerings apply only to their documented branch and country.

## Implementation and release fixes

- Existing frozen revisions, field and section reviews, explicit publication, canonical projection, RLS and audit history are reused.
- Admin and Super Admin own reference onboarding. Provider and Support roles cannot create or publish reference records, including through direct RPC access.
- Every populated claim binds its immutable revision, exact supported value and source. Missing, conflicting or stale evidence blocks publication.
- Public provenance excludes private evidence, supported values, reviewer identities, raw notes and private files. Draft revisions remain private; earlier published revisions remain visible during editing.
- Bounded starter preparation writes drafts only. Reviewed taxonomy preserves existing IDs and clears unsupported synthetic clinical, travel and pricing descriptions.
- Live UI checks exposed a missing reference submission form and a workspace refresh that closed the review dialog. Both were corrected without replacing the review workflow.
- Production catalog loading exposed statement timeouts when one snapshot launched 21 concurrent reads. A per-snapshot queue now allows at most three simultaneous statements. Reads still use ordinary public RLS, preserve failures and have no synthetic fallback or cross-request cache.
- Repeated publication checks on historical relation rows also exceeded the hosted statement limit. Migration `20261004112000_public_catalog_read_budget.sql` evaluates the existing visibility boundary once per statement and entity, restricts candidates before expensive checks, and adds review/submission lookup indexes. It preserves source, expiry, relationship and publication checks; equivalence against the previous boundary passed with both empty and positively published local catalogs.
- Agent prompting and compound summaries use each result's actual provenance instead of describing the entire catalog as demo data.
- Live page checks inspect rendered provider content as well as HTTP status, because a failed server-component stream can return HTTP 200.
- The requested assistant sequence exposed a doctor-affiliation request being treated as hospital details, and a catalog-gap question entering case intake. Explicit hospital references now invoke the existing doctor search with only the published hospital-affiliation filter. An unspecified procedure, mode or availability is not inferred from that association. Catalog-gap questions reread the referenced published record and preserve the specific gap summary; existing case-intake questions retain their route when case context is present.

## Validation

Complete checks include all ten existing PostgreSQL validation scripts on a fresh 25-migration install plus the follow-up performance migration, the new visibility-equivalence/query-plan check (11 database scripts total), migration reapplication, the actual starter manifest through governed RPCs, 74 local portal checks, 74 hosted portal checks, and 26 anonymous public privacy checks.

The earlier full live opt-in suite passed **790/790** tests. After adding read-concurrency tests, a later run passed **791/792**; its only failed gate was the direct Cloudflare model probe returning HTTP 429 / `MODEL_RATE_LIMIT`. A targeted retry returned the same limit. Following the final reference regressions, the full application/live catalog/persistence suite passed **794/794 tests in 25 files**, explicitly excluding that unavailable direct-model probe. No failed application assertion was suppressed, and this external model gate is not reported as passed. Final lint, TypeScript and production build all passed, including the doctor-affiliation and information-gap fixes.

Production responsive checks cover 320, 375, 390, 430, 768, 1024 and 1440 pixels for the reference onboarding workspace, five-hospital directory, hospital detail and expanded doctor provenance. Measured document widths stayed within the viewport. The browser's earlier server-render errors were retained in its log; no new console warning/error occurred after the database fix during these successful page checks.

| Gate | Result |
| --- | --- |
| Application regressions, live persistence and isolated public catalogs | 794 passed, 25 files |
| Direct Cloudflare model probe | Blocked by HTTP 429 / MODEL_RATE_LIMIT; previously passed in the 790-test run |
| PostgreSQL/RLS/role/publication/privacy scripts | All 11 passed |
| Visibility equivalence and migration reapplication | Passed on empty and five-provider local catalogs |
| Portal integration | 74 local and 74 hosted checks passed |
| Anonymous production privacy | 26 checks passed after the final migration |
| Production discovery smoke | Passed after the final runtime deployment |
| Five hospital and five doctor pages | Rendered canonical content, not only HTTP 200 |
| Ten production assistant turns | Passed on final application commit; canonical findings only, no invented packages |
| Responsive layout | Seven required widths passed |
| Lint / TypeScript / production build | Passed |

The live sequence confirmed Mumbai → Kokilaben, retrieval of that hospital, empty published packages, clarification for a nonexistent second package, honest comparison clarification when only one hospital had been shown, and no fabricated accommodation inclusion. The missing-information turn described the absent packages/prices without inventing case intake. Mumbai/Pune comparison returned Kokilaben and Deenanath, explicitly left prices/accommodation unknown, and selected no clinical winner. The Pune hospital search returned Deenanath; the final affiliation request returned **Dr. Hemant Wakankar**, with procedure expertise, consultation mode and appointment availability left unconfirmed. All ten requests returned HTTP 200 with persisted conversation state. This validates the catalog-backed runtime flow; the separately rate-limited direct Cloudflare probe remains an availability limitation.

## Deployment

The final application fix is commit `28a808e4b80ab48d75f8de19619b7bbe974b4f37` on `main`. Its exact Vercel deployment was confirmed **READY**: `medbridge-medigence-gvglgbsyo-abhipatil1403-gmailcoms-projects.vercel.app` (`dpl_7RDEkdr4gJPKcQhxCKSZhi5VaMUM`), serving the production alias. A subsequent documentation-only commit records the completed release checks; its final hash/status is reported in the task response.

All three hosted reference onboarding/performance migrations are applied; the user confirmed the final `supabase db push` output. Isolated live runtime testing uses ordinary QA patient accounts; they are disabled afterwards, with immutable audit retained. Positive provider publication fixtures remain confined to local QA databases.

## Remaining limits

This is a carefully bounded initial collection, not a complete provider directory. Source facts can change and require editorial refresh. Unknown information needs current confirmation from the provider. Public source review is not clinical advice or a booking guarantee. Additional providers must pass the same claim, section, approval and explicit publication gates.

Production: [MedBridge](https://medbridge-medigence.vercel.app/hospitals).
