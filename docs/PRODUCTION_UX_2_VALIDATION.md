# Production UX 2.0 validation

Date: 5 October 2026. Baseline: e3215107e364bf2627dd20ba695efb274af172c9.

## 1. Root cause and architecture

The repository loaded one catalog using 21 separate network requests, limited to three concurrent requests. This produced repeated publication/evidence checks across several request waves. Directory/profile composition also awaited data without meaningful route structure; the homepage awaited the catalog before its question was rendered. Discovery repeated its server search on client mount.

An isolated populated PostgreSQL profiler revealed 17,587 claim-validation calls for 38 provider records. Planner predicate ordering evaluated expensive claim checks before narrowing the source and canonical record. Merely merging the network requests initially still took 7.5–8.8 seconds in the populated QA database. The final SQL materializes exact candidates and validates the same frozen claim/review predicate once per relevant revision. No persisted visibility cache is introduced.

The new public_catalog_snapshot RPC uses SECURITY INVOKER, caller RLS, explicit public projections and one coherent MVCC statement. React request caching deduplicates all repository consumers. Public provider profile and evidence are separate streamed secondary regions. Authentication, staff authorization, provider approval/publication, patient consent and private owner scopes are preserved. No globally cached private data.

## 2–3. Routes and measurement

The table is **baseline Vercel versus a local optimized production build using the real hosted Supabase database**. It is diagnostic evidence, not a same-host production speedup claim. Final deployed measurements and exact deployment identity are recorded in the release acceptance artifact. All values are milliseconds, sequential no-cache requests; complete means the entire streamed HTML body. Account/Recover/AI/Help HTML timing excludes authenticated client API readiness. A previous class-based primary heuristic is intentionally not used as proof of content readiness.

| Route | Before complete | Local/hosted DB complete | Before shell | Local shell |
|---|---:|---:|---:|---:|
| / | 6668 | 987 | 301 | 65 |
| /discover | 10432 | 995 | 279 | 133 |
| /doctors | 6642 | 979 | 251 | 25 |
| /hospitals | 6826 | 1001 | 297 | 27 |
| /treatments | 6537 | 952 | 280 | 27 |
| /packages | 6172 | 1157 | 272 | 32 |
| /compare | 6170 | 921 | 310 | 20 |
| /account | 267 | 26 | 264 | 25 |
| /recover | 247 | 20 | 245 | 19 |
| /assistant | 274 | 96 | 274 | 85 |
| /help | 270 | 51 | 269 | 49 |
| /doctors/mb-dr-balbir-singh-53f5b9a74a53 | 7352 | 1560 | 302 | 21 |
| /hospitals/mb-apollo-hospitals-greams-road-14523fabb8c5 | 7745 | 1504 | 273 | 37 |
| /packages/mb-basic-package-5a226519a945 | 7708 | 1425 | 284 | 65 |
| /treatments/chemotherapy | 7200 | 954 | 269 | 25 |

Actual hosted snapshot trials after both migrations: cold 2912 ms end-to-end / 1469.23 ms DB; warm 970 / 767.52 ms and 917 / 738.21 ms. This leaves real cold-start/network latency above the ideal one-second target. Page structure streams independently.

Baseline cold browser clicks to visible provider H1: doctor Veerabahu 9942 ms, Manipal hospital 9029 ms, Well Woman package 9937 ms. Local build with real hosted DB: 1942, 1098, 1398 ms respectively. Automation wall time includes locator/observation overhead; final same-host production clicks are measured after deployment. DOM navigation trace for doctor: feedback 5 ms, skeleton 116 ms, primary 1717 ms, secondary completion 2020 ms. No percentile/SLA claims are made from these small samples.

## 4–5. Loading and detail navigation

Page-specific directory, profile, comparison, account, recovery, AI and Support skeletons replace the generic loading screen. Immediate global shell, capture-phase navigation progress, primary catalog content, then secondary evidence/profile streams. Footer is hidden while route structure or primary result/form skeletons are loading. Clicked routes start at their hero; browser history restoration is left to Next/browser.

Expensive directories/detail links disable viewport prefetch; lightweight personal/AI routes remain eligible. Package-specific Support links also disable prefetch. Discovery initial data is reused; filter/search changes use Next-compatible native history and one cancellable API request, avoiding an additional RSC search. Four snapshot transport tests verify one request/no per-record reads, no invented fallback and rejection of incomplete evidence/relationship responses. The streaming script exercises 15 real production-build routes and checks structure precedes catalog data.

## 6–7. MedBridge AI

Public brand renamed to MedBridge AI. First view has one centered question/input and five short prompts. History, case context and documents are absent from the primary first-use view. Authenticated history uses a closed native dialog; mobile uses a drawer. Existing visitor/session ownership and explicit history adoption are retained.

After a request: optimistic user message, small conversational checking state, adaptive findings/clarification/comparison/coordination views and one visible next step. Criteria and evidence are collapsed. Internal tool execution panels, run IDs and raw record identifiers are removed from patient presentation; existing runtime and server audit/activity persistence remain. Real private query returned five Pune packages; “the first one” follow-up resolved Basic Package.

