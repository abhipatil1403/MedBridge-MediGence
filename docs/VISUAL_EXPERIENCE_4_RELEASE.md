# MedBridge Visual Experience 4.0 — 7 October 2026

Baseline: `49ffb2e`. The three governing MedBridge skills were applied before implementation; see [the audit](VISUAL_EXPERIENCE_4_AUDIT.md). This release changes the presentation and interaction of the existing product. Agents, tools, database publication rules and authentication remain authoritative.

## 1. Screens redesigned

Homepage; visitor and authenticated AI entry; public hospital and doctor directories; hospital, doctor and package detail identities; package directory presentation; comparison; Account and Recover introductions; shared footer. Treatment exploration gains an interactive homepage composition. Existing discovery, treatment detail, sign-in and operational portal workflows were regression checked rather than claimed as newly redesigned.

## 2. New visual compositions

An asymmetric question and connected journey; an editorial question-to-published-option demonstration; one institution identity beside supporting entries; a compact clinician roster; a selectable treatment explorer; a contrasting original-price collection; offset Plan/Treat/Recover navigation; an evidence margin; a final conversation entry; and a brand conclusion in the footer. Institution, clinician, offer and personal-workspace layouts have different structures.

## 3. Design system

`app/visual-experience.css` adds forest `#123f35`, sage `#dce6d4`, warm ivory and editorial serif emphasis to the existing MedBridge system. Open arches and a connected path are repeated with purpose, rather than making every section identical. Native fonts avoid another download. Controls retain clear focus, pressed and disabled states. The supplied WebP, favicon configuration and visible MEDBRIDGE wordmark remain the brand identity.

## 4. AI experience

Both visitor and authenticated first use share the bridge glyph, conversational question and calmer composer. The textarea remains real, labeled and connected to the existing runtime. Focus treatment, suggested requests, real busy status and result-entry motion communicate actual state. Conversation history, ordinal references, evidence, original prices, owner context, approvals and consent retain their existing handlers.

Actual browser checks: five published Pune packages; “the second one” resolves to Executive - A at INR 5,900; guest history survives navigation/reload; authenticated AI reads the synthetic owner's saved doctor and practical recovery task. No medical interpretation, provider monitoring or booking capability was added.

## 5. Homepage

The first viewport now combines a usable conversation entry with a visual explanation of Plan/Treat/Recover. The following sections change composition and visual weight. The example uses a real published Pune package. Provider identities retain the existing catalog order and state that the selection is not a recommendation. Treatment choices change the actual published description and link; they do not generate clinical advice. Price collections retain original currencies, conversion disclosures and provider-confirmation states.

## 6. Imagery strategy

No legitimate provider-photo fields are present in the current public catalog. New identity artwork uses actual initials and geometric arches. It is typographic, not fabricated photography or a provider logo. The journey diagram is navigation, not a map, clinical progress indicator or promise of recovery. No hospital, doctor, accreditation, outcome, availability, price or image was invented.

## 7. Motion and interactions

Short focus, hover and press transitions; a pulse only during a real assistant request; and a brief entry transition for actual findings. `prefers-reduced-motion` disables animations, transitions and smooth scrolling. Native disclosures expose evidence, uncertainty, comparison and secondary footer routes. The treatment explorer uses pressed buttons and a polite live preview. There are no fake typing sequences or simulated activity.

The existing “Compare these packages” AI shortcut failed live by requesting destination clarification. It now opens a working published-fact matrix on the comparison page. Prices, inclusions, exclusions, duration and coordination services come directly from the same two records. Unknown stays unknown; there is no winner. The agent runtime was not changed to conceal that limitation.

## 8. Mobile

Checked 320, 375, 390, 430, 768, 1024 and 1440px. Public matrix: 105 observations across 15 families. Private Account, Recover and authenticated AI: 21 observations. Final scoped homepage and expanded-comparison checks add 14 observations. Completed observations have one visible H1, an accessible main region and no page overflow. The last mobile hero correction was re-rendered at every required width.

The starter strip scrolls inside the composer with 44px touch targets. The journey becomes a compact horizontal navigation composition. Profiles and original-price panels stack. Tables scroll locally with a labeled keyboard-focusable region. The mobile header retains the official logo, visible name and AI action. The floating contextual launcher remains absent on phone detail pages.

## 9. Before/after screenshots and iteration

Evidence folder: `C:/Users/Lenovo/.codex/artifacts/medbridge-visual4-20261006`. Baseline files begin `before-`; pass and final files are distinguished by name. Production captures and the deployment receipt are added after push. Loading-only or partially painted captures are not treated as completed visual reviews.

| View | Before | Reviewed after |
|---|---|---|
| Homepage desktop | `before-home-desktop.png` | `home-final-1440.png` / production homepage |
| Homepage phone | `before-home-mobile.png` | `final-home-mobile.png` / production homepage |
| AI first use | `before-ai.png` | `after-ai-desktop.png`, `after-ai-mobile.png` |
| Provider directories | `before-doctors.png`, `before-hospitals.png` | `final-doctors-390.png`, `final-hospitals-1440.png` |
| Package | `before-package.png` | `final-package-1440.png`, `final-package-390.png` |
| Comparison | `before-compare.png` | `compare-expanded-1440.png`, `compare-expanded-390.png` |
| Private continuity | prior release's QA baseline | `final-account-1440.png`, `final-recover-390.png`, `after-ai-coordination.png` |

