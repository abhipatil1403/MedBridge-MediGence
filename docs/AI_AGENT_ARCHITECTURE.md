# Agentic AI architecture

## Workflow recovery upgrade — 10 October 2026

Current production uses governed published records; synthetic fixtures are isolated QA.
The existing runtime now persists validated catalog recovery checkpoints, supports one
owner-scoped interrupted-run recovery, bounded transient catalog-read retries, accurate
polled activity and a read-before-review inquiry handoff. Consequential writes remain in
their existing explicitly consented workflows. See [release audit and limits](AGENTIC_WORKFLOW_RELEASE.md).
Earlier milestone sections below describe their original implementation dates.

## Provider factual verification (2 October 2026)

ProviderVerificationAgent extends the existing registry and bounded execution loop with five scope-aware tools. Deterministic resolution uses the existing displayed-order reference resolver; exact server authorization prevents model-invented writes. The research collection/transport/source models provide exact attributed statements, strict entity identity, authority tiers and injection protections. Private immutable reports preserve internal values, external evidence, conflicts, dates and real history without updating catalog providers. ComparisonAgent consumes saved factual reports; Document Coordination can expose verified service sources while retaining its sourced checklist/manifest authority. See [PROVIDER_VERIFICATION.md](PROVIDER_VERIFICATION.md) for schemas, budgets, policy, security, coverage and measured validation.

The AI layer is an auditable assistive workflow around clinical and commercial systems. It is not a clinical decision maker. The `/assistant` workspace uses a server-side Cloudflare Workers AI adapter, the existing bounded agent runtime, controlled tools, and explicitly synthetic catalog data. Production patient use still requires a separate privacy, clinical, and operational review.

The current runtime lives in `lib/agents/`. It validates a model-generated plan, checks the selected agent's allowlist and each tool's Zod schema, executes catalog tools through the existing deterministic services, optionally plans a second bounded iteration, then validates synthesis. The run is limited to eight tool calls and eight bounded planning iterations. Cloudflare calls are server-side, time-limited, and retry malformed structured output once. No model has direct SQL or Supabase credentials.

For basic catalog discovery, `QueryNormalizer` resolves supported procedure aliases, specialties, and cities before tool selection. `discoveryRoute` creates a validated deterministic plan from those entities, including multiple searches when the user requests hospitals and packages together. The model may suggest a plan, but an invalid or irrelevant suggestion cannot replace this catalog route. Model validation codes, sanitized validation details, and recovery outcome are saved in run metadata. A model outage therefore leaves structured discovery available. One catalog snapshot is reused across the route and its tools within a run.

Discovery search requires explicit procedure links for provider and package matches. A longer, unsupported phrase containing a known alias is not promoted to an exact procedure: the agent reports zero confirmed providers and can show a broader catalog treatment only as a related topic. Ranked findings carry `matchType` and `matchReason` through tool output to the assistant cards; the validated discovery result also records normalized entities, sources, missing facts, and next actions. A missing required procedure prompts one targeted question. City-level searches do not require an optional locality or budget.

`conversations`, `conversation_messages`, `agent_runs`, `agent_tasks`, `agent_actions`, `agent_outputs`, and `agent_approvals` persist workspace state. The agent tables are private to the server. Authenticated users read only their own conversations through RLS. Case reads use a verified user token and RLS, then require the latest case-specific `agent_case_processing` consent. User-facing source cards show record IDs and synthetic/first-party/external source state; estimates retain their own source record IDs.

Case creation, title updates, and ongoing task proposals remain pending until the user reviews and approves the exact proposal. The approval endpoint rechecks conversation ownership, case access, consent, and the input schema before executing a user-scoped case write. External actions record a pending boundary and have no execution integration. Tool logs contain hashes, durations, result counts, and catalog IDs rather than document contents or raw search queries.

The assistant API now enters `lib/agents/orchestrator/`. It verifies conversation and case scope, loads recent messages and the saved coordination plan, and routes simple catalog requests to DiscoveryAgent, planning goals to TreatmentPlanningAgent, and two-sided catalog comparisons to ComparisonAgent. Existing low-level legacy definitions remain for compatibility; the other agents in the table are future workflow targets.

