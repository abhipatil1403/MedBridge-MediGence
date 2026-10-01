# Incremental implementation roadmap

Each milestone has an acceptance gate. The foundation in this task provides only the global shell and architecture; later milestones should build vertically through UI, service, data, permissions and states. Priorities and dependencies are in [FEATURE_MATRIX.md](FEATURE_MATRIX.md).

| Milestone | Deliverable | Exit criterion |
|---|---|---|
| 1. Foundation and design system | Next.js strict TS, Tailwind, accessible shell, button primitive, env policy, error/loading/not-found boundaries, health route, CI scripts | Install/lint/typecheck/build pass; home and mobile nav work; no dead links; documentation review. **Current task establishes this baseline.** |
| 2. Homepage and discovery | Task-oriented home, catalog search API, filters and meaningful empty states | Search persists in URL and returns only published fixtures/data with provenance. |
| 3. Treatment system | Reviewed taxonomy, treatment templates, specialty index and content workflow | A treatment links to real related entities; no empty SEO route indexing. |
| 4. Hospital system | Directory/profile, verification evidence, procedure/country filtering and enquiry | Filters reflect database; enquiry creates a tracked case. |
| 5. Doctor system | Directory/profile, affiliation, credentials and consultation eligibility | Unverified credentials hidden or labelled; no fake availability. |
| 6. Country/cost comparison | Destination guides, dated cost observations, normalized comparison table | Missing/stale data is explicit; calculations reproducible. |
| 7. Packages | Versioned offers, inclusions/exclusions, expiry, enquiry | Expired package cannot be booked; terms visible. |
| 8. Second opinion and workbench | Auth, resumable clinical intake, private upload/DICOM metadata, staff reviewer queue and signed report | RLS, document access audit, draft/approved distinction and clinician signoff tested. |
| 9. Video consultation | Source-of-truth slots, hold, order, video room, post-visit notes | Timezone, collision, payment and refund/reconciliation paths tested. |
| 10. Medical travel | Visa corridor content, request/quote/confirmation workflows, itinerary | No request represented as confirmed booking; source dates visible. |
| 11. Patient dashboard | Cases, documents, appointments, payment, messages, next action | Role-scoped view with timestamps and empty/error states. |
| 12. Recovery | Clinician-approved plan, tasks, check-ins, follow-up and handover | Escalation protocol and ownership tested; no autonomous clinical advice. |
| 13. Admin and care coordination | Queues, provider/content/offer workflows, assignments and audit viewer | Permission matrix and transition audit pass. |
| 14. AI orchestration | Provider adapter, validated tools, retrieval, specialized agents, evaluations | Source attribution, abstention, tool authorization and human gates pass evaluation set. |
| 15. Automation | Outbox jobs, reminders, queues, SLA and exception handling | Idempotent retries, dead-letter and human escalation tested. |
| 16. Security | Threat model, RLS audit, encryption/key rotation, retention, incident processes | External security and legal review before real patient data. Security work begins earlier; this is the formal release gate. |
| 17. SEO/content ecosystem | Editorial workflow, canonical pages, structured metadata, sitemap rules | Only reviewed, nonempty pages indexed; clinical review dates present. |
| 18. End-to-end testing | Realistic patient and staff journeys across services | Accessibility, performance, privacy, recovery, payment and operational scenarios pass in staging. |

## Immediate next work inside milestone 1

Review route/data/role decisions with product and clinical stakeholders; select hosting region and service vendors; add a minimal Supabase migration for identity/consent/case plus RLS only when the first vertical use case is selected; add CI and design tokens/components needed by discovery. Do not bulk-create the conceptual schema before workflows have owners and constraints.


## Agentic execution milestone (2026-10-01)

The existing request-driven runtime now has a typed registry, validated service execution, structured result observations, bounded Cloudflare next decisions, canonical read-result reuse, safe recovery and persisted run activity. Goal/reference/requirement policies and compound dependencies remain the existing infrastructure. This is request-driven execution; it adds no scheduler, external integrations or patient-data workflow. Case Intake is parked.

Run states are queued, planning, executing, observing, waiting_for_input, awaiting_confirmation, completed, partially_completed, failed and cancelled, persisted in existing private run JSON. Owned history restores compact progress; refreshing never replays tools. Read tools execute automatically; existing writes remain approval proposals. Future executing writes/external/clinical tools are blocked until an independently authorized workflow exists.

See [AI_AGENT_ARCHITECTURE.md](./AI_AGENT_ARCHITECTURE.md) for the loop, budgets, permissions and provenance and [AGENTIC_TOOL_EXECUTION_VALIDATION.md](./AGENTIC_TOOL_EXECUTION_VALIDATION.md) for measured gates, security, manual scenarios and deployment limits. No new environment variables or database migration is required.

## External research milestone (2026-10-01)

One controlled research tool extends the existing runtime. Explicit public/current information requests check internal catalog evidence first; successfully empty matching workflows can append targeted research. The initial reviewed official-page collection covers Mumbai knee/hip replacement and orthopedics. External evidence never creates a catalog provider or medical recommendation. Before widening coverage, review each source identity, retrieval behavior, privacy and evidence extraction. Pricing, conflict, injection, persistence and RLS gates are documented in [EXTERNAL_RESEARCH_AGENT_VALIDATION.md](EXTERNAL_RESEARCH_AGENT_VALIDATION.md). Case Intake and patient-data collection remain parked.


## Administrative document coordination

Implemented a vertical workflow inside the assistant: explicit hospital/service selection, sourced checklist, private PDF/JPEG/PNG uploads, filename-only suggestions, user-confirmed mappings, missing/optional states, duplicate warnings, replacements and owner-scoped revisioned package preparation. This extends the existing tool runtime and Supabase auth/storage rather than adding a separate file manager or medical interpretation system. Migration: `20261001090000_document_coordination.sql`.

The first release stops at Ready to share. Future hospital delivery requires an actual provider integration, recipient/package ownership checks and a separate explicit confirmation. No generic medical checklist, clinical interpretation, diagnosis, treatment recommendation, DICOM processing or automatic hospital submission is included. Provider checklists must be explicitly configured or directly sourced; the bounded research collection may have no requirement coverage.

Operational follow-ups: define retention/purge policy, malware scanning, provider checklist administration/review, expanded reviewed requirement-source coverage and an authenticated hospital delivery integration. Validate each independently before enabling real patient sharing. Current measured gates and limitations are in [DOCUMENT_COORDINATION_VALIDATION.md](DOCUMENT_COORDINATION_VALIDATION.md).
