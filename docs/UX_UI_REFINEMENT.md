# MedBridge UX refinement and verification hardening

## Baseline audit — recorded before UI edits, 2 October 2026

Baseline commit: `de6cddfe43fd11cdef5832ed886e2451644f0779`.
The deployed site was inspected with a disposable signed-in QA account and public route screenshots at 1440 and 390 pixels. Screenshots are stored locally under the task's `medbridge-ux-20261002` visualization directory. This is an evolution of the existing website and runtime.

| Surface | Primary / supporting / optional information | Baseline problem and intended correction |
|---|---|---|
| Home | Search / care pathways / sample profiles | Too many equally prominent links and repeated notices; retain search as the primary action, tighten section rhythm and sample metadata. |
| Discover | Search and results / filters / provenance | Long notice and tiny labels; keep useful filters and result order, shorten notice, readable metadata and clear recovery states. |
| Treatment, hospital, doctor, package directories | Search and entity names / location, specialty, price / all facts | Shared list layout is useful; align header, controls, metadata and next actions. |
| Compare | Selections and comparison / limitations / record details | Wide table requires deliberate mobile wrapping; keep evidence and sample price caveats visible. |
| Hospital, doctor, treatment and package details | Entity identity / relevant facts and next action / FAQs | H1 and section scales vary; repeated prominent CTA blocks; align headers and supporting hierarchy. |
| Second opinion, consultation, treatment plan | Pathway or planning form / required preparation / broader discovery | Too many panels of equal weight; use dividers and one clear next action. |
| Medical travel, recovery | Pathway / preparation / discovery | **Empty deployed main content**: page service slugs differ from seeded catalog slugs. Correct existing identifiers and show a recovery state if a service is missing. |
| Auth callback, success, failure | Actual sign-in state / return destination / explanation | H1 normal weight; unify title and action system without changing link authentication or return validation. Success requires a real session. |
| Care Workspace, empty | Composer / examples and conversations / optional case and documents | H1 computed at **28px, weight 400**, versus 64px/650 public titles. Three columns, empty findings, repetitive context compete with the composer. |
| Care Workspace, discovery | Entity results / requirements / activity and provenance | Request, result counts, match explanations, tasks, sources and next steps repeated in main and sidebar. Large treatment-slug lists and raw record IDs are prominent. |
| Care Workspace, verification | Provider, status, field outcomes / exact evidence / refresh and history | **“Catalog records 0”** falsely suggests no verification result; recorded activity appears first. Raw outcome enums and too much trust text. Render by result type and move completed activity below answers. |
| Planning, case, research, documents | Relevant result / safety and ownership / technical detail | Preserve all features, approvals, citations and checklist controls; disclose optional context and source details close to the result. |

### Shared system planned before implementation

- Preserve MedBridge's existing deep teal, warm paper, lime accents, Arial typography and restrained visual language.
- Shared PageHeader, H1/H2/H3/body/meta tokens, content grid, spacing, control sizes, focus and status styles. Strong Care Workspace title must use the public title system.
- Primary: actual answer and next action. Secondary: requested criteria, important unresolved evidence and safety boundaries. Tertiary: full facts, dates, task activity and provenance through semantic disclosures.
- Reserve cards for entities and meaningful actions. Use lines, whitespace and compact lists for explanations.
- Keep display/reference order and all backend authorization unchanged. Verification fixtures stay in tests and cannot enter the production source collection or ordinary public UI.
- Check all seven requested viewport widths, keyboard navigation, console, first-time journey, cross-feature regressions and actual Vercel runtime after implementation.

## Implementation and measured validation

### Provider verification

The write path derives `catalogSourceKind` from the catalog snapshot, never from a model hint. Synthetic records cannot use official-source retrieval, previous research or verification cache promotion. Report validation rejects synthetic authoritative evidence, unsupported credential/registration evidence, incorrect counts and misleading completed states. Existing reports remain readable; older explicitly named demo checks retain their demo label. No migration, agent, paid API, dependency or mandatory environment setting was added.

| Scenario | Actual result |
|---|---|
| Live synthetic Mumbai provider | Synthetic / demo / not live; zero verified, 15 unresolved; authoritative source unavailable. |
| Live reviewed Kokilaben contact check | Phone verified from exact official telephone-directory evidence; email not found; overall partially verified (1 supported, 1 unresolved). |
| QA verified | One address supported by the isolated exact fixture statement. |
| QA partial | Address verified; email not found. |
| QA conflicting | Both different address values and their two source snippets retained; neither value selected. |
| QA not found | Successful source retrieval with no requested email statement, distinct from retrieval failure. |
| QA unverified / incomplete | Source unavailable and timeout remain explicit outcomes; no external value or verified field created. |
| QA stale | Previously supported evidence is stale under an explicit 7/21-day test policy. |
| QA internal only / not applicable | Catalog fact does not become verified; hospital credentials scope is not applicable. |
| Freshness | Current, aging, stale and unknown projected by configurable policy; original timestamps unchanged. |
| Refresh / history | Real new report ID and completion time; previous report retained; browser history showed two actual saved runs. |