`lib/conversation/` resolves conversational references before workflow classification and model planning, after the existing safety and access checks. Every catalog response persists validated ordered entity references in its existing message/output JSON. The server loads up to twenty recent message rows with structured metadata under user RLS; it never extracts entity IDs from assistant prose. The context builder follows the UI's comparison/group/card order, deduplicates repeated comparison cells, and retains empty/incomplete groups. Older responses can reconstruct references from their original structured findings even without new reference metadata.

ReferenceDetector recognizes ordinal, demonstrative, location, package-price/duration and hospital-to-package language deterministically. ReferenceResolver prefers the latest relevant displayed list, then the active plan, then bounded recent results. It preserves order and clarifies competing groups, tied values, missing data and out-of-range positions. Typed ordinals select that entity-type list across comparison sides; a bare ordinal is accepted only when the group-local and overall interpretations agree on one record. Relative prices require complete exact USD sample prices for all compared options. A resolved ID and slug must still identify the same published catalog record before one existing detail tool executes. Hospital package requests constrain `search_packages` to that verified hospital and applicable plan treatment/budget. Reference turns use zero model calls, preserve related labels and provenance, and link active-plan executions to stable discovery tasks without changing the goal or destination. No schema migration or additional patient access grant is needed.

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

## Requirement-aware matching

The orchestrator extracts explicit requirements with `lib/requirements/RequirementExtractor` using the existing discovery entity normalizer and structured location matcher. Budget normalization retains currency, bounds, strict/inclusive operators and the original expression; it performs no exchange-rate conversion. Package features are distinct criteria, including accommodation, hotel, hospital stay and companion accommodation.

`RequirementEvaluator` verifies each result ID/slug against the published snapshot and evaluates each applicable criterion independently. `exact`, `related`, `unknown`, `not_met`, `incomplete` and `not_applicable` carry explanations, actual evidence and normalized catalog field names (for example `samplePriceUsd`, `treatmentSlug`, `inclusions`, `exclusions` and linked `hospitals.city`). Inclusion/exclusion evidence is authoritative; hospital stay cannot prove accommodation, optional inclusions are incomplete, and conflicting statements require confirmation. Sample prices cannot establish a provider quote, and catalog availability cannot establish medical suitability.

Peers are ranked by documented requirement satisfaction before the existing tool result limit, preserving entity blocks and stable ordering for equal scores. Feature-constrained package requests retain partial/unknown and over-budget records with explicit evaluations rather than deleting useful small-catalog options. Existing budget-only searches keep their upper-bound filter; unknown prices remain unknown. Reference contexts are created after evaluation/ranking, so ordinals follow the actual displayed order.

The runtime applies deterministic evaluations after each agent's finalization and before response/output persistence. Existing care-plan JSON stores requirements; plan/task findings store evaluations and existing catalog references. Follow-ups retain criteria, destination changes replace the location criterion, and comparisons evaluate each side against its own destination. Inclusion questions use the existing reference resolver and detail tools. “Another package” excludes the latest displayed packages from the response and honestly reports when no additional record exists. No new agent, framework or table is introduced.

## Compound intent orchestration

Compound catalog goals are decomposed before mutually exclusive workflow routing. The strict shared request and ordered dependency graph live in `lib/orchestration/`; the existing runtime executes independent reads followed by hospital-linked package reads under its existing limits. Requirement evaluation precedes candidate comparison, and the final response uses the existing plan, task, output and reference persistence. Cache signatures account for current catalog records, associations and retrieval filters; changed evidence-only criteria reevaluate reusable candidates. Successful partial results survive a failed operation; empty sides and missing comparison candidates remain explicit. See [compound validation](COMPOUND_INTENT_VALIDATION.md) for supported operations and verification evidence.

## Hospital matching

