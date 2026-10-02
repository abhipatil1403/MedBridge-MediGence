# Provider Verification Agent

Implemented 2 October 2026 in the existing runtime. The agent verifies attributed factual statements. It does not determine clinical quality, suitability, outcomes, diagnosis, treatment necessity or which provider to select. Catalog presence and legacy verification flags never establish factual verification.

## Runtime and tools

`lib/verification/agent.ts` resolves catalog IDs or reviewed external identities using the existing ReferenceDetector/ReferenceResolver and displayed order. It determines scope and binds the exact authenticated owner, tool and input. `runAgent`, its registry, protected boundary, Zod validation, conversation lease, budgets, activity, redaction and persistence are reused. No model produces verification facts, recursively executes agents, or authorizes writes.

| Registered tool | Operation | Side effect |
|---|---|---|
| `verify_provider_information` | Check requested factual fields | Immutable private report |
| `refresh_provider_verification` | Retrieve again for the selected scope; bypass cache | New immutable report |
| `get_provider_verification_status` | Read a real report covering requested fields where available | None |
| `get_provider_verification_history` | Latest 20 real runs for the owned conversation/provider | None |
| `compare_provider_evidence` | Existing ComparisonAgent reads up to three previously verified providers, or compares internal/external facts for one provider | None |

One scope-aware verifier covers identity, contact, location, services, affiliations, credentials, accreditation and profiles without redundant retrieval tools. Strict inputs reject arbitrary URLs, fields and extensions. Both the service and protected boundary enforce server authorization; a model-generated proposal cannot create verification history.

Execution: plan → resolve provider → load internal facts → retrieve approved evidence → classify facts/conflicts/freshness → save → observe → respond. At most four approved pages are retrieved concurrently per tool. Existing 12-second tool and 80-second run budgets apply. The research transport retains DNS/public-address checks, exact HTTPS allowlisting, bounded approved redirects, timeout and byte/text limits. One fast transient source error may retry once; timeouts and rate limits are not automatically retried. There is no background monitor.

## Evidence and hierarchy

The existing `ResearchSource` schema, `extractPage` identity checks, deterministic evidence IDs, text extraction and `retrieveOfficialPage` transport are reused. The reviewed collection moved to a pure module so browser-side report validation and server transport use the same identity list. Existing source exports and treatment research coverage are preserved. Three reviewed contact/location pages were added without expanding treatment research selection.

| Tier | Source |
|---|---|
| 1 | Official provider |
| 2 | Government/health authority |
| 3 | Regulator/official registry |
| 4 | Official healthcare organization |
| 5 | Previously reviewed secondary |

Each field retains internal value, all collected external values, exact snippets, source IDs, entity/field associations, checked time, state and freshness. Sources retain URL, title, domain, tier, retrieved time and publication time when available. Official status requires reviewed source identity; domain resemblance is insufficient. `officialSourceConfirmed` is true for reviewed official sources and unknown for other reviewed source types.

Labelled statements and explicit JSON-LD properties are extracted deterministically. Adjacent OPD/outpatient appointment label and number lines are accepted with both exact lines retained; unrelated, emergency and department numbers are excluded from general contact extraction. Structured data requires matching provider name/type; unrelated hospitals on network pages are ignored. Homepage URLs support website; page URLs support profile. Formatting-only phone differences are normalized without adding country codes. No contact, address, facility, emergency availability, credential or accreditation is inferred. Credentials/registration require reviewed government or regulator evidence. Recent research snippets can be reused only when their exact statements cover the requested scope and identity/cache/freshness checks pass.

Instructions and clinical marketing claims are excluded from evidence. Web content cannot invoke tools, change authorization, mutate catalog records, upload files, send messages or alter prompts. No catalog UPDATE operation is introduced.

## States, conflicts and freshness

Fields: verified, unverified, conflicting, stale, not_found, not_applicable, internal_only. Verified describes source-supported factual information, with its date and limitations; it does not endorse a provider. Internal values and external evidence remain separate.

Every disagreeing value/source is preserved. Internal/external or external/external disagreement becomes conflicting; stronger tiers, newer dates or averages do not silently choose a winner. Output validation rejects forged source URLs/tiers, missing linked evidence, unsupported verified badges, inconsistent counts and silent conflict promotion.

Runs: completed, partial, verification_incomplete. Retrieval outcomes separately identify timeout, rate_limit, source_unavailable and unsupported_source. Provider-not-resolved requests stop with clarification and zero verification tools. Retrieval failure is never presented as a judgment about the provider. Successful partial fields remain visible.

Freshness: current, aging, stale, unknown. There is no universal threshold. Optional server variable `PROVIDER_VERIFICATION_FRESHNESS_POLICY` accepts rules per field or `default`, with `agingAfterDays` and `staleAfterDays`. Example syntax: `{"phone":{"agingAfterDays":7,"staleAfterDays":30}}`; these numbers are an operator policy choice, not a medical freshness standard. Missing/invalid/future timestamps or absent/invalid policy yield unknown. Reads project current age without changing saved timestamps or inventing historical runs. Publication time takes precedence over retrieval time. Retrieval time alone does not prove currentness. A separate 60-second transport deduplication window limits repeat requests; refresh bypasses it. Changed requested catalog facts invalidate reuse.

## Persistence, UI and downstream agents

Migration `20261002090000_provider_verification.sql` adds one indexed private immutable snapshot table, not provider tables. Reports contain actual identity/scope/start/completion/status/counts/sources/fields/outcomes/activity. A composite conversation-owner foreign key enforces scope. RLS plus explicit owner/conversation/provider filters protect history. Browser roles can read owned rows but cannot insert/update/delete; anonymous roles have no access. The server validates reports and checks authenticated conversation ownership before inserting. Conversation visibility preserves existing case-access restrictions.