Fixtures live only in `tests/fixtures/provider-verification-fixtures.ts`. They use reserved `.invalid` domains, explicit QA provider/source identities, types, authority tiers, exact statements, fixed retrieval/completion dates and expected states. An explicit test-mode guard and try/finally source cleanup prevent runtime admission. The optional static QA gallery is exported outside the repository and served locally; it is not an application route. Its banner says TEST / QA ONLY and NOT REAL PROVIDER EVIDENCE. The production client scan found no fixture-source strings.

Live phone proof: the official [telephone directory](https://www.kokilabenhospital.com/contacts/phone_directory.html) supplied “For OPD Appointments +91 (22) 4269 6969”. The browser displayed the exact quote, source URL, official-source flag, tier 1, retrieval timestamp and **unknown freshness** because no applicable policy was configured. Source retrieval does not prove that a phone number is still operational or establish clinical suitability. Missing email evidence was not fabricated.

### Shared design and presentation

- Preserved MedBridge's warm paper, deep teal, lime accents, logo and Arial family. `app/ui-system.css` supplies typography, spacing, controls, focus and status tokens rather than independent page designs.
- H1 uses 36–64px, weight 700, 1.08 line height. All 16 measured main route titles, including Home and Care Workspace, measured 64px/700 on desktop. Authentication uses the same shared header with a deliberate compact 32–44px variant.
- `PageHeader` standardizes eyebrow, title, lead and support. Shared content width is 1216px, with responsive 18–32px gutters; heading, body and metadata scales are defined centrally.
- H2/H3 are consistently bold; body is 16px with 1.6 line height; metadata is 13px. Controls use a shared 4px radius, meaningful labels, focus outlines and minimum heights.
- Workspace uses two columns. Results appear before activity. Completed activity, full facts, provenance, successful criteria, matching evidence and optional next steps are semantic disclosures. Unknown/unmet criteria and incomplete operations stay visible.
- Verification is its own primary result: provider, actual status, counts, date and actions, followed by field rows and exact evidence. No generic “Catalog records 0” block appears. A check with zero verified fields cannot display “Partially verified”; conflict and stale labels remain explicit.
- Optional case and document panels remain functional and contextual. Documents open for a relevant active workflow; unrelated verification does not make an empty checklist compete with the result. File confirmation, mapping, manifest and privacy behavior is unchanged.
- Catalog cards show name, location, sample identity and real next actions; long attribute lists and record IDs moved to details. Comparison avoids repeated provider facts, keeps missing options/criteria visible, and puts long treatment, infrastructure, inclusion and qualification lists in labelled cell disclosures. Research preserves exact citations and quotes with source metadata in details.
- Directory/service explanations use whitespace and dividers. Cards remain for entities and meaningful actions. Shorter copy and demo notices reduce repeated caveats without concealing sample status.
- Navigation marks the active route with `aria-current`; details keep the relevant directory active. Footer includes Packages, Medical travel and Recovery. Existing empty travel/recovery pages now resolve the actual seeded service slugs; `/travel` redirects to `/medical-travel`.
- Quote/booking-labelled links now honestly offer a planning brief or consultation exploration. Loading, retry, unavailable, empty, partial and completed states use the shared hierarchy and human wording.

### Visual and accessibility evidence

The local seven-width matrix measured **112 route/viewport combinations** across Home, Assistant, Discover, Treatments, Hospitals, Doctors, Compare, Second opinion, Packages, Medical travel, Recovery, Consultation, Treatment plan and hospital/doctor/treatment details. Actual `innerWidth` was checked against 320, 375, 390, 430, 768, 1024 and 1440; every page had `scrollWidth <= clientWidth`. An initial measurement against an inactive tab was discarded and rerun on the tab receiving the viewport override.

The deployed application was also measured at all seven widths across the public routes, plus populated comparison and a saved assistant verification/history conversation. Package detail and auth failure received additional seven-width checks (119 deployed public route/width measurements, plus seven for populated comparison and seven for saved verification/history). Nine fixture screens passed another 63 width measurements. Exact measurements and captures are saved outside Git in the local evidence directory.

Browser keyboard checks passed: mobile menu opens/closes and Escape restores the toggle; filter dialog focuses its first control, traps forward/backward Tab, closes on Escape and restores the Filters button. Skip-to-content now focuses the actual main landmark (all destinations use `tabIndex=-1`). Active navigation, visible focus and readable semantic field disclosures were checked. Status is conveyed with words and icons as well as color. Shared success, warning and error text/background contrast ratios are 7.49:1, 6.20:1 and 6.38:1. This is targeted accessibility QA, not a certification or a full screen-reader audit.

Baseline and after screenshots were reviewed for the listed routes, on desktop and mobile, including empty workspace, discovery, provider verification, auth states and fixture evidence. The primary improvements are stronger titles, shorter sample notices, clearer next actions, fewer repeated summaries and collapsed audit information. Medical travel and Recovery now have actual content. Some full-page captures include the sticky header at the scroll position; viewport captures are retained for the verification proof. The baseline auth-success capture showed pending session confirmation; the final success capture used a validated session.

Evidence directory (local, not committed): `C:/Users/Lenovo/.codex/visualizations/2026/09/28/01a0e744-9b65-70d2-a99d-922ab45741f7/medbridge-ux-20261002`.

### User journeys and regressions

1. First-time production walkthrough: Home search → Discover → treatment → hospital results → Mumbai hospital → related doctor → destination comparison → Care Workspace → new natural-language hospital request → result → Check provider information → address evidence → document setup → reload → continued verification refresh → saved history. Missing provider document requirements stayed unavailable and package preparation stayed disabled. No real patient data was used.
2. The exact discovery → first hospital verification → address evidence → unresolved fields → refresh → history sequence passed through authenticated APIs locally and on Vercel. Browser evidence, refresh and history actions were checked independently. Ordinal identity and display order were preserved; the nonexistent second hospital prompted clarification without executing tools.
3. Planning under USD 6000, Mumbai/Pune comparison, requirements and multi-operation matching, patient-reported case intake, external research and document coordination passed authenticated live checks. Explicit compound comparison destinations were used; unavailable Pune matches remain visible and do not become an invented comparison result.
4. Documents: explicit synthetic hospital/service target, unavailable source checklist, confirmed user-supplied requirement, private QA-only PDF upload, owner download, cross-owner denial, mapping, manifest preparation, reload and removal invalidation passed via APIs. Browser setup/reload was checked; browser file-picker upload itself was not automated.

### Actual validation gates

| Gate | Result |
|---|---|
| Complete Vitest suite | **689 passed, 20 skipped, 709 total; 16 files passed, 5 files skipped.** |
| Provider verification + new UX fixture suites | **134 passed** (105 provider verification + 29 UX/fixture tests). |
| Existing deterministic agent / planning / requirement / compound / reference / research / document regressions | Passed within the full suite. |
| Live authenticated API checks | **32 local + 32 deployed passed**, counted separately from Vitest. |
| Discovery smoke | Passed locally and on the deployed site: inventory, parser, filters, sort, suggestions, empty/error states and workflow routes. |
| PostgreSQL / RLS | Five existing SQL validation scripts passed: catalog, agents, planning, documents and provider verification; owner isolation and browser write restrictions retained. |
| Hosted authorization | Anonymous access rejected, another account denied conversation and private file, verification rows hidden and browser report inserts rejected. |
| Lint | Passed with zero errors/warnings. |
| TypeScript | Passed (`tsc --noEmit`); production build type checking also passed. |
| Optimized production build | Passed; all existing routes and `/travel` redirect generated. |
| Secret scan | No configured Supabase server key or Cloudflare token in 270 source/build files; no QA fixture strings in client bundles. Four served production pages and 13 JavaScript assets also passed. |
| Actual Vercel | Production deployment READY and public alias tested; authenticated and browser checks used the real deployed application. Final commit/deployment identity is verified separately in the release response. |
| Browser console | No errors, warnings or hydration messages during production route and workspace checks. |

The 20 skipped tests require optional live-test flags/account credentials; they are reported as skipped. The separate disposable-account API harness did exercise live model/catalog persistence and authorization, but does not relabel skipped Vitest tests as passed. Temporary users and owned API test records/files were removed.

### Remaining limits

- Synthetic catalog providers, prices, packages and destinations remain illustrative, unverified and unbookable. No clinical quality assessment, diagnosis, new agent, booking or payment workflow was added.
- Real verification coverage is limited to the existing reviewed source collection. Strict extraction can miss prose/images or JavaScript-rendered facts, and external sites can time out or rate-limit. Missing evidence does not mean a provider is unsuitable.
- Freshness remains unknown without an applicable configured policy; live timestamps are actual retrieval times. Tests exercise explicit policies without rewriting production dates.
- A single matching synthetic provider cannot supply two real alternatives; compound comparison asks for explicit options or exposes missing results. No missing providers or relationships were invented.
- Private document retention/submission limitations remain: no automatic retention schedule or connected provider delivery channel. A prepared manifest does not mean submission.
- Baseline screenshots show actual captured states, including pending auth confirmation; no fabricated “before” success screen. Responsive measurements and targeted keyboard/contrast checks are not a complete assistive-technology audit.

### Release identity (report items 30–32)

Commit message: `style: unify and simplify MedBridge user experience`.
The exact commit SHA, equality of HEAD/origin/main/GitHub/Vercel and final clean status are reported after the commit and push, avoiding a circular self-referential commit hash in this document.

