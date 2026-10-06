# MedBridge product design audit — 6 October 2026

Governing skills: medbridge-product-design, medbridge-visual-design and medbridge-design-critic. Baseline: 6499860. Screenshots: external `medbridge-worldclass-20261006` artifact directory.

## Scope and preserved contracts

Inspected public route shells, streamed directories and profiles, homepage snapshot, navigation, currency/language controls, conversation submission/history, account sections, Recover tasks/timeline, email-link authentication and portal shell/read models. Existing publication, evidence, consent, role boundaries and AI tools remain authoritative. The supplied WebP and visible MEDBRIDGE name stay together in navigation.

## Findings before implementation

| Priority | Observation | Design response |
|---|---|---|
| P0 | Price renders the conversion as the largest number, with the original buried in metadata. | Original provider price primary everywhere; approximate converted amount secondary, with source/date available. |
| P1 | Six desktop navigation destinations compete with four overlapping groups; Discover and Compare occur twice. | One Explore menu, direct Packages, Compare and Recover, dedicated AI action. Full journey routes retained in drawer/footer. |
| P1 | Detail heroes repeat descriptions from Overview/About; repeat primary actions in the sidebar; facts are unstructured spans. | Identity + essential facts + focused action panel; price belongs in package action panel, profile facts become a clear list. |
| P1 | Doctors and hospitals share broad two-column result grids; packages share horizontal rows. | Doctor roster, hospital editorial rows, package collection with explicit price panels, treatment topic index. |
| P1 | Mobile filters occupy too much space before results. | Native accessible filter disclosure on mobile; desktop filter rail remains visible. |
| P1 | Account opens into a settings form rather than saved activity. | Saved options as default; personal navigation leads with activity, profile/preferences recede. |
| P1 | Portal navigation uses repeated building icons and a generic sidebar. Mobile sidebar has no modal focus trap. | Distinct role accent/density, section grouping and real modal drawer semantics with Escape/focus return. |
| P1 | Portal resource loading is a spinner/message rather than the content structure. | Workspace row skeleton with a screen-reader status. |
| P2 | Homepage opening uses a familiar text-left/card-right composition and five passive steps. | Question-led central input and three real journey destinations. |
| P2 | Detail skeleton uses the same avatar for hospital, doctor and package. | Kind-specific identity, facts, pricing and related-section skeletons. |
| P2 | Multiple CSS generations supply competing hardcoded dimensions. | A documented final system layer with shared tokens and scoped compositions; avoid broad accidental portal overrides. |
| P1 found in browser review | Streamed save controls hydrate with an enabled client state against a disabled server state when authentication finishes before the result boundary. | Use React's hydration snapshot for the button readiness gate; existing save ownership and commands stay unchanged. |

## Composition decisions

- Public: open ivory canvas, compact wayfinding, green ink, editorial hierarchy, quiet evidence.
- AI: centered first-use conversation, simple input, results progressively revealed; preserve existing execution and context.
- Hospital: institutional identity and location, specialty/service sections, evidence and provider-confirmation action.
- Doctor: compact monogram identity with affiliation, credentials and consultation uncertainty.
- Package: title/provider, original price, conversion second, explicit inclusions/exclusions/conditional/unknown services.
- Compare: published pair first, destination setup secondary when unavailable; no unsupported winner.
- Account: saved/recent activity first. Recover: user-created journey/tasks/timeline, coordination language only.
- Provider: publication workspace; Support: scan-oriented queues; Admin: compact governance. Existing actions remain functional.

## Review plan

Capture before/after for major routes, critique screenshots, fix concrete defects, repeat. Verify 320/375/390/430/768/1024/1440 widths, keyboard navigation and original currency precedence. Run unit tests, lint, TypeScript, production build, route/streaming smoke, actual AI, personal and portal scenarios. Scores are subjective design assessments, separate from functional and clinical signoff. No score will be inferred from build success.
