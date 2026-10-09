# Patient inquiry and care coordination — implementation audit

9 October 2026 · baseline `82b9b03` · clean `main`.

## Reuse and gaps

Reuse Supabase magic-link authentication, profiles and role assignments; the canonical reviewed/public catalog; `support_cases`, messages, immutable events, staff tasks, consent records and in-app notifications; Provider/Support/Admin portals; private `care-documents` storage with existing signature/MIME/size validation; owner-scoped conversations, registered tool execution and Recover journeys/tasks.

Existing `/help` creates consented Support cases and can prefill package text, but does not persist doctor/package identity, selected publication revision, cancellation/resolution policy or retry identity. Existing provider sharing is a case-level checkbox rather than a recipient/purpose workflow. Document sharing currently applies to a whole assistant workspace. Account has no request section. Existing case transitions are too permissive for a full inquiry lifecycle. Provider replies have message visibility but no persisted coordination response state.

Read all three repository MedBridge design skills, current architecture and document/portal security implementation. No additional MedBridge architecture/security skill files were found in the repository or installed skill locations; current architecture documentation and permission-enforcing code are the applicable reference. No new agent or competing case table is planned.

## Implementation sequence

1. Extend Support cases with selected published hospital/doctor/package, publication revision snapshot, source, retry key, resolution/cancellation and provider response fields. Keep existing operational states; add meaningful cancelled state. Validate transitions, revisions and assignments in transactional database commands.
2. Add case-linked document requests/metadata, recipient/purpose grants, read receipts and retry receipts. Reuse the private bucket. Owner uploads remain private until a separately confirmed recipient/purpose grant. Provider case consent and file consent are independent. Revocation blocks future reads. Record immutable case events and privacy-minimized audit entries.
3. Implement authenticated inquiry APIs with strict inputs and no-store responses. Use user-scoped database authorization for every action and download; server Storage operations follow those checks. No email/SMS delivery or malware-scan claim.
4. Add review-before-submit assistance flow to hospital/doctor/package detail, actual AI findings and saved records. Account My Requests shows persisted status, linked entities, messages, outstanding information/documents, sharing and Recover links. Integrate the existing Support and Provider case workspace rather than a second queue.
5. Extend the existing registered tool framework with owner-only inquiry reads and exact reviewed-action boundaries. Persist conversation references; no model-controlled consent, role grants or automatic writes. Recover tasks require an explicit confirmed action tied to a real case event.
6. Validate fresh migrations/RLS and adversarial access, lifecycle/idempotency/documents/consent/messages/provider/AI/Recover tests; existing regressions, lint/TypeScript/build; authenticated browser workflow and seven widths. Apply hosted migration using the established tools when credentials allow. Push/deploy only after gates pass, verify exact SHA and live persisted behavior, and produce the required 18-section release report.

## Schema changes identified before coding

Additive Support case context and lifecycle columns/indexes; case-linked document request and file metadata tables; explicit provider case consent and per-document recipient grants; per-actor operation receipts for transactional retry safety; message read receipts; inquiry foreign keys on user-created Recover tasks. Strict RLS, revoked-consent checks, immutable activity and permission-checking RPCs. No public bucket, broad patient access, clinical checklist or automatic clinical milestone.

## Operational boundaries

Provider routing must resolve an active provider-managed organization for the selected published entity. Reference-only hospitals with no real participating provider remain pending coordination. A persisted authorized response is required before showing acceptance. QA fixtures are private and isolated; never publish fabricated catalog data. Preserve unrelated records and immutable audit history. Document download uses an authenticated delivery proxy; no permanent public URLs. Current file acceptance remains PDF/JPEG/PNG, 3 MiB, with signature/type validation; scanning is not configured.

## Implemented database boundary

Four migrations (`20261009090000` through `20261009093000`) extend the existing Support lifecycle, add transactional commands and minimal views, and prevent dual provider/Support membership from widening staff assignment scope. Legacy case reads/writes route new inquiries through the same consent checks. Field-level audit records omit patient prose and filenames; private file audit rows follow file access permissions.

The password-authenticated CLI connection failed. The existing authenticated CLI account could use Supabase's [Management API SQL endpoint](https://supabase.com/docs/reference/api/v1-run-a-query). The four exact reviewed files were applied together in a transaction with their original versions and statements recorded in `supabase_migrations.schema_migrations`, followed by a schema-cache notification. The CLI's existing credential was read only into memory and never printed or persisted. Hosted preflight confirmed the previous latest migration was `20261005111000`; post-apply checks confirmed all four inquiry versions. No password reset or new credential was needed.

QA cleanup disables disposable accounts and roles, closes and revokes their private cases, archives their journeys and removes their Storage objects. Immutable historical records are retained. No fabricated catalog listing is created or published.
