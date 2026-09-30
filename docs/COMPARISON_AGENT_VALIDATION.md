# ComparisonAgent validation

Executed 30 September 2026. Browser tests used the local production build at `http://localhost:3099/assistant`, the configured Supabase catalog and a disposable authenticated account. These results do not claim verification of the deployed Vercel application.

## Implementation

The existing central orchestrator selects DiscoveryAgent, TreatmentPlanningAgent or ComparisonAgent. The comparison workflow deterministically normalizes a catalog treatment/specialty, requested record groups, two ordered city/country options and optional budget. It reuses EntityMatcher, QueryNormalizer, existing approved tools, SearchService and its ranking, the bounded runtime and owner-scoped planning store. It needs no LLM call for the supported comparison requests; Cloudflare remains the existing provider for workflows that use it.

Each side has independent filters, task inputs, findings, match status, missing fields and provenance. Finalization correlates tool results by tool **and input**, preventing same-tool searches from overwriting another side. At most two primary contexts execute three group searches each and one shared treatment lookup: seven tool calls, one agent level. Completed identical inputs reuse persisted findings. A later request retries only incomplete inputs. A failed side cannot erase successful results from the other side.

Strict Zod models extend the existing assistant response and task metadata with `comparisonRequest` and `comparison`. Results retain source IDs, dates, synthetic labels, match reasons and optional shared treatment information. Existing care-plan tasks store comparison results and execution links; a separate review task remains for the user. Adding a comparison preserves the active plan ID and original destination.

Tables render structured finding attributes, with missing cells explicitly marked. Only attributes actually present in returned records become rows. Each table has a caption, scoped headers and a keyboard-focusable labeled scroll region. Saved comparisons use the same component. Summaries report catalog facts and missing prices without clinical rankings or an overall winner. USD budgets filter listed USD sample prices; INR is saved without conversion. Related/none/incomplete states remain independent for each group.

## Executed browser scenarios

| Test | Request | Observed result |
| --- | --- | --- |
| 1 | Compare knee replacement in Pune and Mumbai. | Pune hospitals/packages: none. Mumbai hospitals/packages: exact. Sourced synthetic USD 4,700 package, seven days. Correct side order and no winner. |
| 2 | Which has the cheaper package? | Restored Pune/Mumbai and treatment; reported Mumbai's sample price and missing Pune price; stated a lower price cannot be determined. |
| 3 | Compare knee replacement in Mumbai and Pune with a $6000 budget. | Reversed order preserved; USD 6,000 preference displayed; Mumbai package within budget, Pune empty. |
| 4 | Compare cardiologists in Pune and Mumbai. | Cardiology, independent doctor groups; Pune empty and Mumbai exact sourced demo clinician; no doctor ranking. |
| 5 | Compare Pune and Mumbai. | Asked what to compare. No provider results fabricated. |
| 6 | Compare knee replacement. | Asked which locations or countries to compare. |
| 7 | Compare cancer treatment in India and Turkey. | India: two exact hospital records. Turkey: one exact hospital record. Both package groups empty; no outcome or quality claims. |
| 8 | Compare underwater brain surgery in Pune and Mumbai. | No exact treatment or provider comparison; Brain & Spine Surgery shown only as a related catalog topic. |
| 9 | I need a heart doctor in Mumbai. | DiscoveryAgent: Cardiology/Mumbai exact demo clinician with provenance. |
| 10 | I need knee replacement treatment in Mumbai. | TreatmentPlanningAgent: one saved Mumbai plan with exact hospital and package groups. |
| 11 | Show me packages. | Continued the same Mumbai plan and treatment; exact sourced package. |
| 12 | Find knee replacement hospitals in Mumbai and show me relevant packages. | DiscoveryAgent executed hospital and package searches; two sourced exact records. |

Additional browser check: after tests 10/11, `Compare it with Pune.` added a completed comparison to the existing Mumbai plan and reused Mumbai search tasks. Refresh restored the conversation's comparison and the panel's saved comparison. Database inspection found one plan per comparison/planning conversation, including the original unchanged plan ID and Mumbai destination.

All observed records were synthetic and visibly labeled. No invented provider, fabricated price, clinical winner or raw tool error was displayed. The browser's captured warning/error log was empty after the twelve scenarios. The hospital source link opened the matching Mumbai detail page successfully.

## Responsive checks

Executed at 320, 375, 390, 430, 768 and 1440 pixels, including expanded saved comparison. Document scroll width did not exceed viewport width after fixing grid minimum sizing. Comparison tables scrolled within their own regions. At 375 pixels, keyboard ArrowRight scrolled a 480-pixel table within its 287-pixel container; source details expanded and stayed visible. Fact labels retain a readable column in source cards.

## Automated validation and gates

- `tests/comparison.test.ts`: 27 passing tests. Covers deterministic variants and order, country/doctor/hospital/package targets, user-location isolation, clarification continuation, asymmetric/both exact/both empty/related states, unsupported procedure, USD/INR budgets, partial failures and bounded retries, cache reuse, active-plan identity, strict schema rejection, provenance and server-rendered table output.
- Full `npm test`: 99 passed, 18 optional integration tests skipped; five passing test files and three skipped files. Includes existing DiscoveryAgent and TreatmentPlanningAgent regressions.
- Opt-in `tests/planning-live.test.ts`: one passing live Supabase integration test, including comparison persistence, reload, active-plan reuse, cached price follow-up and owner-only task metadata access. Another authenticated account received no rows for the owner's comparison tasks.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- Exact configured server-secret scan across changed files and generated client assets: no matches. Environment files remain ignored; client components receive validated catalog data only.

## Database and security

No migration required. Comparison uses the existing `care_plan_tasks.metadata` and service-only atomic save/lease RPCs. Existing conversation/plan/task ownership checks, consent scope and RLS remain in force. No new patient write grant, cross-user read grant or external action was introduced. Disposable integration/browser accounts and their validation records are removed after testing.

## Limits

- This milestone compares city/country contexts for a treatment, specialty or hospital catalog request. Selecting two individual hospitals/packages/doctors/treatments as comparison options remains future work.
- Location resolution uses existing aliases and catalog locations; unknown destinations require clarification.
- Searches return bounded catalog results, not an exhaustive market survey. Listed minima are explicitly scoped to returned records.
- Successful cached searches use their original retrieved timestamp; a fresh conversation runs fresh searches.
- Data availability reflects the current published catalog. Synthetic prices are samples, not offers, quotes, availability or outcome evidence.
- No FX conversion, clinical ranking, booking or provider contact is implemented.
- Vercel deployment and production assistant execution were not verified in this validation session.
