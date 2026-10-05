# Governed packages and original pricing

## Scope and existing architecture

Baseline: `6b2a51d4ecaf47fcc3d69c185034b93cef5367fa`.

The existing canonical `packages` table, organization/hospital relationships,
immutable `provider_revisions`, frozen submission items, field/section review,
explicit publication, public provenance and RLS already implemented most of the
workflow. This release extends their missing capabilities: nullable amounts and
durations, ranges and price semantics, all eleven service states, exact branch
projection, current claim evidence at approval/publication and original-currency
budget/reference handling. It adds no agent or parallel package/publication system.

Provider records retain `provider_submitted`; the bounded sourced collection is
`admin_reference`/external. Preparing a source collection never submits, approves
or publishes a provider record. Providers and Support cannot publish. The existing
change request/correction/revision path preserves v1 until explicit v2 publication.

## Source collection checked 5 October 2026

Seven health screening packages, two already published hospital branches, one
represented treatment: Health Checkup. No sourced surgical package was established.

| Provider | Packages | Original prices | Type and limitations |
| --- | --- | --- | --- |
| Deenanath Mangeshkar Hospital, Erandwane, Pune | Basic Package; Executive - A; Senior Citizen; Executive - B; Well Woman - I | INR 3,450; 5,900; 3,400; 7,850; 4,770 | Package price; payable tariff effective 15 July 2026; prior appointment and additional test charges |
| Kokilaben Hospital, Andheri, Mumbai | Whole Body Check Male - III; Platinum (Male) | USD 260; 1,445 | Published conditional Air Tanzania tariffs; source undated; current price, eligibility and availability require provider confirmation |

Package sources:

