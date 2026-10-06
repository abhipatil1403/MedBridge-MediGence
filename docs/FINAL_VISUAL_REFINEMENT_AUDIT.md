# Final production visual refinement — 7 October 2026

Baseline: `8e2149f`. Read all three mandatory MedBridge design skills before implementation. Production captures are in `C:/Users/Lenovo/.codex/artifacts/medbridge-final-refinement-20261007`.

## Actual findings and decisions

| Priority | Finding | Bounded refinement |
|---|---|---|
| P1 | Package inclusion, exclusion and conditional information share paragraph styling; price identity competes with metadata. | Explicit service groups, a distinct original-price block and a quiet source strip. Preserve all facts and unknown states. |
| P1 | The existing package comparison requires local horizontal scrolling on phones. | Semantic comparison factors with two labeled option values stacked on mobile; preserve column identity and factual differences without a winner. |
| P2 | Hospital and doctor rows rely on text and dividers; identity, location and source have similar weights. | Profile identity, location object, a small specialty cluster and separate evidence strip; one featured entry in unchanged order, compact supporting rows. |
| P2 | Treatment rows have large blank margins and paragraph-like counts. | Compact published provider/package counts and documented locations, derived from the existing snapshot. No new treatment content. |
| P2 | AI first-use suggestions look like rectangular buttons; result summaries begin as counts rather than an answer. | Compact wrapping suggestion controls, a conversational factual count and semantically distinct result objects. Keep the real runtime and busy state. |
| P2 | Account navigation, Recover summaries and operational status objects could scan more clearly. | Personal navigation icons, real coordination nodes and labeled status markers, with restrained workspace styling. Keep all permissions, consent and actions. |

## Visual contract

Retain the current brand, official logo and visible MEDBRIDGE name, headline, homepage sections, navigation and backend. Profiles are entities; specialty capsules are factual attributes; service capsules are explicit inclusions/exclusions/conditional states; price blocks establish original currency; evidence strips explain provenance; journey nodes are navigation or user-created coordination, never clinical progress. No extra stock imagery, fabricated photos, geography, services, credentials, rankings or availability.

The final pass removes phone horizontal scrolling from the composer and package comparison. Capsule groups wrap; operational tables retain their accessible local scroll where their density requires it. Motion remains tied to real interaction and respects reduced motion. Streaming, selective prefetch and secondary evidence boundaries stay intact.

## Gates

Screenshot, inspect and refine all 15 requested public/personal families and the three authenticated QA portals. Check 320/375/390/430/768/1024/1440px, keyboard and Escape/focus return, source/currency/unknown states, real AI follow-up, private Account/Recover persistence, portal permissions, publication and consent, privacy/security, full suite, lint, TypeScript, final production build and exact Vercel deployment. Report subjective design scores separately from test results and disclose any unverified gate.
