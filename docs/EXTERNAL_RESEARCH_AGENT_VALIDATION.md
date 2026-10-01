# External healthcare research

## Architecture

`research_healthcare_information` is one read tool in the existing registry, using the existing execution state, loop, budgets, tasks, action trace, ownership checks and Supabase response/output JSON. ResearchAgent performs public evidence retrieval; ComparisonAgent consumes the same structured result through `comparison/research.ts`. There is no additional LLM provider, scheduler, registry or execution loop. Case Intake remains parked.

Ordinary requests with sufficient catalog information keep their existing route. Explicit current/published/official information requests first execute internal hospital/package searches. `researchGap` records `current_information_missing`, `catalog_empty` or `requested_field_missing`. A failed catalog lookup is not treated as an empty catalog. Successfully empty compound/hospital searches can append research through `withResearchRecovery` without replacing their internal plan or results. The registered tool requires an actual completed internal observation and the exact server-authorized input, after schema validation and before retrieval/cache access. Reference clarification still blocks searches.

## Scope and real source collection

The initial collection contains reviewed official provider pages for knee/hip replacement and orthopedics in Mumbai: Kokilaben Hospital, Nanavati Max and Apollo Hospitals. Coverage is finite, not a general web index. Sources are selected by public treatment/location/provider terms, with distinct providers before additional pages about one provider. Unsupported places/providers/topics return an explicit coverage gap; the tool never silently substitutes another city or provider.

Reviewed starting pages:

