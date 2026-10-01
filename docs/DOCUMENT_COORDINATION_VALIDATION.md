# Document Coordination Agent validation

Validated 2026-10-01–02, Asia/Kolkata, against baseline `b461c40e31ce49a0b973823507bd86c05b39c73e`.

## Architecture and scope

The administrative DocumentCoordinationAgent extends the existing agent registry, Zod tool contracts, bounded execution loop, owner-scoped conversations, recorded activity and provenance. It uses the existing Supabase authentication and Storage service. It introduces no second runtime, model provider, authentication system or generic file manager.

Seven versioned registered tools: `get_document_requirements`, `get_document_package`, `upload_document`, `match_document_to_requirement`, `remove_document`, `add_document_requirement`, and `prepare_document_package`. They have validated inputs/outputs, authenticated owner scope and recorded execution results. Write authorization is created by the authenticated route for an exact user action and canonical input. Other write/external/clinical tools retain their existing confirmation block. Existing specialists cannot call document tools.

The Documents disclosure is part of `/assistant`; new authenticated endpoints are `/api/assistant/documents` and `/api/assistant/documents/download`. Existing discovery, planning, matching, comparison, reference resolution, external research and authentication behavior is retained. The explicit document-intent branch only guides selection of a hospital/service.

## Requirement sources

- Published hospital or administrator/provider-configured checklists in `document_checklists`, scoped to the selected hospital and applicable service.
- Directly attributed hospital statements retrieved through the existing approved-source research transport. At most two already-approved provider/service pages are checked. Exact source URL, source identity, statement and retrieval timestamp are retained.
- Individual requirements explicitly supplied and confirmed by the user, visibly labelled as user-supplied.

There is no AI-generated fallback checklist. Unknown, unavailable, malformed or unsupported requirements remain unavailable or uncertain. Research coverage is deliberately limited; ordinary treatment descriptions cannot establish a required document. The current catalog's synthetic providers do not become verified hospital sources.

The live validation used a disposable administrator-configured **synthetic** checklist for the demo Mumbai hospital and the explicit service `Synthetic document validation`. Its source label and reference stated that it was a test checklist, not real hospital requirements. It was removed after validation. No real hospital checklist was claimed to have been independently verified.

## Upload, matching and confirmation

PDF/JPEG/PNG files up to 3 MiB are accepted through a file picker or single-file drop. The UI reports upload transfer progress, secure-save status, failure and retry. Server validation checks filename safety, non-empty size, extension/MIME agreement and file signature, and computes SHA256. No document text or medical content is extracted.

Files use opaque owner/workspace/file identifiers in private `care-documents` Storage. Metadata retains original filename, uploader, type, size, checksum, time, upload/mapping/sharing status and duplicate/replacement links. Failed uploads or metadata commits preserve previous records and files; new-object cleanup is attempted after a failed commit. Removal excludes a file from the package before deleting stored bytes and offers retry if deletion fails.

Administrative filename categories can suggest consultation, imaging or prescription matches. A suggestion never makes a requirement available. Users choose a sourced requirement and explicitly confirm the mapping. Unmatched uploads remain available for review. Duplicate uploads are marked and retained. Replacements preserve version history and require fresh confirmation. Changes invalidate prepared packages.

Preparation requires the current revision, explicit package review, known requirements, all required files confirmed and at least one included document. Optional missing documents are allowed; uncertain requirements block preparation. The ordered manifest retains requirement sources, original filenames, exact upload metadata, mappings and confirmations. Its schema rejects foreign-owner files, changed requirement snapshots and stale or inconsistent package state.

## Sharing and medical boundary

The package stops at **Ready to share**, with `submittedToProvider: false` and every file `not_shared`. The UI explicitly says the hospital has no connected submission channel and no documents have been sent. There is no fake sharing tool, submission status or automatic delivery. Future delivery requires an actual hospital integration and a separate explicit recipient/package confirmation.

This workflow uses no LLM, OCR, embeddings or clinical analysis. Upload bytes never enter model input, research, application logs or analytics. The agent cannot diagnose, infer disease, interpret MRI/CT/lab results, recommend tests/treatment, assess severity or decide clinical suitability. File signature validation is format validation, not clinical validation or malware scanning.

## Database, RLS and storage

Migration `20261001090000_document_coordination.sql` creates the checklist, workspace and revision-audit tables; the service-only atomic `save_document_workspace` RPC; and private `care-documents` Storage with a 3 MiB limit and the three supported MIME types. The user successfully applied it with `supabase db push`. Remote checks confirmed the private bucket and limits.

Workspaces require a conversation owned by the same user. Hospital/service and owner/conversation scope are immutable. Revision checks and audit writes occur in one database transaction. Authenticated browser roles can only read their own workspaces/audits and published checklists; they cannot write these tables or call the mutation RPC. Storage SELECT additionally requires an owned workspace and an active file. Browser Storage uploads are denied.

The download proxy verifies the session, owner, workspace and active file, then reads through the authenticated Storage client. It returns the original file as an attachment with private/no-store, nosniff and sandbox headers. It exposes no public Storage URL or signed bearer link.

Validation included:

- Real migrated PostgreSQL policies and grants using `scripts/validate-document-rls.sql`; transaction rollback removed the fixtures.
- Actual remote Supabase users: other-owner list/update, mutation RPC, Storage read/write, public URL, package API and download API access were denied. Owner Storage reads succeeded. Anonymous and invalid sessions were denied.
- Actual deployed API requests from another disposable identity: mapping, removal, preparation and multipart upload against the owner's workspace all returned 403; the owner's revision remained unchanged.
- Owner download proxy returned bytes with the expected SHA256, size, original filename and all three security headers.

