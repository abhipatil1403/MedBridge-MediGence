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

## Acceptance evidence

Validation and remaining gates will be recorded as implementation progresses. Completion requires the provider → change request → resubmission → approval → publication → public discovery/agent workflow, scoped support operations, RLS tests, the full existing suite, builds, responsive/browser checks, deployment and production tests.