- [Deenanath official Health Packages](https://www.dmhospital.org/health-packages)
- [Kokilaben official Travel Partners](https://www.kokilabenhospital.com/patients/internationalpatients/travel_partners.html)

The General Medicine taxonomy is sourced from [Manipal's General Medicine department](https://www.manipalhospitals.com/oldairportroad/specialities/general-medicine/).
It does not establish a specialty department at either package provider. Separately
sourced branch treatment offerings require their own section review/publication.

Every supplied field is associated with its relevant source, retrieval date and
review status. Unsupported duration, stay, transfer, interpreter, follow-up,
rehabilitation, local transport and visa assistance stay unconfirmed. Only the
Platinum listing establishes conditional guest-room accommodation; it does not
establish inpatient stay. No wholesale marketing text, booking slots, surgical
prices, discounts or clinical outcomes are added.

## Application behavior

- Original amount and currency remain canonical. Ranges retain both bounds;
  starting prices remain lower bounds; contact-provider/unpublished values are NULL.
- Existing cached ExchangeRate-API conversion and the eight display preferences
  are reused. Converted amounts are indicative, include source/time/original price,
  and never overwrite the database. Missing/unusable rates prevent numeric ranking.
- Budget checks use unrounded converted bounds. Overlapping ranges and starting
  prices cannot establish that the full cost meets a maximum. Accommodation is
  evaluated independently and prevents an unsupported full match.
- Comparison/reference resolution uses actual displayed IDs/order and original
  pricing. Missing, stale, starting, tied or overlapping values cannot establish a
  unique cheapest package. No numeric amount is inferred from missing legacy zero.
- Package pages and hospital cards use canonical relationships. Inquiry links reuse
  the existing consented Support case form with editable package/provider/treatment/
  source context. Saving reuses Account and owner RLS. Recovery remains separate.

## Completed publication — 5 October 2026

All seven packages passed review against the actual official sources. The signed-in
Super Admin inspected the nine frozen sections (seven packages and two exact branch
offerings), approved their individual field claims and sections, approved each
submission, and separately confirmed publication. Anonymous reads between approval
and publication established that approval did not expose the records.

Released collection: **7 published; 0 remaining drafts; 0 approved but unpublished;
0 changes requested; 0 rejected; all published revision 1.** These counts describe
the seven source-backed packages, not historical private QA records.

The two publication submissions are `4f6fa0b2-eef8-413f-8bcc-efea234d3f07`
(Kokilaben, three sections) and `1b8dc773-1522-4a82-8cdf-0967d8eb86b9`
(Deenanath, six sections). The catalog now has seven packages, five hospitals,
five doctors, three treatments and four specialties. Its 268 public hospital field
claims preserve all 146 original claims, plus 114 package and eight offering claims.
All public records remain actual external references; no QA fixture was promoted.

Production pages:

- [Basic Package](https://medbridge-medigence.vercel.app/packages/mb-basic-package-5a226519a945)
- [Executive - A](https://medbridge-medigence.vercel.app/packages/mb-executive-a-4d2ed3cc2b33)
- [Senior Citizen](https://medbridge-medigence.vercel.app/packages/mb-senior-citizen-52ee2de4aa65)
- [Executive - B](https://medbridge-medigence.vercel.app/packages/mb-executive-b-378b2c2f518a)
- [Well Woman - I](https://medbridge-medigence.vercel.app/packages/mb-well-woman-i-10f86342e3e7)
- [Whole Body Check Male - III](https://medbridge-medigence.vercel.app/packages/mb-whole-body-check-male-iii-5194fc12e855)
- [Platinum (Male)](https://medbridge-medigence.vercel.app/packages/mb-platinum-male--6ade80ca11ac)

Source collection timestamp: 5 October 2026; package claim review due 4 November
2026. Deenanath lists included consultations/diagnostics and excluded additional
tests. Kokilaben lists only conditional Platinum accommodation; all unsupported
service facts and all package durations remain unconfirmed. Review/publication
does not establish clinical quality, suitability, live availability or a quote.

## Final workflow corrections

- Public package details expose only the published revision number. The consented
  Support inquiry now includes package, provider, location, treatment and revision;
  its existing owner/request/timestamp columns complete the context.
- Cheapest/detail selections retain their actual displayed source list through
  ordinal and service follow-ups. A new search still establishes a new boundary;
  out-of-range ordinals never fall back to guessed records.
- Selected-package ordinal comparisons reuse the existing two-record tools;
  named city comparisons retain their existing destination path.
- Service questions answer the published conditional/unconfirmed state directly.
  Pair comparisons preserve their original-price summary and requirement cards.
- Hospital gap answers scope packages to the retained treatment. Health screenings
  cannot fill missing knee-replacement package evidence.
- Secondary public evidence is collapsed in an accessible native disclosure.
- The provenance RPC runs after the catalog table reads to reduce contention;
  ordinary anonymous RLS, publication checks and failure propagation remain intact.

## Validation

| Gate | Actual result |
| --- | --- |
| Standard suite | 886 passed, 39 live opt-in skipped; 925 total, including 69 package cases and the follow-up chain regression |
| Opt-in integration suite | 922 tests proven passing after the corrected range assertion was rerun; one direct Cloudflare model check remains rate limited |
| PostgreSQL installation | Fresh baseline and seed, then both release migrations applied: 30 migrations total in isolated local databases |
| Database scripts | All 14 passed, including package workflow, original currencies/ranges/NULLs, all service states, claim gates, owner isolation and v1/v2/changes/archive privacy |
| Real source publication fixture | Seven source-backed packages and two branch offerings passed the real existing review/publication RPC path in isolated local PostgreSQL |
| Source fixture anonymous reads | 74 passed using actual migrated PostgREST/RLS, not a mocked repository |
| Hosted privacy | 26 anonymous Supabase public/private boundaries passed |
| Production account/Recover/visitor/Support integration | 49 passed through actual Vercel and hosted Supabase, including real saved package refresh/isolation/unsave and consented package revision inquiry |
| Production portal integration | 74 passed through actual Vercel and hosted Supabase, including provider changes/resubmission, immutable revisions, review/publish, authorization, QA exclusion and immediate access removal on consent revocation; cleanup disables disposable accounts |
| Production package catalog | 106 passed: all seven pages, original prices, service/evidence/revision/privacy boundaries, search, Discovery and eight currency endpoints |
| Production reference regression | All 268 sourced claims, five hospital pages, five doctor pages and ten actual Vercel Assistant turns passed; knee-replacement package gaps and doctor affiliations remain scoped |
| Production package Assistant | 42 checks across 12 actual Vercel requests passed: discovery → cheaper → second → conditional accommodation → first/selected comparison; unsupported surgery and context-free ordinal clarification; independent treatment/location/budget and accommodation gates; original prices, asymmetric services and unknown duration |
| Hosted runtime regression | Actual hosted persistence, ordinary public RLS and configured model passed the health-screening/unsupported-treatment/hospital-gap chain; no mocked database |
| Responsive | Public listing/detail and Admin review at 320, 375, 390, 430, 768, 1024, 1440: no page overflow; public package elements not clipped; Admin wide history tables retain internal scroll; provider builder has 43 controls |
| TypeScript, lint, build | Passed |
| Localization audit | 0 missing of 1,372 declared interface messages; new dynamic package labels additionally translated |
| Configured secret scan | 396 repository files and 30 browser assets: no configured private secrets |
| Provider builder browser console | No captured errors or warnings |
| Smoke | Existing routes/discovery passed against both the new local application with hosted catalog and the actual Vercel production URL |
| Production currency endpoint | All eight display currencies passed; real source and updated timestamp verified, cached rates were not stale |

The old planning live gate collapsed USD 4,700–5,640 into a USD 4,700 total. Its
expectation verifies the preserved maximum and UNKNOWN under USD 5,000; that live
planning gate passed. Earlier direct Cloudflare checks returned `429 MODEL_RATE_LIMIT`.
The fresh direct model check on 5 October passed an actual structured response;
the configured model and existing deterministic failure handling are retained.

Both hosted migrations were confirmed successfully by the user's terminal:
`20261005100000_governed_package_pricing.sql` and
`20261005101000_public_package_revision.sql`. The revision DTO was independently
read through anonymous production RPC. No password entered chat.

Public detail and approved Admin evidence review were inspected at 320, 375, 390,
430, 768, 1024 and 1440 pixels. Public package information has no clipped elements
or page overflow. Admin review dialogs fit each width; wide history tables use
their existing horizontal scroll containers. Provider builder checks at the same
widths retain 43 usable controls. Public INR conversion visibly preserves original
USD 1,445, rate/source/time and estimate wording. Desktop/mobile publication proof
is saved in the local release artifact directory.

## Limitations and release verification

Only seven health-screening packages were supported by the reviewed sources.
No surgical package, booking, clinical recovery promise or production first-party
package is claimed. First-party publication positives use isolated local QA.
Kokilaben tariffs remain conditional, undated and subject to provider confirmation;
Deenanath's listed tariff has no stated end date. Unknown services remain unknown.
Temporary provenance/tool read failures were observed during concurrent live gates.
After the read ordering correction, the sequential reference gate completed all ten
turns, and the package gate completed all twelve requests. The runtime also correctly
denied an unsupported model-proposed search in the budget-planning request; its
required catalog tasks completed, the gap was preserved and no package was invented.
The failure remains visible in the bounded activity history rather than being
hidden or replaced by fabricated data.

Release checks before commit: standard regression, affected package/reference
regressions, all 14 database scripts, live portal/account/catalog/privacy/currency/
Assistant gates, build, TypeScript, lint, localization and secret audit passed.
Commit message: `feat: publish governed provider packages`; target branch: `main`.
Exact GitHub/local/Vercel SHA and READY alias are verified after commit and push;
the final response records that SHA because this file cannot embed its own hash.