Actual review fixes: inherited beige hero rectangle and excessive headline wrapping; stacked composer identity; invisible backing surfaces; clipped doctor monogram; nested AI textarea field styling; ambiguous comparison shortcut; missing localized composer/footer attributes; undersized mobile note; and the intrinsic-width overflow caused by the compact starter strip. Each substantive composition was inspected in a rendered browser and corrected before release acceptance.

## 10. Design Critic

**PASS — 94/100.** This is a subjective assessment of rendered layouts and real interactions, not independent user research, clinical-quality evidence or an accessibility certification.

| Criterion | Score |
|---|---:|
| Product clarity | 15/15 |
| Visual hierarchy | 14/15 |
| Visual craft | 14/15 |
| Information architecture | 9/10 |
| Distinctiveness | 9/10 |
| AI experience | 10/10 |
| Trust | 10/10 |
| Responsive quality | 9/10 |
| Accessibility | 4/5 |

Page assessments: homepage **95**; AI **95**; hospital directory/profile 93; doctor directory/profile 93; package directory/profile 94; comparison 92; Account 91; Recover 92. Existing discovery and treatment surfaces remain 90+ under the retained system. Homepage and AI meet the stronger brief's target after the composition and interaction fixes; the overall score is not rounded up to that target.

Excellent:

- The first viewport has a recognizable navigation signature and an immediate usable question entry.
- The homepage varies identity, conversation, interaction, price and journey compositions.
- Real published facts, original currencies and explicit unknowns remain visible.
- Visitor discovery and private continuity work through the existing runtime.
- Mobile composition, native disclosures and keyboard boundaries reduce unnecessary interface weight.

Weak:

- The small published inventory limits exploration and meaningful destination comparison.
- Typographic identities cannot provide the context of legitimate provider photography.
- Wide comparison data needs local horizontal scrolling on phones.
- Several compatible CSS generations remain; formal screen-reader and broader browser/user studies are outstanding.

Critical problems: none open in the reviewed scope. **P0:** none. **P1:** none after the overflow, clipped identity and broken shortcut were corrected. **P2:** consolidate older CSS during future component work; obtain approved provider imagery through governance; conduct broader accessibility and patient/family usability testing. **Design decision: SHIP.**

## 11. Remaining weaknesses and boundaries

Production inventory is five hospitals, five doctors, seven packages, three treatments and one country. No preferred provider/destination or clinical suitability is established. Conditional, undated tariffs require provider confirmation. General named-package AI comparisons may need clarification; the preset comparison action uses the working factual disclosure. Bookings, payments, medical review and clinician monitoring are not active. Account and Recover show the user's saved records and user-created coordination, not inferred clinical progress.

## 12. Tests and accessibility

Unit suite: **890 passed, 39 skipped**; 24 files passed, seven skipped. Environment-dependent skips are not claimed as passes. Separate current live gates: **74 portal**, **38 personal-care/API**, **26 read-only public catalog/privacy**, and **15 local streamed routes**. No synthetic public catalog records were added. Disposable QA users were disabled, cases closed and organizations archived; immutable audit history remains and human accounts were untouched.

Full lint, direct TypeScript and `git diff --check` passed. Browser checks include treatment selection, Save doctor → Account, journey/task creation → reload persistence, private AI context, visitor reference continuity, exchange source/time, conditional accommodation and ten unknown services. Mobile dialog Shift+Tab/Tab stay inside; Escape restores launcher focus. The footer disclosure opens with Enter and retains all pathway links. Hindi and Marathi both render at 320px without page overflow. The declared interface catalogue has 1,372 messages; final language coverage and secret-scan results are in the release receipt.

Reduced-motion behavior is verified in source; the available browser controls do not provide an OS reduced-motion emulation gate. No formal screen-reader certification is claimed. Operational permission and publication gates were rerun; prior positive operational screenshot reviews are not represented as newly performed redesign work.

## 13. Build

**PASS:** optimized Next.js 16.3.6 webpack build, including TypeScript and route output. Final composer-width, dictionary, activity-copy and native-disclosure corrections are included in the final source gate. The exact committed Vercel build is the final deployment gate. Local development compilation timings are excluded from performance claims; no percentage speed-up is asserted. Streaming/caching boundaries and backend fetch architecture remain intact.

## 14. Git

Branch: `main`, based on `49ffb2e`. Exact SHA and push result are recorded after commit in the external `release-receipt.json`, avoiding a self-referential commit hash. Screenshots, local environment and temporary QA broker remain outside Git. No migration or new environment variable is required.

## 15. Deployment

Production: https://medbridge-medigence.vercel.app. Completion requires the exact committed deployment to reach READY and pass the production browser/route checks recorded in the external receipt. A Git push alone is not deployment proof. The final receipt also records post-deployment mobile hierarchy, comparison and clean-console checks.

## 16. Final decision

**SHIP** for the reviewed design and functional gates. Release completion is recorded only after the exact deployed commit is READY and its production checks pass. The limitations in sections 10–12 remain explicit.
