# Reference data onboarding audit

Baseline: `fc681f0`, 4 October 2026. Audit completed before implementation.

## Existing controls to reuse

- `provider_records` contains editable drafts; `provider_revisions` preserves immutable snapshots. Published revision pointers survive subsequent draft edits.
- Submissions freeze exact revisions. Section decisions, correction/resubmission, approval and explicit publication are already separate operations.
- Private documents, append-only field reviews, section reviews and audit events have existing RLS. Administrative publication requires verified organization identity and stronger accreditation evidence.
- The canonical projector supplies hospitals, doctors, packages and their relationships. Public catalog visibility checks governed publication, parent visibility and non-synthetic provenance. Public consumers use an anonymous client and explicit safe columns.
- Existing package service states remain included/excluded/conditional/not_confirmed. Provider services do not establish package inclusions.
- The research agent already uses bounded, allowlisted official sources. Manual onboarding will not introduce arbitrary server-side URL fetching or bulk scraping.

## Gaps

1. Organizations currently allow only first-party or synthetic provenance. Independently collected information must not masquerade as provider submissions.
2. A generic source record and review URL do not establish which frozen field a source supports. Reference publication needs complete, immutable claim-to-source associations and individual reviews.
3. Support can review assigned provider submissions. Reference verification must be restricted to Admin/Super Admin, including direct RPC access.
4. Organization profiles require provider contact details and doctor profiles require a consultation mode. Reference records must allow those facts to remain unknown without relaxing provider requirements.
5. Additional hospital locations currently expand city matching without establishing that a particular procedure operates there. Reference offerings need explicit, sourced location associations.
6. Public provenance recognizes provider publication and catalog editing but needs a distinct MedBridge reference label and safe field-level source information.

## Implementation

Extend organizations with an explicit onboarding origin, using external provenance for admin references. Reuse all existing records, revisions, submissions, evidence, reviews, canonical projections and publication commands. Add an append-only claim-source table keyed to the frozen revision and supported value. Submission checks completeness; approval/publication require resolved field evidence. Administrative reference permissions apply at the database boundary, not just navigation.

Add a focused Admin reference workspace with organization selection, existing section forms, sources and claim review. Draft edits never silently update a public snapshot. Public source projections expose URLs, titles, source categories and collection/review dates, excluding internal notes, evidence content, reviewer IDs and private files.

Start with five branch-specific providers in Mumbai, Pune, Delhi, Bengaluru and Chennai, using official websites. Record concise factual statements; omit undocumented contact details, consultation modes, outcomes and prices. No package, accreditation, image or international service will be invented to fill a gap. Existing synthetic catalog rows remain excluded.

## Validation

Run role/RLS and publication tests on an isolated PostgreSQL database, including missing sources, value mismatches, unresolved evidence, branch scope, revision preservation, archive and public privacy. Retain all prior database suites and application regression gates. Validate the same anonymous canonical catalog used by Discovery, Comparison and Requirement Matching. Inspect seven responsive widths, then deploy and verify the exact Git revision.
