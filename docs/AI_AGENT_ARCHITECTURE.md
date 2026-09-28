# Agentic AI architecture

The AI layer is an auditable assistive workflow around clinical and commercial systems. It is not a clinical decision maker. The `/assistant` workspace uses a server-side Cloudflare Workers AI adapter, the existing bounded agent runtime, controlled tools, and explicitly synthetic catalog data. Production patient use still requires a separate privacy, clinical, and operational review.

The current runtime lives in `lib/agents/`. It validates a model-generated plan, checks the selected agent's allowlist and each tool's Zod schema, executes catalog tools through the existing deterministic services, optionally plans a second bounded iteration, then validates synthesis. The run is limited to eight tool calls and two planning iterations. Cloudflare calls are server-side, time-limited, and retry malformed structured output once. No model has direct SQL or Supabase credentials.

`conversations`, `conversation_messages`, `agent_runs`, `agent_tasks`, `agent_actions`, `agent_outputs`, and `agent_approvals` persist workspace state. The agent tables are private to the server. Authenticated users read only their own conversations through RLS. Case reads use a verified user token and RLS, then require the latest case-specific `agent_case_processing` consent. User-facing source cards show record IDs and synthetic/first-party/external source state; estimates retain their own source record IDs.

Case creation, title updates, and ongoing task proposals remain pending until the user reviews and approves the exact proposal. The approval endpoint rechecks conversation ownership, case access, consent, and the input schema before executing a user-scoped case write. External actions record a pending boundary and have no execution integration. Tool logs contain hashes, durations, result counts, and catalog IDs rather than document contents or raw search queries.

The table below is the longer-term agent roadmap. The currently implemented agents are DiscoveryAgent, TreatmentPlanningAgent, HospitalMatchingAgent, and ComparisonAgent; other listed agents are design targets.

```text
User / staff action
  → authenticated request + consent and purpose check
  → intent classifier and deterministic route guard
  → orchestrator with case-scoped state and budget
  → specialist agent using allowlisted, schema-versioned tools
  → database / approved integration through service layer
  → output schema, provenance and policy validation
  → human review gate where clinical or operationally consequential
  → rendered answer + what was read, done and still pending
  → run/tool/access audit events
```

## Agents and boundaries

| Agent | Inputs → output | Allowed tools | Required gate |
|---|---|---|---|
| DiscoveryAgent | Uncertain need → clarification and sourced navigation | Taxonomy search, published catalog search | No diagnosis; uncertain conditions go to clinician |
| CaseIntakeAgent | Patient answers → missing-field checklist | Case read, draft-field proposal | Patient confirms facts; sensitive mutation via service only |
| DocumentAgent | Uploaded file → metadata and extraction draft | Authorized document read, OCR/DICOM metadata job | Malware/format scan; original remains authoritative |
| ClinicalSummaryAgent | Case facts → attributed draft summary | Case/document read | Clinical reviewer signs before use in care |
| HospitalMatchingAgent | Procedure, location, constraints → eligible hospital shortlist | Verified hospital/procedure/accreditation query | Deterministic eligibility; coordinator verifies shortlist |
| DoctorMatchingAgent | Specialty, procedure, language → eligible clinicians | Verified doctor/affiliation query | Credentials and availability source verified |
| TreatmentComparisonAgent | Reviewed treatments and countries → sourced comparison narrative | Catalog and comparison calculator | No invented outcome rate or medical recommendation |
| CostAgent | Sourced offers → arithmetic and uncertainty | Cost observation query, FX calculator | Published value only if current and comparable |
| PackageAgent | Case preferences → eligible active offers | Package catalog, terms read | Provider confirmation before reservation/payment |
| TravelAgent | Confirmed treatment itinerary → checklist and requests | Travel rule read, case travel read | Vendor action needs confirmed integration and staff review |
| ConsultationAgent | Doctor/service choice → booking assistance | Slot read/hold, appointment service | No slot claims without confirmed reservation |
| SecondOpinionAgent | Case status → missing items and review handoff | Opinion case read, task proposal | Clinician produces and signs opinion |
| RecoveryAgent | Approved recovery plan → check-in assistance | Plan/task/check-in read | Clinical escalation follows approved thresholds |
| CareCoordinatorAgent | Queue and case events → task prioritization | Assigned-case query, task proposal | Human accepts consequential assignments/messages |

## Orchestrator contract

1. **Select:** classifier returns intent, confidence, entities and missing facts in a strict schema. Low confidence asks clarification or hands off.
2. **Authorize:** actor, patient/case scope, consent purpose, data classification, rate limit and role are checked before each tool call. Agents inherit a narrow capability set.
3. **Execute:** agent receives only minimum required fields and calls versioned tools. The LLM never receives SQL credentials or database network access. Tool adapters call server services, which own all reads and writes.
4. **Validate:** Zod/JSON-schema input and output, referential integrity, source IDs, recency and business invariants. Reject hallucinated provider IDs/prices. Safety classifier blocks diagnosis/prescription and unsupported claims.
5. **Review:** professional or coordinator approval gates are explicit state transitions. A draft cannot be mistaken for released clinical guidance or a confirmed booking.
6. **Explain:** patient response states understood need, sources and checked dates, actions completed, uncertainty, and next step. Tool failures are shown honestly.
7. **Audit:** persist run, tool calls, actor, case, purpose, schema/prompt/model versions, source references, validation outcome and human edits. Redact or avoid raw PHI in operational logs.

## Tool interface standard

Every tool declaration has `name`, `version`, `purpose`, `inputSchema`, `outputSchema`, `permission`, `timeout`, `idempotencyPolicy`, `auditCategory`, `sourceFreshness` and `sideEffect` (`read`, `propose`, `write`). Tool output includes `sourceIds`, `retrievedAt`, `verificationState` and typed errors. Example: `findHospitals({procedureId,countryId,verifiedOnly:true})` returns only published hospital IDs, mapped procedure IDs, accreditation evidence status and dates. `createTravelRequest` is a separate write tool, allowed only after explicit authenticated patient intent and service-layer checks; an LLM cannot compose arbitrary writes.

## Provider abstraction and retrieval

- `LLMProvider.generateStructured(request): Promise<StructuredResult>` is the current provider-neutral interface. Cloudflare Workers AI serves the `@cf/zai-org/glm-4.7-flash` model through its REST endpoint. The provider asks for JSON and validates the result against the requested Zod schema; malformed output is retried once and otherwise fails safely. Streaming is deferred; the workspace renders a completed persisted run and its real task states. `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `SUPABASE_SECRET_KEY` stay server-side.
- Retrieval indexes only approved, versioned content and published provider facts, with access-scoped patient documents in a separate private index. Each chunk points to source entity/version and review date. No web answer is promoted into the catalog automatically.
- Ranking begins with deterministic eligibility (service, location, verified credential, budget/offer currency, availability) followed by explainable weights. LLM synthesis may explain candidates but cannot change eligibility or fabricate score inputs.
- Evaluation uses de-identified test cases: intent accuracy, abstention, source attribution, tool authorization, PHI leakage, false price/provider claims, clinical safety and reviewer edit rate. A shadow rollout precedes any patient-facing automation.
- Fallbacks are deterministic search and human care coordination. A model outage must not block case access, bookings, document retrieval or clinician review.

## Explicit prohibitions

No direct SQL, unmediated database mutation, invented hospitals/doctors/prices/accreditation/availability, diagnosis, prescription, unsupported outcome claims, or false assertion that an external service was contacted. AI-generated clinical summaries are labelled **draft — requires professional review** until signed. The product does not imply regulatory compliance without a separate assessment.
