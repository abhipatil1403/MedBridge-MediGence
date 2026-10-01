# Case intake implementation and validation

Validated locally on 2026-10-01 using the production Next.js build and the configured Supabase development project. Vercel was not tested for this change.

## Architecture

`lib/case/CaseIntakeAgent.ts` is a deterministic specialist workflow inside the existing treatment coordination runtime. Its response identifies `workflow: case_intake`; database runs retain the existing `treatment_planning` agent identifier. This preserves the registered runtime, conversation lease, run tracing, strict responses, persistence, and RLS without adding a database enum or migration.

The existing orchestrator selects intake for supported voluntary medical descriptions and case references. Clinical advice, emergencies, and external actions retain their existing safety boundary. Intake uses no model calls and sends no medical narrative to an AI provider.

## Structured model and evidence

`CaseSchema.ts` validates the case ID, conversation, revision, concerns, symptoms, reported diagnoses, discussed procedures, investigations, medications, allergies, history, previous treatments, timeline, goals, documents, missing information, and review state. Unknown clinical fields remain empty, with explicit unknown labels in the summary/completeness output.

Each clinical item has an ID, source status, timestamps, quoted message spans, a message source ID, conversation/run IDs, and version history. Source IDs are stored on actual owner-scoped user messages. The live test verifies that each quote equals the corresponding message substring.

Statuses distinguish user reported, user confirmed, unknown, and conflicting information. Document-derived and clinician-confirmed statuses are reserved for future trusted source ingestion and cannot be assigned from a user message. Confirming a draft never clinically verifies it.

## Extraction and normalization

`CaseExtractor.ts` conservatively extracts supported English statements about symptoms, diagnoses, doctor discussions, investigations, medication names/doses/frequency, allergies, history, previous treatment, goals, and relative times. `CaseNormalizer.ts` normalizes stated numbers and preserves approximate time expressions without inventing a calendar date.

Doctor-discussed knee replacement remains a reported procedure, never a diagnosis or treatment recommendation. Reported MRI findings remain user testimony. Generic painkillers remain generic; absent doses/frequency remain unknown. Absent allergy information never becomes “no allergies.” Explicit severity wording is retained without clinical grading.

## Merging, correction, and conflicts

Repeated items merge by stable category/key while retaining individual sources. Explicit corrections supersede earlier active versions, preserving the earlier evidence. Unresolved conflicting dates, allergies, or medication doses remain marked conflicting and prompt clarification. Adding a reported MRI finding enriches an investigation; a later date correction preserves the finding. Changes invalidate confirmation of the complete draft.

## Completeness and summary

`CaseCompleteness.ts` deterministically separates information required for a requested action, useful coordination details, optional preferences, and unknown information. A case-backed hospital request needs an explicit searchable procedure and destination; missing medical history or reports does not block catalog discovery. No completeness percentage is produced.

`CaseSummary.ts` maps every generated statement to stored item and message source IDs. Missing-information questions open the relevant list directly. The compact case panel shows source labels and working Confirm, Edit, Add information, and Continue controls.

## References and handoff

The existing ReferenceDetector, ReferenceResolver, and reference context now support private case references. Case references use internal IDs, have no public detail URL, and are excluded from untyped catalog ordinals. Existing catalog reference behavior is preserved.

A mixed initial narrative/search request first presents a reviewable draft. An explicit Continue or subsequent case-backed hospital request permits coordination after that review opportunity. Unresolved conflicts prevent handoff. Search clarification answers update administrative requirements without becoming reported medical facts.

Hospital matching uses the existing requirement extractor, compound operation executor, deterministic tools, and HospitalMatchingAgent. The handoff contains separate `coordinationRequirements` and `reportedFacts`, the reviewed revision, a user approval source, `clinicallyVerified: false`, and `submittedToProvider: false`. Symptoms and diagnoses never supply an inferred procedure.

Future consultation and second-opinion briefings are data contracts only. No clinician review, report, booking, or provider submission is performed.

## Documents, persistence, and privacy

Intake is a private conversation draft stored in `care_plans.context.patientCase`, distinct from the existing case-record lifecycle. It survives refresh and conversation continuation under the existing owner-scoped plan/message architecture and atomic lease-protected save RPC.

For an explicitly linked case, document references come only from the existing consent-checked CaseAccess metadata reader. Only real record IDs, titles/types, and upload timestamps are copied. References are marked `uploaded_not_processed`; document contents and storage URLs are not included.

No new migrations, environment variables, or API keys are needed. No medical data is stored in a public URL, client log, analytics event, or runtime diagnostic. Browser local storage retains only the existing account-specific conversation selection identifiers, not the case contents.

## Automated validation

- Full suite: **288 passed, 19 opt-in tests skipped**; includes **41 case-intake tests** and the existing **247 regression tests** for discovery, planning, hospital matching, requirements, compound orchestration, references, comparison, authentication, and provider contracts.
- Live intake integration: **1 passed** against real Supabase, exercising scenarios A–H, reload, exact source-span/message linkage, log privacy, and another account's denial of conversations, plans, messages, runs, and plan tasks.
- Existing live planning integration: **1 passed**, including owner isolation and discovery/comparison/compound/hospital workflows.
- `npm run lint`, `npm run typecheck`, and `npm run build`: passed.
- Browser console: zero entries/errors, including zero medical text in console logs.
- Secret scan: changed repository files and 25 built client assets checked against the two configured server secrets; zero matches. Public Supabase configuration remains public by design.

## Manual browser validation

Temporary authenticated test accounts were used in the local production app:

| Scenario | Result |
| --- | --- |
| A: I have severe knee pain. | Symptom only; no diagnosis, procedure, or investigation invented. |
| B: It has been going on for about eight months. My doctor mentioned knee replacement. | Added approximate duration and a user-reported procedure discussion to the same case. |
| C: I had an MRI last month and I'm taking painkillers. | Added MRI and generic medication; dose/frequency unknown. |
| D: What information are you missing? | Displayed useful/optional/unknown missing information directly. |
| E: Show me my case summary. | Structured source-labelled summary, diagnosis not provided. |
| F: Actually, the MRI was two months ago. | Active timeline changed to approximately two months ago. |
| G: Use this case to find knee replacement hospitals in Mumbai under $6,000. | Existing HospitalMatchingAgent found sourced demo hospital/package results, with medical context separate from search requirements. |
| H: Refresh and continue. | Case persisted and the follow-up case reference returned the saved information. |
| I: Another authenticated account. | Empty workspace and no private case panel. The live integration also rejected the original conversation ID and returned no foreign rows through RLS. |

All four review buttons were exercised: Confirm produced user-confirmed labels without clinical verification; Edit/Add information requested the next detail; Continue asked for a coordination goal when none remained pending.

Temporary users, conversations, plans, tasks, runs, actions, and outputs were cleaned up. The validation browser was signed out and closed. A screenshot of the corrected fictional case is saved outside Git in the Codex visualizations folder.

## Remaining limitations

- Extraction uses conservative, bounded English patterns rather than unrestricted language understanding. Unrecognized phrasing is not converted into guessed clinical facts.
- Document processing and clinician-confirmed ingestion are not implemented.
- Consultation and second-opinion agents remain future workflows; only briefing contracts exist.
- Catalog providers and prices used in these tests are synthetic examples, not live clinical availability or quotes.
- Validation covers the local production build and Supabase; no Vercel validation is claimed.

## Git checkpoint

Required commit message: `feat: add case intake agent`. Push target: `origin main`. The completion report records the resulting SHA after verifying local HEAD, origin/main, the actual remote main reference, and a clean working tree.
