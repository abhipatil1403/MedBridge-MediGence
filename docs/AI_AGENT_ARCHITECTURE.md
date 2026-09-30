# Agentic AI architecture

The AI layer is an auditable assistive workflow around clinical and commercial systems. It is not a clinical decision maker. The `/assistant` workspace uses a server-side Cloudflare Workers AI adapter, the existing bounded agent runtime, controlled tools, and explicitly synthetic catalog data. Production patient use still requires a separate privacy, clinical, and operational review.

The current runtime lives in `lib/agents/`. It validates a model-generated plan, checks the selected agent's allowlist and each tool's Zod schema, executes catalog tools through the existing deterministic services, optionally plans a second bounded iteration, then validates synthesis. The run is limited to eight tool calls and two planning iterations. Cloudflare calls are server-side, time-limited, and retry malformed structured output once. No model has direct SQL or Supabase credentials.

For basic catalog discovery, `QueryNormalizer` resolves supported procedure aliases, specialties, and cities before tool selection. `discoveryRoute` creates a validated deterministic plan from those entities, including multiple searches when the user requests hospitals and packages together. The model may suggest a plan, but an invalid or irrelevant suggestion cannot replace this catalog route. Model validation codes, sanitized validation details, and recovery outcome are saved in run metadata. A model outage therefore leaves structured discovery available. One catalog snapshot is reused across the route and its tools within a run.

Discovery search requires explicit procedure links for provider and package matches. A longer, unsupported phrase containing a known alias is not promoted to an exact procedure: the agent reports zero confirmed providers and can show a broader catalog treatment only as a related topic. Ranked findings carry `matchType` and `matchReason` through tool output to the assistant cards; the validated discovery result also records normalized entities, sources, missing facts, and next actions. A missing required procedure prompts one targeted question. City-level searches do not require an optional locality or budget.

`conversations`, `conversation_messages`, `agent_runs`, `agent_tasks`, `agent_actions`, `agent_outputs`, and `agent_approvals` persist workspace state. The agent tables are private to the server. Authenticated users read only their own conversations through RLS. Case reads use a verified user token and RLS, then require the latest case-specific `agent_case_processing` consent. User-facing source cards show record IDs and synthetic/first-party/external source state; estimates retain their own source record IDs.

Case creation, title updates, and ongoing task proposals remain pending until the user reviews and approves the exact proposal. The approval endpoint rechecks conversation ownership, case access, consent, and the input schema before executing a user-scoped case write. External actions record a pending boundary and have no execution integration. Tool logs contain hashes, durations, result counts, and catalog IDs rather than document contents or raw search queries.

The assistant API now enters `lib/agents/orchestrator/`. It verifies conversation and case scope, loads recent messages and the saved coordination plan, and routes simple catalog requests to DiscoveryAgent, planning goals to TreatmentPlanningAgent, and two-sided catalog comparisons to ComparisonAgent. Existing low-level legacy definitions remain for compatibility; the other agents in the table are future workflow targets.

`lib/agents/comparison/` deterministically resolves a treatment/specialty and two ordered city/country options. Each option has separate allowlisted searches, filters, exact/related/none groups, missing fields and provenance. A run executes at most two primary location contexts with up to three catalog groups each, plus one shared treatment lookup (seven tool calls, no recursive agents or model calls). Identical completed tool inputs are reused within the owned plan. Failed searches remain incomplete while the other side continues; only failed inputs are retried on a later user request. Comparison normalization never promotes an unsupported procedure's broader alias to an exact provider match.

Strict Zod comparison output is derived from tool findings, not model-generated rows. No winner, clinical ranking, outcomes, quotes or converted prices are inferred. A USD budget filters USD sample packages; INR is saved without conversion. Missing prices on one side prevent a lower-price conclusion. The same owner-only task JSON metadata stores comparison requests/results, stable IDs and linked search tasks; no new table, task-type migration or patient write permission is needed. Clarification and price follow-ups restore the saved subject/options. Active planning destinations remain unchanged when adding a comparison.

`lib/agents/treatment-planning/` resolves user-provided preferences and catalog entities, builds required searches through the same discovery route, and lets Cloudflare order only that validated set. Invalid, irrelevant, or unavailable model output falls back to the required plan. The planner uses at most four discovery steps, one model planning call (the provider may retry malformed output once), forty persistent tasks, and one agent level; it never recursively calls agents. Internal review tasks need no approval. Clinical choices and external actions are never executed.

`care_plans` holds one coordination plan per conversation, with context and sourced findings. `care_plan_tasks` tracks discovery, review, clarification, preference, and external-boundary tasks. A per-conversation expiring lease prevents overlapping turns across server instances, and a server-only RPC writes plans and tasks atomically. Stable task keys and search inputs reuse completed searches until relevant criteria change. A USD budget can filter USD sample packages; an INR budget is saved without an invented conversion. Package comparisons use only prices and hospital links in saved tool findings.

Each planning run links to its care plan; each execution task links to its persistent planning task. Plans become ready after discovery and complete only after all actual non-cancelled tasks complete. Users mark review and preference tasks done or reopen them in the existing assistant panel. This progress describes coordination, never delivered medical care. External tasks carry approval state but have no execution integration. Browser refresh restores the selected conversation and reloads its plan. RLS permits only the owning user to read plans/tasks and also respects current case access through the conversation.

The full assistant response is Zod-validated before persistence and API delivery. It includes type, plan, findings, real execution tasks, questions, next actions, and sources. Missing Cloudflare configuration no longer disables deterministic catalog planning; Supabase configuration and applied migrations are required. If the new planning RPC is absent, the existing discovery workflow remains available and planning returns a migration-needed state.

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
