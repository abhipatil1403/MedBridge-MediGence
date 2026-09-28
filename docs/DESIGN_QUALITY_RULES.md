# MedBridge design quality contract

This contract applies to every screen, not only the home page. Each design review must answer: who is acting, what information do they need, what action can they take, and what happens next? Reference depth comes from workflows and information architecture, never from copying MediGence branding, text or assets.

## Never ship

- Generic SaaS hero templates, excessive gradients, floating glass cards, glowing borders, decorative dashboards, huge empty headings, or repeated identical card grids.
- AI sparkle motifs or a universal chatbot bubble; an agent interface appears only where it helps a real task.
- Fake statistics, testimonials, patient outcomes, doctor credentials, hospital accreditation, availability, live data, prices, progress bars, or simulated AI streaming.
- Lorem ipsum, unsupported clinical claims, vague “AI-powered” repetition, excessive badges/pills, or every page written as marketing.
- Buttons that do nothing, dead links, unexplained disabled controls, or forms without validation/result states.
- Scroll animation everywhere, heavy motion, or mobile pages that merely shrink desktop layouts.
- Cards when a table, list, timeline, form or split layout better matches the decision.

## Required in design review

- A real task and next action per page; visible system state, timestamp, ownership and verification where relevant.
- Source/provenance and last review for medical, provider, price, visa and travel information. Unknowns are explicit.
- Filters where comparison breadth requires them; tables for side-by-side costs; timelines for patient journeys; forms for structured intake; side panels for context.
- Progressive disclosure that does not hide critical terms, exclusions, urgency or safety information.
- Clear separation of patient input, AI interpretation, automated action, human review and final clinical decision.
- Accessible semantics, keyboard paths, focus return, reduced motion, readable density and purposeful mobile layouts.
- Distinct empty, loading, error and success states. Each failure has a recovery action and keeps already-entered data.
- Consistent spacing and restrained visual hierarchy; screens may differ in composition to suit tasks.

## Acceptance gate

For each milestone, test a patient and a staff scenario at mobile and desktop widths. Reject a screen if data is decorative, a CTA has no destination, a claim lacks evidence, a state can be confused with confirmed care, or the user's next action is unclear. Design signoff is separate from clinical/content/security signoff.
