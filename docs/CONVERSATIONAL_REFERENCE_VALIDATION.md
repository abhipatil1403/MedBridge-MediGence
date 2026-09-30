# Conversational reference resolution validation

Validated on 2026-09-30 / 2026-10-01 using the local production build, the linked development Supabase project and synthetic catalog records.

## Root cause

The planning store read only message role and prose, omitting the already persisted structured response metadata. The orchestrator sent reference requests through ordinary planning without identifying a prior result. The model could therefore supply a syntactically valid slug without proving that it belonged to the displayed results.

## Implementation

- `ReferenceDetector` identifies ordinals, demonstratives, entity types, locations and price/duration references deterministically. Ordinary discovery, planning and comparison requests retain their existing routes.
- `ReferenceResolver` returns strict Zod-validated `resolved`, `ambiguous` or `unresolved` output. Entity identity comes exclusively from structured findings. Execution verifies both the record ID and slug against the current published catalog snapshot.
- Reference requests enter the orchestrator after existing access and healthcare safety checks, before workflow classification or model planning. Resolved details use the existing entity detail tools with zero model calls. Unresolved references invoke no catalog tool.
- Response contexts retain conversation, response, run, group, position, entity identity and available location/attribute metadata. Construction follows the UI's comparison, result-group or flat-finding display order. Repeated comparison table/source entries are deduplicated without sorting.
- Existing `conversation_messages.metadata.response` and `agent_outputs.content` persist the context. The planning store reads structured metadata for the most recent 20 messages. Reconstruction validates the response and derives references from its actual findings, rather than trusting a supplied reference slug or parsing prose.
- Context preference is the immediately preceding relevant result, then the active plan, then bounded recent results. A relevant empty list or invalid ordinal cannot fall back to older results to invent a match.
- Typed ordinals preserve entity ordering across comparison sides. Bare ordinals check group-local and global possibilities; competing records produce clarification containing actual candidate names/types. Location references prefer a unique matching hospital within a mixed result block; a latest package-only block refers to its package.
- Package price/duration extremes require at least two complete comparable values. Missing/empty sides, mixed currencies, related price matches and ties produce clarification. Listed prices remain samples, not provider quotes.
- Hospital-to-package follow-ups constrain `search_packages` to the resolved hospital and applicable active-plan treatment/budget. Reference tool executions retain the same plan and link their runtime tasks to persistent care-plan tasks.

No SQL migration, new entity table, RLS policy change or browser-only reference state was introduced. Provenance, synthetic labels, exact/related status and clinical boundaries remain in the response.

## Automated checks executed

| Check | Final result |
| --- | --- |
| Reference tests | 55 passed |
| Full default suite (`npm test`) | 154 passed; 18 opt-in integration tests skipped |
| Opt-in live planning/Supabase test | 1 passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Changed files and generated client asset secret scan | No configured server secret values found |
| Browser warning/error log | Empty; no hydration error observed |

The reference suite covers actual second/first/last ordering, typed hospital/package references, Mumbai/Turkey locations, demonstratives, attribute extremes, missing prices, ambiguity and clarification continuation, no history, invalid fifth result, unavailable/changed identities, empty recent results, nested plan references, serialized metadata reload, conversation isolation and preservation of related matches. It also exercises the existing heart-doctor discovery, unsupported-procedure, India/Turkey comparison and package follow-up routes.

The live Supabase test verifies the hospital-to-package-to-detail chain through a fresh store instance, exact tool/record routing, zero model calls for references, persistent plan/task links and another user's inability to read the owner's message metadata. Disposable test users were removed after testing.

## Six requested manual flows executed

| Flow | Observed result |
| --- | --- |
| Find knee replacement hospitals in India → second one | Displayed Bengaluru then Mumbai; detail request retrieved the same Mumbai hospital. |
| Compare knee replacement in India and Turkey → second hospital | Retrieved Mumbai using hospital ordering across the comparison sides. |
| Comparison → Mumbai one | Retrieved the actual Mumbai hospital from the comparison context. |
| Comparison → Which package is cheaper? | Clarified that a cheaper option could not be established because Turkey had no comparable package price; no false winner. |
| Active Mumbai plan → Show me packages → first package | Retrieved the displayed synthetic knee-replacement package and then its exact detail record. |
| Mumbai treatment plan → hospital → its package → that package | Kept the same plan and destination; linked package search used the chosen hospital, followed by exact package details. |

Refresh was tested before the nested plan chain and again before `How much is that?`. The latter retrieved the same package and displayed its synthetic USD 4,700 sample price. Persisted conversation selection also restored the original discovery ordering and second-hospital result. A package search without a known planning destination retained the existing agent's destination clarification.

## Remaining limits

- Recent message context is bounded to 20 messages, with active-plan structured results as a fallback. Old prose-only messages without findings cannot supply entity references.
- Detection supports common deterministic English phrasing, first through tenth, numeric ordinals, last and structured locations. It is not a general language coreference model.
- Ambiguous mixed groups, tied values and incomplete attributes require clarification. Attribute resolution performs no currency conversion or clinical ranking.
- A service reference has no existing supported detail tool and produces clarification. Records removed or replaced in the published catalog cannot be resolved by inventing a replacement.
- Verification used the local production build against the linked development backend. This report does not claim that the new commit was tested on Vercel.