Existing conversation metadata restores full responses, reference scope and pending clarification through refresh/authentication. Ordinal corrections retain the original verification action/field scope. Out-of-range references never initiate a broad search. The compact assistant section provides exact expandable evidence, dates, counts, gentle conflict styling and real refresh/history/field-recheck actions.

ComparisonAgent reads saved factual reports without selecting a winner. Document Coordination can attach owned, same-hospital, non-conflicting service/treatment evidence. That evidence never generates requirements: the existing sourced checklist and confirmed manifest remain authoritative.

## Coverage and limitations

- Seven reviewed official Mumbai hospital pages across three providers. There are no reviewed clinic, doctor, government or registry URLs yet. Typed support is tested with isolated fixtures; live credentials/registration remain unsupported until actual sources are reviewed. No new general crawler or registry integration is implied.
- Synthetic catalog providers usually lack an approved authoritative source and correctly remain internal_only or verification_incomplete.
- Strict labels/structured properties can miss prose, images or JavaScript-rendered details. Missing evidence does not prove a service/credential is absent.
- History shows the latest 20 runs per provider/conversation. Snapshots remain until their account/conversation is removed; no retention schedule was added.
- Status/evidence selects an actual saved report covering the requested scope where possible. Different runs' dates are not merged into a fabricated snapshot; history exposes older/different scopes.
- Comparison uses at most three previously verified providers. Clinical decisions, bookings, prices, catalog governance and document delivery remain separate.
- No dependency, paid API or mandatory environment variable was added. Configure the optional freshness policy consistently locally and on Vercel if used.

## Validation

Provider suite: 104 passing tests. Full suite: 659 passed and 20 optional tests skipped (679 total). Lint and standalone TypeScript passed. Live local API checks: 23 passed; live deployed API checks: 23 passed, including real official evidence, refresh/history, hosted RLS isolation, denied browser writes, arbitrary URL rejection and factual comparison. Malicious webpage/parser cases are isolated regression fixtures; no malicious source is added to production. Default optional live suites skipped by the runner are not counted as passed. 

### Final measured gates

- Full tests: 659 passed, 20 optional tests skipped; provider verification: 104 passed. Existing discovery, planning, comparison, requirements, compound orchestration, references, research, document coordination and tool execution regression suites passed.
- Lint, standalone TypeScript and optimized production build passed. No new dependency or mandatory environment variable.
- Five disposable PostgreSQL scripts passed: foundation, agent conversations, planning, documents and verification. The foundation script now expects the existing 31-doctor seed. The verification migration was applied to hosted Supabase by the operator, and live hosted owner isolation/browser-write denial were checked.
- Existing deployed discovery smoke passed: inventory, parsing, filters, sorting, suggestions, empty/error states and workflow routes. Two stale smoke assertions were corrected to require procedure-linked treatment results rather than unrelated country/service cards; runtime discovery matching was preserved.
- Local browser: exact address evidence, scope, real history/refresh/field actions and authenticated reload. Deployed browser: exact labelled appointment phone evidence, missing email, saved history, refresh with a changed timestamp and authenticated reload.
- Local and deployed responsive checks: 320, 375, 390, 430, 768, 1024 and 1440 pixels, with no document horizontal overflow. Deployed browser warning/error log was empty.
- Secret scans: 37 changed files, 25 generated client assets and 10 served production JavaScript assets; no configured Supabase server key or Cloudflare token values were found.
- Source limitation observed in production: Nanavati's reviewed pages returned source_unavailable from Vercel while local retrieval succeeded. The deployed report stayed verification_incomplete with zero verified fields. Kokilaben retrieval and exact contact verification succeeded on Vercel. Availability is source/network dependent; an unavailable source never establishes that a provider is untrustworthy.

### Manual scenario coverage

Scenarios 1–8 and 10–13 were exercised through live authenticated requests: discovery, first displayed provider, status/evidence, contact scope, refresh, unresolved fields, history, single-provider out-of-range clarification, restoration, repeated first reference and another account's access denial. Browser reload, evidence and real history/refresh actions were checked separately. Scenario 15 returned no clinical ranking. Scenario 9 with two displayed results is covered by the deterministic two-provider fixture; the live synthetic Mumbai catalog currently has one match. Scenario 14 covers rejected arbitrary URL input live and malicious webpage instructions in isolated parser/runtime regression fixtures; a malicious source was not admitted to the production collection.
## Hardening and UX refinement — 2 October 2026

Catalog source kind is derived from the actual snapshot. Synthetic records cannot retrieve/reuse official verification evidence or be promoted through cached research. The schema rejects authoritative evidence on synthetic records, improper credential authority and inconsistent run states/counts. Optional catalog metadata preserves older report compatibility. The UI keeps legacy demo identity visible, separates verification from discovery counts, preserves exact field evidence and differentiates zero-supported checks from actual partial verification.

Deterministic test fixtures use reserved .invalid sources, fixed dates, explicit QA identities and a test-only guard/cleanup. They exercise nine scenarios and all four configurable freshness states through the production parser/classifier. Live success remains based on existing reviewed official provider pages. Current validation is 105 provider tests, 29 UX/fixture tests, 689 total passing tests (20 optional skips), and 32 local/32 production API checks. Historical validation above describes the previous release. See [the complete current UX audit, results and limitations](UX_UI_REFINEMENT.md).
