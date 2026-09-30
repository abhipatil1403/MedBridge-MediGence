# Feature matrix

Implemented milestone, 30 September 2026: the existing assistant now routes DiscoveryAgent and TreatmentPlanningAgent, persists coordination plans/tasks, restores plan context across follow-ups and refresh, filters sample packages by user-provided USD budgets, and tracks user reviews. Catalog provenance/demo labels and deterministic search fallback are preserved. External provider contact, booking, payment, travel, and clinical treatment decisions remain future work. The historical planning table below is a roadmap rather than an exhaustive current implementation ledger.

Planning baseline, 28 September 2026. `O` = observed on a public [MediGence page](MEDIGENCE_REFERENCE_AUDIT.md); `D` = described publicly but later authenticated steps were not inspected; `U` = unverified on the public reference, proposed for MedBridge. `P0` foundation, `P1` core discovery/coordination, `P2` operational depth, `P3` later expansion. All features below are **planned**, except the site shell marked **foundation built**. This matrix is scope, not a claim of functional integration.

Compact column terms: frontend names the principal view; backend names the server capability; database names the core entity; AI names an agent (`—` means deterministic only); automation names a trigger/action; integration names a needed external service (`—` means none initially). `Auth`, `Storage`, `Pay`, `Video`, `Mail`, `Maps`, `Travel` mean Supabase Auth, Supabase Storage, a payment provider, video provider, email/SMS, geocoding/maps, or vetted travel vendor respectively. Selection does not authorize a vendor or assert a current connection.

