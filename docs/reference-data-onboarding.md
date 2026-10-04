# Governed reference onboarding

The Admin workspace is `/admin/reference-data`. Only active Admin and Super Admin accounts can create, review or publish reference data. The database enforces these permissions for direct RPC access too.

## Workflow

1. Record the official public HTTPS source, category, actual collection time and appropriate review due date.
2. Create a private reference organization. It has `onboarding_origin=admin_reference` and external provenance; no provider membership is invented.
3. Save the profile and exact locations. Save each specialty, procedure, doctor, facility, service or package against its documented branch.
4. Attach evidence to **every populated field**, including the name. Associations contain the exact immutable value and revision.
5. Submit the frozen revision. Missing source associations prevent submission.
6. Check each field against its source and record its decision. Approve every frozen section; then approve the submission.
7. Explicitly publish the approved submission. This invokes the existing canonical projector. Public pages and agents use that canonical catalog.

Previously published revisions remain visible while a new draft is edited. Archival hides the listing and dependent public records while retaining immutable history. Stale, conflicting or unresolved reference evidence cannot support publication. Public projections exclude private evidence, notes, operator identities, raw supported values and private files.

### Sourced starter controls

The bounded starter collection first creates taxonomy **drafts**. Review and explicitly publish the country, city, specialty and treatment identities before preparing provider drafts. Existing taxonomy IDs are preserved where appropriate; sample clinical descriptions, travel notes and unsupported treatment details are cleared in the reviewed drafts.

Preparing a provider records sources and field associations only. It never submits, approves or publishes. Retrying preserves matching drafts and stops on edited data, duplicate workspaces or different source associations. Each of the five providers requires the same section review, approval and explicit publication used by manual onboarding.

The implementation uses the authenticated Admin's ordinary client and governed RPCs. It does not use a service-role publication shortcut.

## Initial collection

Collected 4 October 2026 at 07:53:07 UTC. Editorial review due 2 January 2027. The due date is a refresh reminder, not a guarantee of clinical accuracy or appointment availability.

| Exact branch | Documented scope | Official sources |
| --- | --- | --- |
| Kokilaben Dhirubhai Ambani Hospital, Andheri West, Mumbai | Orthopaedics, total knee replacement, Dr. Sandeep Wasnik | [Contact](https://www.kokilabenhospital.com/contacts/mapsanddirection.html), [Bone & Joint](https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint.html), [Procedure](https://www.kokilabenhospital.com/departments/centresofexcellence/centrefor_bonejoint/totalkneereplacement.html), [Doctor](https://www.kokilabenhospital.com/professionals/sandeepwasnik.html) |
| Deenanath Mangeshkar Hospital, Erandwane, Pune | Orthopaedics, knee replacement, Dr. Hemant Wakankar, documented physiotherapy and Emergency Room | [Contact](https://www.dmhospital.org/patient-and-visitors), [Orthopaedics](https://www.dmhospital.org/specialty-details/ORTHOPAEDICS), [Joint replacement](https://www.dmhospital.org/specialty-details/JOINT-REPLACEMENT), [Doctor](https://www.dmhospital.org/doctor-details/HEMANT-WAKANKAR) |
| Max Super Speciality Hospital, Saket, New Delhi | Cardiology, oncology, chemotherapy, Dr. Balbir Singh | [Branch](https://www.maxhealthcare.in/hospital-network/max-super-speciality-hospital-saket), [Doctor](https://www.maxhealthcare.in/doctor/dr-balbir-singh) |
| Manipal Hospital, Old Airport Road, Bengaluru | Orthopaedics, cardiology, knee replacement documented in Dr. Sunil G Kini's branch profile | [Contact](https://www.manipalhospitals.com/oldairportroad/contact-us/), [Orthopaedics](https://www.manipalhospitals.com/oldairportroad/specialities/orthopaedics/), [Cardiology](https://www.manipalhospitals.com/oldairportroad/specialities/cardiology/), [Doctor](https://www.manipalhospitals.com/oldairportroad/doctors/dr-sunil-g-kini-consultant-orthopedic-arthroscopic-and-joint-replacement-surgery/) |
| Apollo Hospitals, Greams Road, Chennai | Orthopaedics, total knee replacement, Dr. Veerabahu Muthusamy | [Branch](https://www.apollohospitals.com/hospitals/apollo-hospitals-greams-road-chennai), [Doctor](https://www.apollohospitals.com/doctors/orthopedician/chennai/dr-veerabahu-muthusamy) |

Taxonomy also uses the [National Portal of India](https://www.india.gov.in/explore-india) and [Pune district government website](https://pune.gov.in/). The complete field manifest is `lib/reference-data/starter.ts`; taxonomy drafts are defined in `lib/reference-data/taxonomy.ts`.

### Coverage and gaps

The reviewed manifest contains five hospital profiles, five exact locations, seven specialty sections, five procedure associations, five doctors and two facilities: **29 sections and 146 populated claims**. It provides two canonical treatment identities: knee replacement and chemotherapy. Four specific branches document knee replacement; the Saket branch documents chemotherapy.

There are **no packages or prices** in this collection. International patient services, accreditation attestations, consultation modes, registration status, outcomes, patient counts and doctor experience figures remain unconfirmed. Some contacts and languages are also unavailable. Apollo's referenced doctor page does not establish current appointment availability.

Organization-name verification applies only to the identity claim checked against the official source. Other sourced fields receive publication review; this does not independently verify clinical quality, accreditation or suitability. Provider marketing logos are not accreditation evidence.

No provider images or marketing copy were imported. Sources support concise structured facts. Offerings are limited to the explicit branch and country; the existence of another location does not establish the same treatment, package, facility or service there.

## Validation

`scripts/validate-reference-onboarding.sql` exercises role isolation, immutable claims, unresolved evidence, explicit publication, safe public provenance, branch scope, revisions and archive behavior. `scripts/generate-reference-starter-qa.mjs` generates a rollback-only transaction that validates the actual collection through governed RPCs on a disposable local `production_catalog_*` database.

`tests/reference-public-catalog.test.ts` runs against an explicitly configured loopback anonymous PostgREST catalog. Historical model regressions use an explicit isolated synthetic fixture file; that fixture is never a production fallback. The hosted public privacy gate uses ordinary anonymous credentials.

Both onboarding migrations are applied to the hosted project. Final deployment, publication counts and production checks are recorded in the release report after verification.
