# MedBridge operational platform

## Scope and milestones

Baseline: `43f40850c86fa43d18da73abaa9f967efb1bcf62`. The public product, existing agents and private patient workspaces remain in place.

1. Organization membership, staff roles, append-only audit, staging revisions, RLS and transactional commands.
2. Provider onboarding, structured content/document management, team, review submissions, preview, messages and notifications.
3. Scoped support queues, patient-authorized cases, messages, notes, tasks, escalation and team workload.
4. Admin governance, field/evidence review, change requests, approval, publishing, canonical catalog management and real analytics.
5. Public published-data/agent integration, domain routing, complete regression and production validation.

Each milestone receives a logical commit. No dashboard metric, activity entry or verification outcome is generated for presentation alone.

## Data design

Reuse `profiles`, `cases`, `audit_events`, canonical `hospitals`, `doctors`, `treatments`, `packages`, catalog relations, source provenance, private document workspaces and verification services. New provider records are a private revision/review layer, not an alternative public catalog. Publishing projects approved immutable snapshots into existing canonical tables in one database transaction. A later draft cannot overwrite the published snapshot. Publishing approval and factual verification remain distinct.

Organization membership controls tenant content. Trusted staff assignments control support/admin access; user metadata and URL context never grant roles. Initial Super Admin bootstrap is restricted to the explicitly nominated existing account, `abhipatil1403@gmail.com`.

Every sensitive mutation uses an authenticated, permission-checking database command with optimistic revisions, lifecycle validation and audit. Direct authenticated table writes cannot bypass review. Private provider files use a separate private bucket. Patient conversations/documents are shared only through explicit patient-authorized support cases; staff role alone does not grant access to unrelated patient workspaces. Internal support notes have separate read policies from shared messages.

## Portals and hosting

Default paths: `/provider`, `/support`, `/admin`, each with its own login/navigation/workspace. Explicit configured host mappings can route future subdomains to the same paths without changing the current public domain. Host selection changes presentation only; the server and database still enforce permissions. Existing public magic-link callback and safe return paths are reused.

`/help` is the patient support entry point. A patient chooses one owned conversation/document workspace and an optional published hospital. Sharing checkboxes default to off. Creating a request requires explicit support consent, including direct RPC calls. Revocation immediately removes staff/provider access. Staff roles do not grant access to unrelated conversations, plans or uploaded medical documents.

No additional Vercel secrets are required beyond the existing Supabase and Cloudflare configuration. Keep `SUPABASE_SECRET_KEY` and the Cloudflare credentials server only. The public Supabase URL/publishable key remain browser configuration.

For future dedicated domains, set server-only `MEDBRIDGE_PORTAL_HOSTS` to an exact JSON mapping, for example `{"provider":"provider.example.com","support":"support.example.com","admin":"admin.example.com"}`. First attach those real domains to Vercel, configure DNS, and allow each domain’s `/auth/callback` in Supabase Auth. Keep `NEXT_PUBLIC_SITE_URL` pointing to the public site; portal links use it to leave a dedicated host. No wildcard or incoming Host header grants access. Leave the mapping empty for the current deployment. Authentication sessions are scoped to their browser origin; each dedicated host uses the standard sign-in flow.

## Operator workflow

1. Initial Super Admin: the service-only `bootstrap_portal_super_admin` RPC assigns the explicitly nominated existing account. `scripts/bootstrap-portal-admin.mjs` accepts the nominated email without embedding a secret. Bootstrap refuses to create a second initial admin.
2. Sign in at `/admin`. In Users & roles, assign Support Agent/Manager or Administrator to an existing account. Only Super Admin can grant/change admin roles. The last active Super Admin and last active organization administrator are protected.
3. Providers sign in at `/provider`, create an organization and save structured drafts. Drafts persist immediately and immutable history is read only. Team invitations are matching-email, expiring links that the inviter copies and shares; the app does not claim to send invitation emails.
4. Providers upload PDF/JPG/PNG evidence (maximum 3 MB), then submit. Submitted revisions lock. Assigned reviewers record field/document evidence and request changes, reject or approve. First-party identity and accreditation claims require current authoritative evidence; synthetic content cannot be marked verified.
5. Providers revise and resubmit. Administrators publish approved frozen revisions. New drafts do not replace public information. Unpublish/archive/expire actions require confirmation and preserve audit history. Suspending an organization suppresses its public catalog records.
6. Published hospital/doctor/package records reuse the canonical catalog, public directories and existing discovery/planning/comparison agents. Original package currencies are retained; no exchange rate is invented. Cross-currency budget checks remain unknown. Approved, published profile images are served through the guarded public image endpoint; private evidence files remain private.
7. Support agents claim unassigned authorized cases or work their assigned queue. Managers assign/reassign, escalate with a reason, and reopen resolved cases. Replies have explicit patient/provider/shared/internal visibility. Internal notes and tasks never appear to patients/providers. Case documents are downloaded only through a fresh consent/ownership check.

## Read models and permissions

All portal API requests require a verified bearer session and active account. Tables use server pagination/search/filtering; sortable fields are allowlisted per resource. Staff/team directories expose only the role-appropriate identities. Counts come from real rows; public listing metrics use anonymous publication policies so suspended/unpublished records are not presented as public. Task due-today counters state their UTC boundary.

Provider files use the private `provider-documents` bucket, with server-checked metadata and tenant authorization. Patient medical uploads continue to use the existing private `care-documents` bucket. No new public storage policy is introduced. Reviewer verification history is scoped by assignment and reuses the existing verification tool; no new agent is registered.

## Acceptance evidence

All nine `2026100210…` migrations were applied to hosted Supabase by the operator. A fresh local database installation, including the updated seed, passed the five existing RLS scripts and three portal RLS/workflow/governance scripts. Checks include optimistic revisions, tenant isolation, explicit consent, assigned review history, private file access, frozen publication, evidence precedence, last-admin protection and account suspension.

The full suite passed **718 tests in 22 files**, with all existing live agent gates enabled. Initial live API validation passed 21 gates covering draft CRUD, cross-tenant denial, private upload/download, change requests, resubmission, publication, INR pricing, canonical discovery search, immutable published preview, support messaging/tasks and audit. Consent revocation is checked when the isolated browser session closes.

Provider browser checks covered every navigation destination, all requested widths (320/375/390/430/768/1024/1440), mobile navigation, structured doctor draft saving, and unsaved-change confirmation. Final production build, administrator/support browser checks and deployed-release checks are still being completed; this document does not yet claim production validation.

Live integration command, with the ordinary application server running:

```powershell
$env:MEDBRIDGE_PORTAL_LIVE_TEST='1'
node --env-file=.env.local scripts/validate-portals-live.mjs
```

Set `MEDBRIDGE_TEST_ORIGIN` for a different local port or the deployed site. `--browser` starts a temporary localhost-only session broker for the isolated synthetic actors. It redirects ordinary Supabase sessions through the existing auth callback and is never part of the application deployment. Finish browser testing and stop the broker with Ctrl+C to revoke test consent, archive test organizations and disable test accounts. Immutable audit history is retained. No real patient data or external email is used.