| Feature | MediGence Reference | MedBridge Implementation | User Type | Frontend | Backend | Database | AI Agent | Automation | External Integration | Priority | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Global search | O directories | Typed federated search | Patient | Search page | Search service | Taxonomy/provider | Discovery | Query indexing | — | P1 | Planned |
| Natural-language search | O home claim; flow U | Clarified, sourced results | Patient | Guided search | Intent + tools | AI run | Discovery | Intent routing | LLM | P2 | Planned |
| Treatment search | O | Name/alias search | Patient | Directory | Search service | Treatment | Discovery | Index refresh | — | P1 | Planned |
| Hospital search | O | Place/procedure filters | Patient | Directory | Provider query | Hospital | Hospital matching | Index refresh | — | P1 | Planned |
| Doctor search | O | Specialty/place filters | Patient | Directory | Provider query | Doctor | Doctor matching | Index refresh | — | P1 | Planned |
| Specialty search | O taxonomy | Specialty landing/search | Patient | Index | Taxonomy query | Specialty | Discovery | Index refresh | — | P1 | Planned |
| Country search | O | Country index | Patient | Destination index | Location query | Country | Discovery | Index refresh | — | P1 | Planned |
| Destination search | O | Country/city results | Patient | Destination list | Location query | Destination | Discovery | Index refresh | Maps | P1 | Planned |
| Treatment directory | O sitemap | Reviewed catalog | Patient | List | Catalog query | Treatment | — | Publish index | — | P1 | Planned |
| Treatment details | O | Reviewed overview | Patient | Detail | Content read | Treatment content | — | Review expiry | — | P1 | Planned |
| Procedure information | O | Procedure tabs | Patient | Article sections | Content read | Procedure | Clinical summary | Review expiry | — | P1 | Planned |
| Treatment cost | O | Dated sourced estimate | Patient | Cost table | Cost service | Cost observation | Cost | Stale flag | FX source | P1 | Planned |
| Country cost comparison | O | Like-for-like ranges | Patient | Comparison table | Calculator | Cost observation | Comparison | Refresh/stale | FX source | P1 | Planned |
| Treatment packages | O | Active offers | Patient | Package list | Offer query | Package | Package | Expiry | — | P1 | Planned |
| Related hospitals | O | Eligible links | Patient | Provider list | Match query | Hospital procedure | Hospital matching | Reindex | — | P1 | Planned |
| Related doctors | O | Eligible links | Patient | Clinician list | Match query | Doctor procedure | Doctor matching | Reindex | — | P1 | Planned |
| Treatment FAQs | O | Reviewed FAQs | Patient | Accordion | Content read | Content item | — | Review reminder | — | P1 | Planned |
| Hospital directory | O | Provider list | Patient | Directory | Provider query | Hospital | — | Verification reminder | — | P1 | Planned |
| Hospital filters | O route dimensions | Place/service/accreditation | Patient | Filter rail | Filter query | Hospital links | Hospital matching | — | — | P1 | Planned |
| Hospital profile | O | Verified record | Patient | Profile | Provider read | Hospital | — | Review expiry | — | P1 | Planned |
| Accreditation | O labels | Issuer, scope, expiry evidence | Patient/Admin | Evidence panel | Verification workflow | Accreditation | — | Expiry alert | Issuer source | P2 | Planned |
| Hospital specialties | O | Mapped taxonomy | Patient/Admin | Specialty list | Mapping query | Hospital specialty | — | Mapping review | — | P1 | Planned |
| Hospital procedures | O | Mapped procedures | Patient/Admin | Procedure list | Mapping query | Hospital procedure | — | Mapping review | — | P1 | Planned |
| Hospital facilities | O | Verified facilities | Patient/Admin | Facility list | Provider read | Hospital | — | Review reminder | — | P2 | Planned |
| Hospital doctors | O | Affiliation list | Patient | Clinician list | Relationship query | Doctor hospital | Doctor matching | Affiliation review | — | P1 | Planned |
| Hospital costs | O estimate CTA | Sourced offers only | Patient | Cost panel | Quote service | Cost offer | Cost | Expiry | — | P2 | Planned |
| Hospital packages | O | Active linked offers | Patient | Offer list | Offer query | Package | Package | Expiry | — | P1 | Planned |
| Hospital location | O | Address and map | Patient | Location panel | Location query | City/address | — | Geocode | Maps | P2 | Planned |
| Hospital enquiry | O | Consent-backed request | Patient | Enquiry form | Case intake | Enquiry/case | Case intake | Assignment | Mail | P1 | Planned |
| Treatment quote | O | Quote request and response | Patient/Staff | Quote panel | Quote workflow | Quote | Cost | Coordinator task | Mail | P2 | Planned |
| Doctor directory | O | Verified list | Patient | Directory | Doctor query | Doctor | — | Review reminder | — | P1 | Planned |
| Doctor specialty filter | O route | Controlled taxonomy | Patient | Filter | Filter query | Doctor specialty | Doctor matching | — | — | P1 | Planned |
| Doctor country filter | O route | Country selector | Patient | Filter | Filter query | Doctor location | Doctor matching | — | — | P1 | Planned |
| Doctor hospital filter | O affiliation | Hospital selector | Patient | Filter | Filter query | Doctor hospital | Doctor matching | — | — | P1 | Planned |
| Doctor profile | O | Verified profile | Patient | Profile | Doctor read | Doctor | — | Review expiry | — | P1 | Planned |
| Qualifications | O | Evidence-backed credentials | Patient/Admin | Credentials | Verification workflow | Credential | — | Expiry alert | Registry if available | P2 | Planned |
| Experience | O | Verified dates/roles | Patient/Admin | Timeline | Provider read | Doctor experience | — | Review reminder | — | P2 | Planned |
| Doctor procedures | O | Competency mapping | Patient | Procedure list | Mapping query | Doctor procedure | Doctor matching | Review mapping | — | P1 | Planned |
| Languages | O | Controlled language codes | Patient | Profile/filter | Query | Doctor language | — | — | — | P2 | Planned |
| Consultation | O | Service and booking | Patient | Booking flow | Booking service | Consultation | Consultation | Reminder | Video/Pay | P2 | Planned |
| Availability | D; live slots U | Source-of-truth slots | Patient | Slot picker | Slot reservation | Slot | — | Release hold | Calendar | P2 | Planned |
| Doctor second opinion | O cross-link | Specialist review request | Patient | CTA/intake | Opinion workflow | Opinion case | Second opinion | Assignment | Pay | P2 | Planned |
| Destination discovery | O | Location guides | Patient | Country index | Guide query | Destination | Discovery | Content review | — | P1 | Planned |
| Country medical tourism | O | Reviewed country guide | Patient | Country detail | Content read | Country/content | Travel | Review expiry | — | P1 | Planned |
| Country treatment cost | O | Dated cost table | Patient | Cost table | Calculator | Cost observation | Cost | Stale flag | FX source | P1 | Planned |
| Country hospitals | O | Eligible options | Patient | Provider list | Query | Hospital | Hospital matching | Reindex | — | P1 | Planned |
| Country doctors | O | Eligible options | Patient | Clinician list | Query | Doctor | Doctor matching | Reindex | — | P1 | Planned |
| Country travel | O | Checklist/service entry | Patient | Travel panel | Travel workflow | Travel request | Travel | Checklist | Travel | P2 | Planned |
| Visa | O | Corridor guide + request | Patient | Visa form | Request workflow | Visa request | Travel | Missing docs | Rule source | P2 | Planned |
| Accommodation | O | Assisted request | Patient | Stay form | Request workflow | Accommodation request | Travel | Coordinator task | Travel | P2 | Planned |
| Transportation | O homepage | Assisted request | Patient | Transport form | Request workflow | Transport request | Travel | Coordinator task | Travel | P2 | Planned |
| Treatment comparison | O | Treatment options table | Patient | Compare | Comparison service | Treatment/cost | Comparison | Recalculate | — | P2 | Planned |
| Country comparison | O | Two-country table | Patient | Compare | Comparison service | Country/cost | Comparison | Refresh | FX source | P1 | Planned |
| Cost comparison | O | Normalized price basis | Patient | Breakdown | Calculator | Cost observation | Cost | Stale flag | FX source | P1 | Planned |
| Hospital comparison | U | Verified attributes table | Patient | Compare | Comparison service | Hospital | Hospital matching | Refresh | — | P2 | Planned |
| Doctor comparison | U | Verified attributes table | Patient | Compare | Comparison service | Doctor | Doctor matching | Refresh | — | P3 | Planned |
| Case creation | D | Draft case | Patient | Intake wizard | Case service | Patient case | Case intake | Assign | Auth | P2 | Planned |
| Patient information | D | Identity and consent | Patient | Intake step | Profile service | Patient profile | Case intake | Missing fields | Auth | P2 | Planned |
| Medical history | D | Structured history | Patient | Intake step | Clinical intake | Case history | Clinical summary | Completeness | — | P2 | Planned |
| Diagnosis | D | Patient-reported/verified distinction | Patient | Intake step | Clinical intake | Case condition | Case intake | Review flag | — | P2 | Planned |
| Symptoms | D | Patient-reported symptoms | Patient | Intake step | Clinical intake | Case symptom | Case intake | Clarify | — | P2 | Planned |
| Investigations | D | Dated investigation entries | Patient | Intake step | Clinical intake | Investigation | Document | Missing report | Storage | P2 | Planned |
| Document upload | D | Private, scanned files | Patient | Uploader | Storage service | Document | Document | Scan/extract | Storage | P2 | Planned |
| DICOM | D | Protected imaging workflow | Patient | DICOM uploader | Imaging service | Document/imaging | Document | Metadata extraction | DICOM storage/viewer | P2 | Planned |
| Specialist selection | D matching | Preference and staff assignment | Patient/Staff | Choice/queue | Assignment | Opinion review | Second opinion | Candidate shortlist | — | P2 | Planned |
| Destination preference | D | Country preference | Patient | Intake step | Case service | Case preference | Case intake | — | — | P2 | Planned |
| Service type | O | Written/video/board | Patient | Plan selector | Catalog/eligibility | Opinion service | Second opinion | Eligibility | — | P2 | Planned |
| Opinion payment | D | Idempotent order | Patient | Checkout | Payment service | Order/payment | — | Reconcile | Pay | P2 | Planned |
| Clinical workbench | D | Role-scoped case view | Clinician/Staff | Workbench | Review service | Case/review | Clinical summary | Review queue | Storage | P2 | Planned |
| Clinical review | D | Signed professional review | Clinician | Review editor | Review service | Opinion review | Clinical summary | SLA reminder | — | P2 | Planned |
| Opinion report | D | Versioned signed report | Patient/Clinician | Report view | Report service | Opinion report | — | Delivery notice | Storage/Mail | P2 | Planned |
| Opinion consultation | D | Follow-up booking | Patient | Booking | Booking service | Consultation | Consultation | Reminder | Video/Pay | P2 | Planned |
| Consultation doctor discovery | O | Eligible doctor search | Patient | Directory | Doctor query | Doctor | Doctor matching | — | — | P2 | Planned |
| Slot selection | D | Timezone-aware reservation | Patient | Picker | Slot service | Slot/hold | — | Hold expiry | Calendar | P2 | Planned |
| Consultation booking | D | Confirmed booking | Patient | Wizard | Booking service | Consultation | Consultation | Confirmation | Mail | P2 | Planned |
| Consultation patient info | D | Linked profile | Patient | Form | Profile service | Patient profile | Case intake | Missing info | Auth | P2 | Planned |
| Consultation documents | O prompt | Private attachments | Patient | Uploader | Storage service | Document | Document | Scan | Storage | P2 | Planned |
| Consultation payment | D | Idempotent checkout | Patient | Checkout | Payment service | Order/payment | — | Reconcile | Pay | P2 | Planned |
| Appointment | D | Timeline and join details | Patient/Doctor | Detail | Appointment service | Consultation | Consultation | Reminders | Video/Mail | P2 | Planned |
| Video session | D | Provider-backed room | Patient/Doctor | Join view | Session service | Session | — | Session event | Video | P2 | Planned |
| Post-consultation | D | Notes and follow-up | Patient/Doctor | Summary | Note workflow | Consultation note | Clinical summary | Follow-up | Mail | P2 | Planned |
| Flight request | O travel link | Assisted planning | Patient/Staff | Travel form | Request service | Flight request | Travel | Coordinator task | Travel | P2 | Planned |
| Airport transfer | O service | Confirmed pickup | Patient/Staff | Itinerary | Request service | Transport request | Travel | Arrival reminder | Travel | P2 | Planned |
| Local transport | O service | Trip requests | Patient/Staff | Itinerary | Request service | Transport request | Travel | Task | Travel | P3 | Planned |
| Interpreter | O service | Language request | Patient/Staff | Service form | Request service | Service request | Travel | Assignment | Vendor | P3 | Planned |
| Travel checklist | O described | Case-specific tasks | Patient | Checklist | Rule engine | Travel task | Travel | Due reminders | — | P2 | Planned |
| Travel timeline | O narrative | Real itinerary | Patient/Staff | Timeline | Timeline service | Travel event | Travel | Change alert | Travel | P2 | Planned |
| Package discovery | O | Search and filter | Patient | List | Offer query | Package | Package | Expiry | — | P1 | Planned |
| Package details | O | Offer version view | Patient | Detail | Offer read | Package | Package | Expiry | — | P1 | Planned |
| Inclusions | O | Structured line items | Patient | Table | Offer read | Package item | — | Validation | — | P1 | Planned |
| Exclusions | U detail incomplete | Explicit line items | Patient | Table | Offer read | Package item | — | Validation | — | P1 | Planned |
| Package hospital | O | Verified link | Patient | Provider panel | Offer read | Package/hospital | Package | Verification | — | P1 | Planned |
| Package doctor | U varies | Only if confirmed | Patient | Clinician panel | Offer read | Package/doctor | Package | Verification | — | P2 | Planned |
| Package accommodation | O service | Included or optional | Patient | Line item | Offer read | Package item | Travel | — | Travel | P2 | Planned |
| Package transport | O service | Included or optional | Patient | Line item | Offer read | Package item | Travel | — | Travel | P2 | Planned |
| Package coordination | O service | Case assignment | Patient/Staff | Timeline | Case service | Assignment | Care coordinator | Task creation | — | P2 | Planned |
| Package booking | O CTA | Quote then confirmed order | Patient | Checkout | Order service | Order | Package | Confirmation | Pay | P2 | Planned |
| Recovery packages | O | Reviewed service catalog | Patient | List/detail | Catalog | Recovery package | Recovery | Review expiry | — | P2 | Planned |
| Rehabilitation | O | Clinician plan | Patient/Clinician | Plan | Plan service | Recovery plan | Recovery | Task schedule | Vendor | P2 | Planned |
| Physiotherapy | O service | Session tracking | Patient/Therapist | Schedule | Service workflow | Recovery task | Recovery | Reminder | Vendor | P3 | Planned |
| Nutrition | O service | Clinician-approved plan | Patient/Dietitian | Plan | Plan service | Recovery plan | Recovery | Reminder | Vendor | P3 | Planned |
| Medication support | O home claim | Reminders, no prescribing | Patient | Medication list | Reminder service | Recovery task | Recovery | Missed-dose notice | Mail | P3 | Planned |
| Recovery follow-up | O service | Appointment loop | Patient/Clinician | Timeline | Booking service | Follow-up | Recovery | Reminder | Video | P2 | Planned |
| Remote monitoring | O home claim | Device/data only if validated | Patient/Clinician | Check-in | Monitoring service | Observation | Recovery | Threshold escalation | Device | P3 | Planned |
| Local doctor handover | O home claim | Consent-backed summary | Patient/Staff | Handover | Export service | Handover | Care coordinator | Task | Mail | P3 | Planned |
| Progress tracking | D dashboard | Dated tasks/check-ins | Patient/Staff | Timeline | Progress service | Check-in | Recovery | Escalation | — | P2 | Planned |
| Patient registration | O | Supabase identity | Patient | Register | Auth adapter | Auth/profile | — | Verification | Auth/Mail | P2 | Planned |
| Patient login | O | Session + MFA policy | Patient | Login | Auth adapter | Auth | — | Security event | Auth | P2 | Planned |
| Patient profile | D account | Consent-aware profile | Patient | Profile | Profile service | Patient profile | — | Incomplete alert | Auth | P2 | Planned |
| Patient cases | D | Case list/detail | Patient | Dashboard | Case query | Patient case | Care coordinator | Next-action task | — | P2 | Planned |
| Patient documents | D | Access-controlled vault | Patient | Documents | Document service | Document | Document | Scan/expiry | Storage | P2 | Planned |
| Patient appointments | D | Appointments | Patient | Schedule | Booking query | Consultation | Consultation | Reminder | Calendar | P2 | Planned |
| Patient consultations | D | Visit history | Patient | List | Consultation query | Consultation | — | Follow-up | Video | P2 | Planned |
| Patient second opinions | D | Status/report | Patient | Case view | Opinion query | Opinion case | Second opinion | Status notice | — | P2 | Planned |
| Patient treatment plans | U | Clinician-approved plan | Patient | Plan view | Plan service | Care plan | — | Review reminder | — | P2 | Planned |
| Patient travel | D service | Itinerary/tasks | Patient | Travel view | Travel query | Travel request | Travel | Reminder | Travel | P2 | Planned |
| Patient payments | D | Orders/receipts | Patient | Billing | Payment query | Order/payment | — | Reconcile | Pay | P2 | Planned |
| Patient notifications | O empty control | Preference-aware inbox | Patient | Inbox | Notification | Notification | — | Dispatch | Mail | P2 | Planned |
| Patient messages | O contact | Secure case messaging | Patient/Staff | Conversation | Messaging | Support message | Care coordinator | Escalation | Mail | P2 | Planned |
| Patient recovery | D | Active plan | Patient | Recovery view | Plan query | Recovery plan | Recovery | Check-in | — | P2 | Planned |
| Care coordinator | O service | Assigned owner/queue | Staff | Work queue | Assignment | Coordinator/case | Care coordinator | SLA alert | — | P2 | Planned |
| Case management | D | State machine | Staff | Case workbench | Case service | Patient case | Case intake | Task engine | — | P2 | Planned |
| Clinical review operations | D | Reviewer queue/signoff | Clinician/Staff | Review workbench | Review service | Opinion review | Clinical summary | SLA | — | P2 | Planned |
| Provider management | O partner links | Verification lifecycle | Admin | Provider admin | Provider service | Hospital/doctor | — | Reverify | Registry | P2 | Planned |
| Doctor management | O | Credential/affiliation | Admin | Doctor admin | Doctor service | Doctor | — | Expiry | Registry | P2 | Planned |
| Hospital management | O | Accreditation/capability | Admin | Hospital admin | Hospital service | Hospital | — | Expiry | Registry | P2 | Planned |
| Content management | O editorial | Review/publish/version | Editor | CMS | Content service | Content item | — | Review due | — | P2 | Planned |
| Package management | O | Offer approval/expiry | Admin | Offer admin | Offer service | Package | Package | Expiry | — | P2 | Planned |
| Payment management | D | Reconciliation/refunds | Finance | Billing admin | Payment service | Payment/refund | — | Reconcile | Pay | P2 | Planned |
| Travel coordination | O | Vendor and task workflow | Staff | Travel queue | Travel service | Travel request | Travel | Due alert | Travel | P2 | Planned |
| Communication operations | O contact | Case-scoped inbox | Staff | Inbox | Messaging | Conversation | Care coordinator | Routing | Mail | P2 | Planned |
| Audit | U | Immutable events | Admin | Audit viewer | Audit service | Audit event | — | Anomaly flag | — | P0 | Planned |
| AI monitoring | U | Runs, tools, feedback | Admin | AI ops view | Run service | AI run | Orchestrator | Review alert | LLM | P2 | Planned |
| Site shell | O navigation | Responsive header/footer/home | Visitor | Shared shell | Static render | — | — | — | — | P0 | Foundation built |