## 8–11. Directories and profiles

Doctors: compact two-column identity rows/avatars, specialty, provider, location, save/profile; only published supported filters. Profile includes published credentials, languages, procedures, associated hospital, honest consultation unknowns, related specialists and streamed field evidence. No invented clinician image or availability.

Hospitals: editorial provider rows, sourced status, specialties, actual package count. Detail uses section anchors, treatments, doctors, packages, published facilities, international services, contact and evidence, plus related hospitals sharing documented specialties. Unknown facts stay explicit.

Treatments: category navigation and editorial rows with actual associated provider/package counts; canonical details retain their clinical-review boundary and supported provider/package relationships.

Packages: provider/location and larger price first, original currency preserved, indicative conversion/rate disclosure, conditional tariffs highlighted, actual inclusions/exclusions, explicit unknown duration/service fields. Real Support inquiry continues carrying the published package revision. No booking/payment/medical-suitability claim.

## 12. Compare

Existing comparison service preserved. Clear three-control setup and honest insufficient-data state. The current catalog publishes only India, so a two-country public comparison cannot be manufactured. Unit/isolated agent regressions cover populated comparisons, missing facts and reference resolution.

## 13. Account, Recover and Support

Account: compact desktop sidebar; mobile section selector, Recovery/Support shortcuts and sign-out; profile grouped into personal information/location. Existing saves, history, plans, preferences, notification/privacy behavior unchanged.

Lifetime Recover: value first, compact creation; actual stage/next task/provider summary, documents, user-created tasks and timeline. A disposable UI-created journey was tested. No diagnosis-based milestones or clinical advice.

Patient Support: public page presentation, request creation/list/status, optional sharing collapsed and explicit consent retained. Staff portals retain their existing operational layout.

## 14–15. Responsive and accessibility

Requested viewport widths: 320, 375, 390, 430, 768, 1024, 1440. Browser artifacts are outside Git in C:/Users/Lenovo/.codex/artifacts/medbridge-ux-20261005. Directory rows, detail sidebars, account navigation and AI modal adapt independently. One mobile modal scroll region and reachable composer.

Final local browser matrix: 126 checks across 18 surfaces, with zero page horizontal overflows. A fresh normal session recorded no console warnings/errors. New conversation closes the history dialog and restores the first-use question. Doctor Retry restored the real profile after a simulated catalog failure. The catalog-call counter remained at 27 while the populated directory, mobile modal and navigation were inspected, confirming those visible links did not start background detail catalog reads.

Native history dialog keyboard/ESC/focus-return checked. Mobile navigation and AI ESC restore focus to their launchers. Existing skip link, labeled forms, required consent, modal focus trapping and reduced-motion handling retained. Locale catalogue: 1327 messages, zero missing Hindi catalogue translations; Marathi entries supplied in the same message dictionaries. No automated contrast certification is claimed.

## 16–18. Validation

- Complete default suite: 890 passed, 39 skipped, 24 passing files; skips are opt-in integration environments.
- Five opt-in tests passed: live planning persistence, case intake, tool execution/RLS/retry, governed packages and Cloudflare structured response. Historical seeded cases use an exported local synthetic file fixture; no synthetic production publication. Fixture adapter updated to the atomic RPC shape.
- Live portal integration: 73 gates; QA actors only.
- Live account/recovery/visitor/adoption/consent: 49 gates.
- Real published package Assistant: 42 gates.
- Governed package public/currency checks: 106 gates.
- Public catalog privacy: 26 gates.
- Fresh PostgreSQL install: 29 migrations and all 15 DB scripts; additional reference-predicate equivalence/rejection script passed against 268 reviewed claims.
- Atomic snapshot checks cover draft/approval/publication/revision preservation/archive transitions; private columns and anonymous/authenticated grants checked. Migration reapplication passed.
- Build, lint and standalone TypeScript passed. Private-secret audit passed against repository/browser assets.
- Four-second catalog transport delay showed profile structure with footer hidden; simulated failure produced a doctor-specific retry page. Test instrumentation lives only in a temporary Node preload outside the repository.

Release acceptance requires repeating public streaming/smoke gates, browser console/hydration checks and navigation measurements on the deployed exact commit. Those results belong to the separate final acceptance artifact, not inferred from local results.

## 19–20. Release identity

Requested commit: feat: redesign production ux and navigation performance. Push target: main. Exact local/GitHub/Vercel SHA, READY state and clean working tree are captured after deployment in the final acceptance artifact and release response. This document avoids a circular self-commit hash.

## 21. Limits

Cold database/network reads can exceed one second; streaming avoids blocking the shell. The public catalog currently has five hospitals, five doctors and seven health-check packages, one country, and sparse verified clinical/availability facts. No fake providers, ratings, photography or surgical offers are added. Currency conversion remains indicative and external-rate dependent. Cloudflare response duration varies. Secondary facts/evidence can arrive after primary identity. Viewport emulation does not replace physical-device/screen-reader usability testing.
