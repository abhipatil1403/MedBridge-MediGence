# Provider network activation

Baseline inspected: clean `main` at `ab73db3808a02cefe6164f11b38d46d2e751e7f6`.

## Initial gaps

- Authentication, tenant draft workspaces, email-bound expiring invitations,
  private evidence, immutable listing submissions, section review, explicit
  publication, scoped inquiries, file consent and persisted notifications exist.
- Organization registration currently creates active draft membership; it does
  not establish that the registrant represents a healthcare organization.
- There is no separate ownership review or canonical reference-listing claim.
  Organization identity, listing approval and operational readiness are conflated.
- The production workspace named TEST has one member, no evidence, no canonical
  hospital and no published record. It is not a participating healthcare provider.
- Provider response access needs a current organization-ownership approval,
  independent of draft membership and catalog publication.
- Team invitation expiry and consequential access changes need clearer feedback;
  Admin and Support need factual readiness rather than a completeness percentage.

## Implementation scope

Reuse organizations, members, invites, provider documents, listing revisions,
publication commands, inquiry commands, notifications and append-only audit.
Add narrowly scoped private ownership-review requests and canonical ownership
associations; these represent facts the current schema cannot store separately.
No parallel account, organization, listing or inquiry model is introduced.

Unverified users retain their private preparation workspace. Only an approved,
current ownership review and active operational membership permit inquiries.
Canonical ownership is assigned by an administrator with confirmation and a
reason; name/domain resemblance never grants access. Approval does not publish.
Reference provenance survives until an explicitly reviewed provider snapshot is
published into that same canonical identity.

The real-world acceptance gate requires a participating healthcare organization,
an authorized provider account and express agreement to test a controlled inquiry.
No such participant is established by the current production data. Implementation
and isolated QA can proceed; production activation must not be represented as
complete without that participant.

## Operational runbook

1. A participating provider signs in, registers one private organization and uploads
   authority evidence using the existing private Documents workflow.
2. In Profile/onboarding, select an eligible published hospital when claiming an
   existing listing; provide legal identity, official contact and authority declaration.
   Submit with explicit confirmation. New organizations may prepare a new draft.
3. Admin reviews the document in the existing Documents workflow, then opens the
   organization onboarding panel. Independently confirm representation through an
   official contact, record how confirmation was obtained, and approve, reject or
   request changes with a reason. Registration and evidence alone do not prove authority.
4. Admin assigns the exact canonical hospital, and optionally binds its matching
   unpublished organization draft. Assign doctors/packages only under that hospital.
   Existing active ownership conflicts must be revoked explicitly before reassignment.
5. Provider draft submission, section review, approval and explicit publication remain
   separate. A reviewed provider snapshot replaces the same canonical hospital identity;
   reference children remain eligible under their own governed publication.
6. Use the existing seven-day, email-bound manual invitation link. No invitation email,
   SMS or hospital acceptance is claimed. Roles remain provider_admin/provider_editor.
7. A patient submits an inquiry. Support assigns it, and the patient explicitly authorizes
   the named connected organization. Documents require their own recipient/purpose grant.
   Authorized members can respond through the existing inquiry flow; patient and Support
   see persisted responses, events and notifications.
8. Suspension, member revocation, expired/rejected authority evidence and canonical
   ownership revocation are evaluated on every protected access, including existing sessions.

## Data and permission changes

Migration `20261009110000_provider_network_activation.sql` adds authority-request history,
canonical operational ownership and idempotent operation receipts. Existing organizations,
membership, document, review, publication, inquiry, notification and audit tables are reused.
No organization is grandfathered into approval. Private evidence/contact prose is confined
 to authorized Admin/member reads. Support sees safe readiness facts; anonymous users cannot
read any new private table or execute the new operational RPCs. Server keys stay server-side.
The existing unique hospital binding now distinguishes independent reference publishers
from a single operational organization. Approval never publishes or grants patient consent.

## Validation and limitations

- 936 unit/integration tests passed; 39 opt-in tests skipped by the standard suite.
- All 19 database validation scripts passed, including fresh install, migration reapplication,
  existing governance, publication, privacy, consent and inquiry/provider coordination.
- Network assertions cover self-approval denial, scope isolation, current evidence,
  official-contact confirmation, explicit canonical assignment, conflicting ownership,
  same-ID first-party publication, authenticated patient-visible response, suspension,
  member/evidence/ownership revocation, retry conflicts and role downgrade before cached retry.
- Actual local UI submission, Admin decision/assignment and manual invitation were exercised
  against a disposable PostgreSQL database. These are isolated QA actors and simulated evidence;
  they do not establish a real Supabase sign-in or hospital participation.
- Provider Team, Admin authority review and Support readiness passed 320/375/390/430/768/1024/1440
  pixels (21 views) without page overflow. Support never displayed private review contacts.
  English, Hindi and Marathi, unchecked confirmations and modal focus return were inspected.
- Temporary local QA pages/API were removed before release. No production provider fixture,
  hospital outreach, genuine patient file or fabricated provider response was created.

Visual review: 92/100 for the changed portal surfaces. Strengths: factual readiness, explicit
consequential confirmations, readable private history, contained mobile tables and reused
portal design. P2 limitations: a long Admin review panel, manual official-contact confirmation
and manual invitation distribution. No unresolved P0/P1 visual defect in changed components.
External delivery is deliberately reported as unavailable; in-app persistence is implemented.

**Real provider acceptance remains blocked.** No participating healthcare organization,
authorized provider email/listing or independently confirmed authority was supplied. The
existing production TEST workspace remains unapproved and unconnected. Technical release
may ship after its gates pass, but the real-provider milestone must not be marked complete.
Exact deployed SHA and production-gate results are recorded in the release report delivered
with this change; a documentation commit cannot contain its own commit SHA.
