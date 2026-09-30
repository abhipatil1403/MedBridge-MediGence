# Requirement-aware matching validation

Validated on 2026-10-01 using the local production build and the linked development Supabase project. Production catalog records and seed files were not changed.

## Change and semantics

The previous flow parsed only a limited budget form and matched catalog treatment/location records without separately checking requested package features. It could present an exact catalog match while accommodation remained unsupported.

The new `lib/requirements` modules extract structured criteria using existing entity/location normalization, preserve currency and budget bounds/operators, and evaluate each applicable criterion against the actual published record identified by ID and slug. Statuses are `exact`, `related`, `unknown`, `not_met`, `incomplete` and `not_applicable`; each has an explanation and available evidence/source fields. Overall result statuses distinguish full/partial satisfaction, failure and insufficient evidence. Evidence field names refer to the normalized catalog adapter, not invented database columns.

Hospital stay, hotel, accommodation and companion accommodation remain distinct. Package existence does not confirm requested inclusions. Explicit inclusions may confirm a feature; exclusions fail it; conditional/conflicting evidence remains incomplete. Unspecified data, coordination/booking assistance and questions do not become positive evidence. Missing/zero-placeholder prices remain unknown, including relative reference comparisons. No currency conversion, medical suitability or provider quote is inferred.

Ranking evaluates peers before the tool's five-result limit and preserves stable ties and entity blocks. Feature-constrained package searches retain useful partial/unknown and failing-budget records with explicit statuses. Existing budget-only upper-bound searches retain their filter for compatibility; missing-price records remain eligible but unconfirmed. Reference positions are built after evaluation/ranking.

Requirements and evaluations persist in existing care-plan context/findings, task findings/comparisons, assistant message metadata and agent outputs. The existing owner RLS and atomic plan-save/turn lease are retained. No migration or additional persistence system is needed. The UI displays compact status rows, expandable evidence, a sample-price/quote distinction and saved requirements; unconfirmed package criteria do not receive an overall exact-match label.

## Automated validation executed

| Check | Result |
| --- | --- |
| Requirement tests | 38 passed |
| Full default suite | 192 passed; 18 opt-in tests skipped |
| Opt-in live Supabase planning test | 1 passed |
| Lint | Passed |
| Typecheck | Passed |
| Production build | Passed |
| Browser warning/error log | Empty; no hydration errors observed |
| Changed-file/client-asset secret scan | 32 changed files and 25 generated client assets checked against 2 configured server secrets; no matches |

Tests cover the reported accommodation failure; explicit inclusion/exclusion; hospital stay without accommodation; coordination, hotel and companion-accommodation distinctions; conditional/conflicting statements; strict budget equality boundaries, bounds/ranges, lakh and INR/USD preservation; missing prices; independent entity applicability; another-package retention; Pune changes; comparison sides; reference-based inclusion questions and ranked second-package resolution; serialized state reload; forged finding facts; current record identity; demo verification and clinical suitability limits. Existing Discovery, Planning, Comparison and Reference Resolution regressions all pass. An unpunctuated “Compare it with Pune” follow-up is included.

Explicit accommodation fixtures exist only in tests. The live Supabase test confirms the real synthetic package has unknown accommodation, an exact budget evaluation, persisted requirements/evaluations restored through a fresh store and no access for another user's client. Disposable live test users are removed after execution.

## Manual scenarios executed

| Scenario | Exact input | Observed result |
| --- | --- | --- |
| A | I need knee replacement in Mumbai, under $6,000, and I want a package with accommodation. | One real development-catalog synthetic package, USD 4,700 / 7 days. Procedure, Mumbai, budget and package: exact. Accommodation: unknown / Not specified. Hospital stay did not confirm accommodation. |
| B | Does the package include accommodation? | Retrieved the same package using `get_package`; accommodation remained unknown from actual inclusion/exclusion evidence. |
| C | Show me another package. | Kept all criteria and reported no additional available package; no alternative was fabricated. |
| D | What about Pune? | Changed the active destination to Pune while retaining treatment, USD 6,000 budget, package and accommodation; no Pune package exists in the current catalog. |
| E | Compare Mumbai and Pune. | Separate destination columns and requirement evaluation for Mumbai's package; Pune honestly showed no catalog record. No clinical/provider ranking. |
| F | Refresh browser and continue conversation. | Reloaded and reselected the persisted conversation, then asked “Does the package include accommodation?” again. The same package was retrieved; treatment, destination choices, budget, package and accommodation criteria remained available. Accommodation stayed unknown, and the budget evidence still showed USD 4,700 against the retained USD 6,000 bound. |

## Limits

- This is deterministic English extraction for supported criteria and catalog locations, not unrestricted natural-language understanding. Unsupported or ambiguous phrasing can still require clarification.
- USD/INR are preserved; no exchange-rate service is introduced. USD sample prices cannot confirm INR budgets.
- Inclusion evaluation uses the current catalog's explicit inclusion/exclusion fields. Optional, missing or contradictory evidence needs provider confirmation; clinical suitability always needs a clinician.
- Comparison retains the existing two-destination workflow. It does not introduce a new general-purpose provider ranking or comparison agent.
- “Another package” excludes the latest displayed package records; it cannot promise that an alternative exists. Recent conversation fallback retains the existing bounded history.
- Browser validation used the local production build against the development backend. It does not establish validation of this commit on Vercel.