HospitalMatchingAgent coordinates evidence inside the compound executor: existing hospital discovery → requirement checks → actual linked package retrieval → independent package evaluation → hospital/package evidence aggregation → existing candidate comparison. The structured results describe requirement satisfaction, retain provenance, and persist in existing response/task metadata. No separate search, comparison or persistence engine is introduced. Budget/feature changes reevaluate reusable catalog data; affected retrieval filters or published records invalidate searches. General service entries do not establish hospital-specific availability. See [hospital matching validation](HOSPITAL_MATCHING_VALIDATION.md).

## Explicit prohibitions

No direct SQL, unmediated database mutation, invented hospitals/doctors/prices/accreditation/availability, diagnosis, prescription, unsupported outcome claims, or false assertion that an external service was contacted. AI-generated clinical summaries are labelled **draft — requires professional review** until signed. The product does not imply regulatory compliance without a separate assessment.


## Agentic tool execution foundation (2026-10-01)

The existing runtime, Cloudflare structured provider, four agent allowlists, catalog repository/SearchService, requirement evaluator, comparison helpers, reference resolver, compound dependencies and private Supabase storage remain the architecture. Case Intake is parked and receives no new workflow capability.

`tools.ts` is the central versioned registry: stable ID, display name, category, input/output Zod schemas, execute function, permission/mode, provenance policy, timeout and recovery policy. There are 26 IDs, including the 19 existing tools. Detail/location aliases call the existing implementations. `check_requirements` and `compare_providers` use published record IDs and the existing evaluators; runtime analysis can use only IDs observed in that run. Requirements come from the deterministic user requirement context, never model-authored constraints.

`executeRegisteredTool` validates ID/version/agent/input, applies limits and freshness, invokes the registered service, validates output, then persists a structured observation. An observation contains status, validated data, provenance, gaps, warnings, safe errors and whether another step is needed. Invalid calls never reach services. Unknown and denied model proposals become recorded errors available to the next decision.

Model-controlled plans execute one tool at a time and ask Cloudflare for `call_tool`, `continue`, `clarify`, `finish` or `partial`. Existing deterministic workflows first satisfy their required read dependencies; compound/requirement goals can then select further requirement/comparison tools from real observations. Reference-only follow-ups remain deterministic. Model failure preserves deterministic behavior. A plan/synthesis-only provider compatibility path is bounded to one follow-up.

The detailed state machine is queued → planning → executing → observing → another decision or a terminal state: waiting_for_input, awaiting_confirmation, completed, partially_completed, failed or cancelled. Terminal runs cannot resume implicitly; clarification/approval remains a separate authorized workflow. Cancellation is a represented state, not a new user-facing cancellation integration.

Private `agent_runs.metadata.execution` holds request, goal, owner/conversation/run IDs, state, calls, validated inputs, timestamps, safe errors, observations and source kinds. The final-output pointer references the existing `agent_outputs` row. Each runtime call links its existing task ID. Existing task/action/output persistence continues. SQL status values remain compatible; richer states live in versioned JSON. No migration or RLS change is needed.

Budgets are centralized in `execution-state.ts`: eight calls, eight loop iterations, six executions of one canonical tool, three failures, sixteen proposals, 80 seconds for the runtime, 12 seconds per read and 25 seconds per model request. Canonical validated arguments ignore object-key order; aliases share cache identity. Read results may be reused for 60 seconds within a run; failures, proposal tools and consent-protected reads are not cached. Existing catalog-signature rules still control cross-turn reuse. Timed-out read promises may finish internally, but are excluded from outputs; this milestone has no executing external/write integration.

Read tools execute automatically. Existing proposal tools only produce approval records. Reserved write/external/clinical modes are blocked by the execution boundary until a separate confirmed/professional workflow exists. Models cannot bypass this with user instructions. Catalog records retain IDs and synthetic/external/first-party labels; analysis carries derived source IDs. User requests are distinguished in run provenance, and generated summaries carry a separate source label.

The authenticated history endpoint projects compact activity only after conversation ownership/RLS authorization, never raw tool JSON. Browser polling restores recorded progress and results without re-executing a run. A process crash is not automatically retried; background continuation and cancellation delivery are outside this milestone. Dedicated goal preparation still occurs in the existing orchestrator before runtime state starts. The total HTTP handler remains bounded by its platform timeout.

