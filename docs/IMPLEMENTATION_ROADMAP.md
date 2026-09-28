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
