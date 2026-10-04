# Production catalog assessment — 4 October 2026

Baseline: `12f073e8e64e6291e1539e8b8f184ceef2268a12`.

## Findings before implementation

- Hosted canonical hospitals (25), doctors (41), packages (25), treatments (20), countries (10), services (10), and prices (160) are synthetic. No first-party provider is currently published. One active first-party organization remains in the private workflow.
- Synthetic hospital/doctor policies explicitly bypass verification; other public policies accept published synthetic references and packages. Labeling and cleanup do not prevent a future leak.
- All public details, search, Discovery, Comparison, and requirement matching already consume the anonymous catalog repository. Search is a security-invoker RPC. This is the correct shared enforcement boundary.
- Publication materializes immutable provider revisions into canonical tables. Draft edits preserve `published_revision`. Existing approval, section review, evidence, publication, audit and role checks must remain intact.
- Public profile helpers use different visibility checks. The image helper needs the same production rule. Some published child sections lack archive checks.
- Cities lack source classification. Add provenance consistently; existing cities default to synthetic. Do not relabel hosted fixtures as real.
- Structured package services already distinguish included/excluded/conditional/not confirmed; preserve this model and contradiction handling. Qualifications can contain an empty string; missing values must stay missing.
- Price and source label share oversized inline typography. Separate their layout. The home and directory copy also assumes demo data; empty arrays incorrectly trigger the demo notice.

## Implementation decisions

Use one private database visibility function from every public RLS policy and projection. Require non-synthetic provenance, explicit governed publication, current published snapshot, active organization, visible parents, and valid dates. Keep authenticated admin access separate for private catalog governance. Never add a public QA switch or fixture fallback.

Reuse publication functions through guarded wrappers and existing canonical relationships. Keep historic and draft records intact. Add a safe public provenance projection without private notes, actors, storage paths, signed URLs, or audit metadata.

Positive publication and revision tests will use a disposable local database, as explicitly selected by the user. Hosted production checks will verify exclusion, empty states, authentication and deployment without publishing fabricated first-party fixtures. Real reference catalog entries must be sourced, reviewed and explicitly published through the existing admin workflow before real provider publication.