- [Kokilaben Centre for Bone & Joint](https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint.html)
- [Nanavati orthopaedics and joint replacement](https://www.nanavatimaxhospital.org/our-specialities/orthopaedics-joint-replacement)
- [Apollo Mumbai total knee replacement](https://www.apollohospitals.com/region/mumbai/procedures/total-knee-replacement-surgery/)
- [Nanavati knee replacement unit](https://www.nanavatimaxhospital.org/our-specialities/knee-replacement-unit)

Page presence alone establishes no healthcare reliability claim. Every displayed statement requires successful live retrieval, text extraction, provider identity validation and an exact snippet. Source topic configuration is selection metadata, not evidence of services, prices or accreditation. No external provider is inserted into the catalog.

The source hierarchy is typed: official provider (1), government/health authority (2), regulator/accreditation body (3), healthcare organization (4), reputable secondary source (5). This first collection admits only reviewed official provider pages; lower tiers are not automatically searched. Source preferences cannot introduce an unreviewed source. External snippets preserve attribution, not marketing conclusions or clinical recommendations.

## Provenance, pricing, conflicts and requirements

`ResearchResult` is strict schema data with separate external findings, source IDs/URLs/titles/domains/types/authority, exact evidence, entity/field, status, retrieval/publication dates, missing information and unresolved conflicts. Evidence/source/entity relationships and unique source URLs are checked. Research remains a separate response block; catalog findings retain `medbridge_catalog`, research uses `external_source`, deterministic comparison is labelled `model_derived` as the shared derived-data category (no model performs extraction/comparison).

Retrieval is not currentness. Page-level publication metadata can produce date-known or potentially-stale labels; copyright/navigation dates cannot. The tool never asserts `current-source` from today's retrieval. Unknown publication dates remain explicit.

Price extraction preserves the original stated currency and whether the source says starting price, package price, estimate or published price. It never makes an online statement a provider quote, converts currencies, parses ambiguous ranges/unit multipliers into invented scalar prices or infers unstated inclusions. Conflicting price values remain separately attributed; no averaging or cheapest-price selection occurs. No published price means not found, not zero or more expensive.

External requirement evaluation is separate from catalog eligibility/verification. Explicit package accommodation inclusion can support a match; separately available/excluded accommodation cannot. Silence means unknown. Starting prices/estimates cannot satisfy a final package budget, and different currencies cannot be compared. Clinical suitability, success, quality, safety and credential status remain outside the extractor's field schema. Comparison preserves missing sides/fields and sources; it creates no clinical winner or symmetric price claim.

External references persist in the existing ordered reference context with `sourceKind=external_source` and stable entity/source IDs. An explicit external ordinal uses the existing deterministic resolver, then reads owned saved evidence. It cannot resolve to a catalog detail URL or trigger a guessed package search. Refresh restores sources and their original retrieval dates; opening an old result does not imply it has been retrieved again.

## Security and limits

Web content is data. Extraction is deterministic and never asks a model to execute instructions in a page. Script/navigation blocks and instruction/credential-like text are excluded from evidence. Research runs cannot enter model observation fallback; existing recovery runs also stop model extension once research is returned. No website can grant permissions, select tools or change tool inputs.

Only exact reviewed HTTPS URLs are fetched. Arbitrary URLs, credentials, query strings, fragments, literal IPs and unapproved redirects are rejected. DNS results must be global addresses. Automatic redirects are disabled and each approved redirect is checked. The reviewed-domain restriction is the primary boundary; expanding the collection requires review. Retrieval uses no application authentication credentials or cookies.

Public query construction discards conversation prose and uses only recognized treatment, location, field and provider terms. The schema contains no case, history, patient or authentication fields. Privacy validation rejects identifiers, credentials, private medical-history phrases and instruction-like input. The full private conversation is not sent to websites. No extra patient collection or access grant is introduced.

Maximum four sources (default three), one retrieval pass, two redirects, nine-second network deadline, 650 KB per response and 24 KB extracted text. Research executes under the existing 12-second tool timeout, eight-call/eight-iteration/80-second run budgets. Pages are deduplicated and final findings/snippets/source/missing lists are bounded. Failed retrieval remains visible and cannot erase successful internal results. There are no outbound enquiries, bookings or permanent external catalog writes.

## Validation

Validation on 2026-10-01:

| Gate | Result |
| --- | --- |
| New research suite | 86 tests passed |
| Full suite | 473 passed; 20 opt-in tests skipped (493 total) |
| Live Supabase / RLS | Expanded agentic live test passed separately; real source retrieval, persisted research, new-store reload, external reference with zero tools, owner isolation and unchanged catalog IDs |
| Lint | Passed without warnings |
| TypeScript | Standalone typecheck passed |
| Production build | Local and Vercel builds passed |
| Secret scan | No matches across 31 changed files and 25 browser assets; two configured server secrets checked |
| Browser / responsive | Local browser passed; 390 x 844 viewport had no horizontal overflow; no warning/error console entries |

Isolated parser fixtures model starting prices, conflicting versions and malicious content only within tests. They are not real provider claims, production sources, seeded records or user-facing external evidence. Production retrieval has no fixture mode.

The research suite covers the registry, strict input/output relationships, internal observation and authorization, sufficient-catalog bypass, bounded retrieval, source dates, deduplication, source failures, original currencies and price kinds, missing prices, conflicts, accommodation and budget requirements, unsafe URLs/address ranges, webpage instruction filtering, secret/identifier rejection, external references, refresh persistence and UI attribution. Existing comparison harnesses disable network retrieval; actual-source validation runs separately.

Local manual checks used the production build and disposable test identities. Catalog-only discovery used one internal tool. Current package research checked hospital/package records before retrieval and preserved missing prices. A named Kokilaben/Nanavati comparison retrieved three real official pages and six evidence items, with no unrelated demo provider substituted. Refresh retained sources; the subsequent external ordinal resolved to Kokilaben using saved evidence and zero tools.

Real sources may contain no package pricing, may change, redirect outside the approved collection, exceed limits or deny automated retrieval. A live conflict or malicious page cannot be fabricated to make a production demonstration succeed. Such branches are tested deterministically with isolated inputs and any unobserved production scenarios are reported explicitly.

## Vercel manual validation

Production alias: `https://medbridge-medigence.vercel.app/assistant`. The first working-source deployment was `dpl_FVP9KtfiqGLwKE7R2WkqnAQqcrUG`; the final application deployment, including the external-only `Published price` label correction, was `dpl_DnTPLqT2BXmhLEYpemReKf4iEgsB`, READY. Builds completed successfully. Git checkpoint publication follows these checks; deployment readiness is not presented as proof of a Git SHA unless deployment metadata establishes it.

| Requested production scenario | Observed result |
| --- | --- |
| Internal catalog only | One `search_hospitals` call, one labelled demo catalog record, no research |
| External information required | `search_hospitals`, `search_packages`, then the authorized research tool; two catalog records retained separately |
| Real external source | Kokilaben official page retrieved; two exact treatment/location evidence items, clickable source, authority tier 1, retrieval timestamp, publication date unknown |
| Missing information | No external package price invented; package/pricing remained not found. Fortis returned no approved coverage and no substitute provider |
| Conflicting prices | Not observed in retrieved production pages. Both conflicting values, original currencies and unresolved status validated in isolated tests only |
| Research failure | Nanavati and Apollo retrieval warnings visible with successful broad-request catalog results preserved. Apollo-only request produced `failed` research, zero sources/facts and no invented claims |
| Refresh | Owned saved evidence restored with the original source URL and `2026-10-01T13:55:52.991Z` retrieval timestamp |
| Reference to researched result | “Tell me more about the first external hospital” resolved Kokilaben as `external_source`, using zero tools and the same saved timestamp |
| Malicious webpage | Not observed on approved live pages; instruction-bearing page extraction and tool-boundary rejection validated in isolated tests. A production request-text probe attempted an unrelated `search_treatments` instruction; actual calls/arguments remained knee/Mumbai hospital, package and research operations only. This is not claimed as a live malicious-webpage test |

Named Kokilaben/Nanavati comparison was checked on both working-source deployments. Production could retrieve only Kokilaben during this validation, whereas local live retrieval obtained Kokilaben and Nanavati. The production comparison remained incomplete, retained Nanavati's missing fields and retrieval failures, showed unknown published pricing and produced no ranking or false matching catalog provider. The final fresh comparison displayed `Published price: unknown` rather than the catalog's sample-price label.

Production browser warning/error console entries: none. At 390 x 844, document client/scroll widths were both 375 pixels, with no horizontal overflow; viewport override was reset. Screenshots were saved outside the repository. Supabase inspection of disposable users' actual persisted runs confirmed tool order, public-only research arguments, catalog/external sourceKinds, zero-tool external reference and unchanged source dates. Disposable test conversations and identities are cleaned up after verification.

No new environment variables, dependencies, migrations, fixtures in production, externally sourced catalog inserts or Case Intake extensions were introduced. Initial coverage remains deliberately finite: Mumbai knee/hip replacement and orthopedics, reviewed provider pages only. Successful retrieval supports attributed published text; it does not establish clinical quality, live availability, a quote, present accuracy or independent verification.