The browser Review file action produced no UI or console error. The in-app browser did not emit an observable download event for its blob attachment, so download byte/header verification was performed through the authenticated HTTP endpoint rather than claimed as an observed browser-saved file.

## Automated gates

| Gate | Result |
|---|---|
| New document tests | **82 passed** |
| Full `npm test` | **555 passed, 20 skipped; 575 total** |
| Test files | 14 passed, 5 skipped |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| Vercel production build | Passed |
| Local migrated SQL/RLS/grant checks | Passed |
| Remote Storage and API isolation | Passed |
| Secret scan | No configured server-secret values found in changed files or generated browser assets |
| `git diff --check` | Passed |

The 20 skipped tests are existing opt-in live integration suites. They were not counted as passed. Separate real Supabase, Storage and deployed document checks were executed as described above.

The 82 new tests cover sourced requirements and target relationships; approved research, absent/failed/instruction-like sources; format/size/path validation; hashes, duplicate/replacement/removal behavior; failed upload/save recovery and retry; suggested/ambiguous/unmatched/confirmed mappings; required/optional/unknown states; ordered package preparation and persistence; exact confirmation and owner/conversation scope; tool execution/provenance; and the clinical/sharing boundaries.

Final runtime review corrected document observations incorrectly labelled empty and preserved document-specific failure guidance. The restored activity projection now counts validated owned document records. An additional 16-check real production flow passed after these changes: sourced requirements, completed observations, required-missing state, incomplete-package rejection, actionable failure guidance, prior-upload preservation, all three formats, duplicate warning/removal, replacement confirmation, latest-file manifest, no submission, package/workspace recovery and restored activity count. The initial probe could not read raw run metadata with a browser role; the corrected validation probe used the existing service client with the disposable owner filter, preserving the application's restricted run-metadata access.

## Manual scenarios and deployed result

Local production build was tested at `http://localhost:3099/assistant`, using the real migrated remote Supabase project. The same full upload-to-package workflow was then repeated at [production `/assistant`](https://medbridge-medigence.vercel.app/assistant).

| Scenario | Observed result |
|---|---|
| A — Requirements | Selected hospital/service retrieved the explicitly labelled synthetic administrator source. |
| B — Upload | Valid PDF, PNG and JPEG uploaded privately, with real metadata and confirmation state. |
| C — Match | Explicit user confirmation made the correct sourced requirement available. |
| D — Missing | After confirming only consultation, UI and response showed **1 required document missing**; preparation stayed blocked. |
| E — Replace | Updated consultation PDF replaced the active selection, retained prior version history and required new confirmation. |
| F — Package | Reviewed manifest contained the updated PDF, imaging PNG and optional prescription JPEG in requirement order; 2/2 required and 1/1 optional were available. |
| G — Refresh | Full reload and conversation history restored the persisted documents and prepared package without replaying writes. |
| H — Cross-account | Real second-account access and additional deployed write attempts were denied; owner records remained unchanged. |
| I — No requirements | Demo Bangkok with an unsupported explicit service returned no reliable requirements, an empty checklist and disabled preparation. No generic checklist appeared. |
| J — No integration | Review sharing status retained **Ready to share** and explicitly stated no documents had been sent. |

Scenarios A–G and J passed locally and on production. H was checked through real local/deployed API and remote RLS/Storage requests; I was checked on production. The final deployed schema also restored and read the already-prepared manifest successfully.

Final feature deployment tested: `dpl_AFErHfiq19f5Ag4wFrTfVQSzxJAq`, **READY**, aliased to `medbridge-medigence.vercel.app`. Its code was deployed before committing, as required, to validate the actual production workflow first. A transient CLI authorization failure resolved on retry. Git checkpoint/deployment SHA verification is recorded in the task's final report.

Responsive checks passed at **320, 375, 390, 430, 768, 1024 and 1440 px**, locally and on production. Document inputs, selects, actions and package stayed within the viewport, without horizontal page overflow. Desktop and 390 px production screenshots were visually inspected. Captured browser warnings/errors were zero; no hydration errors were observed.

All disposable validation identities, their uploaded Storage objects, conversations/runs/workspaces/audits and the temporary synthetic checklist were removed after testing. The private bucket and migration remain. Temporary test servers and PostgreSQL were stopped, browser tabs closed and viewport overrides reset. No real patient files were used.

## Privacy, retention and limitations

- No automatic retention/purge policy exists yet. The UI discloses this. Users can remove active and superseded stored files; metadata and audit snapshots remain for coordination. A retention policy must be defined before promising a purge schedule.
- File signatures do not certify a safe/complete document; malware scanning is not implemented.
- Requirements need configured or directly documented sources. The reviewed external collection and exact statement extraction have limited coverage. There is no provider checklist administration UI in this release.
- Maximum 3 MiB per file, 30 requirements and 100 file-history entries per workspace; no DICOM, OCR, PDF merging or clinical content interpretation.
- A package is an ordered logical manifest, not a generated ZIP or hospital transmission. Users review/download originals and use the hospital's appropriate channel themselves.
- One immutable hospital/service target per conversation. A different target requires a new conversation.
- User-supplied requirements are explicitly attributed to the user, not represented as hospital verification.
- No new environment variables or dependencies are required. Existing Supabase server configuration and the applied migration are necessary.