Validation and deployment evidence: [AGENTIC_TOOL_EXECUTION_VALIDATION.md](./AGENTIC_TOOL_EXECUTION_VALIDATION.md).

Reference continuations now carry server-loaded structured conversation context and a persisted reference clarification through the existing runtime. An unresolved/ambiguous continuation authorizes zero tools; a resolved continuation authorizes only its deterministic tool/input pair. Neither can fall back to model discovery. See [the context regression validation](./AGENTIC_CONTEXT_REGRESSION_VALIDATION.md) for the confirmed failure path, correction and deployed verification.

## External healthcare research (2026-10-01)

The existing registry includes one `research_healthcare_information` read tool. ResearchAgent checks internal findings before bounded retrieval from reviewed official healthcare pages. Server-authorized inputs and an actual completed internal observation are required; no model can browse arbitrary URLs. External structured evidence and catalog records remain separate. ComparisonAgent and external requirement evaluation preserve original currencies, citations, missing facts and unresolved conflicts. The same owner-only response/run JSON persists external references across refresh. There is no additional model provider or agent loop. See [EXTERNAL_RESEARCH_AGENT_VALIDATION.md](EXTERNAL_RESEARCH_AGENT_VALIDATION.md) for source scope, security and actual gates. Case Intake remains parked.


## Document coordination (2026-10-01)

`DocumentCoordinationAgent` is an administrative specialist in the existing registry/runtime. It cannot diagnose, interpret files, infer disease, recommend tests or treatment, or decide clinical suitability. No LLM, OCR, embeddings or document contents enter this workflow. The existing discovery, planning, comparison, requirement and reference branches remain unchanged; a narrow explicit document-intent branch guides hospital/service selection.

The assistant's Documents disclosure uses the existing authenticated Supabase clients and conversation owner checks. Requirements are published hospital/provider-configured rows, explicitly attributed statements retrieved through the existing approved-source research transport, or requirements individually supplied and confirmed by the user. Unavailable or unsupported sources leave an empty checklist. The collection does not substitute requirements for another provider/service.

Seven registered tools retrieve requirements/packages, upload, confirm a mapping, remove, add a user-supplied requirement and prepare a package. Read tools require a server-bound owner/conversation/workspace context. Write tools additionally require an exact canonical tool/input authorization created by the authenticated route from a user action. The generic write/external/clinical block remains enforced for other tools. Document workflows use the existing conversation lease, bounded execution, activity, actions, outputs and provenance. They do not use model decisions or synthesis.

Uploads are PDF/JPEG/PNG up to 3 MB, checked for extension, MIME, magic bytes, unsafe filenames and SHA256. This is format validation, not clinical interpretation or antivirus scanning. Files live in private Supabase `care-documents` storage under opaque owner/workspace/file IDs. Browser roles cannot write storage or document tables. RLS permits only the owner to read active files. The authenticated download proxy rechecks owner and active status, emits attachment/no-store/nosniff/sandbox headers and exposes no public/signed storage URL. File content is never logged or sent to analytics/model/research.

`document_workspaces` retains checklist and upload metadata, matches, version links and a revision-bound package snapshot. `save_document_workspace` is a service-role-only atomic compare-and-swap RPC; each change writes `document_coordination_audit` in the same transaction. A failed upload/commit preserves prior files and removes only its new object where possible. Replacements preserve metadata/history and require new mapping confirmation. Removing or changing a file/requirement invalidates the package. Suggestions from administrative filename categories never count as availability.

Preparation requires all known required documents to be user-confirmed, an explicit review checkbox and the current revision. The ordered manifest retains source, metadata, original filenames and confirmations. Optional missing documents do not block preparation; uncertain requirements do. `ready_to_share` always retains `submittedToProvider: false`. No hospital submission integration or sharing tool exists.

Retention scheduling is not yet configured. Users can remove active and superseded stored files; coordination metadata and audit snapshots remain. There is no claimed automatic purge, antivirus certification, clinical validation, DICOM processing or hospital delivery. See [DOCUMENT_COORDINATION_VALIDATION.md](DOCUMENT_COORDINATION_VALIDATION.md).
