# MediGence public product reference audit

Audited 28 September 2026. This is a product-structure reference, not a source of MedBridge copy, provider facts, prices, images, outcomes, or clinical claims. **Observed** means visible on a public page or in its HTML. **Described** means the public site explains a later step that could not be entered without creating an account or submitting data. **Proposed** means a MedBridge design decision. Prices, counts, provider details, and service claims on the reference are deliberately not imported.

## Coverage and evidence

The public [home page](https://medigence.com/) links to treatment, hospital, doctor, country comparison, package, rehabilitation, video consultation, second opinion, patient story, recovery, air ambulance, travel booking, medical visa, and blog areas. Its current narrative spans planning, treatment travel, and recovery. The [XML sitemap index](https://medigence.com/sitemap.xml) was inspected along with representative pages. The English sitemap families include 351 treatment URLs, 409 hospital profiles, 1,001 doctor profiles with telemedicine, 1,062 package details, 1,062 package result pages, 2,687 comparison pages, 304 visa corridor pages, 7,320 second-opinion diagnosis pages, 170 second-opinion specialty pages, and tens of thousands of hospital/clinic/procedure/location combinations. Counts are a snapshot of sitemap entries, not verified inventory. Representative sitemap files: [treatments](https://medigence.com/treatments-sitemap.xml), [hospital profiles](https://medigence.com/hospital-profile-sitemap.xml), [doctor profiles](https://medigence.com/doctors-profile-with-telemedicine-sitemap.xml), [packages](https://medigence.com/packages-detail-pages-sitemap.xml), [comparisons](https://medigence.com/treatment-comparison-sitemap.xml), [second-opinion diagnoses](https://medigence.com/so-diagnosis-sitemap.xml).

Public pages inspected: [hospital list](https://medigence.com/hospitals/all), [clinic list](https://medigence.com/clinics/all), [doctor list](https://medigence.com/doctors/all), [treatment detail](https://medigence.com/treatment/asd-closure-repair-adult), [hospital profile](https://medigence.com/hospital/aakash-healthcare-super-speciality-hospital), [doctor profile](https://medigence.com/doctor/surgical-oncologist/dr-arun-kumar-giri), [comparison selector](https://medigence.com/treatment-comparison), [comparison detail](https://medigence.com/treatment-comparison/angiography-including-non-ionic-contrast/india/italy), [packages](https://medigence.com/packages), [package results](https://medigence.com/packages/bmt-autologous/india), [package detail](https://medigence.com/hospital/global-health/package/bmt-autologous-cc114a4fcc4a6a1a586a), [second opinion](https://medigence.com/products/second-opinion), [second-opinion specialty](https://medigence.com/products/second-opinion/speciality/neurology), [workbench registration](https://medigence.com/products/second-opinion/workbench/personal/register), [video consultation](https://medigence.com/online-video-consultation), [medical tourism](https://medigence.com/turkey/medical-tourism), [origin-country hub](https://medigence.com/international-patients/kenya), [medical visa](https://medigence.com/medical-visa), [visa corridor](https://medigence.com/medical-visa/canada-to-india), [flights/accommodation](https://medigence.com/accommodation), [neuro rehabilitation](https://medigence.com/products/medi-rehab), [recovery packages](https://medigence.com/products/care-packages), [stories](https://medigence.com/patientstory/all), [login](https://medigence.com/products/authenticate/login), [registration](https://medigence.com/products/authenticate/register), [air ambulance](https://medigence.com/air-ambulance), [service explanation](https://medigence.com/product-services). Footer and internal links reveal cost guides, country hospital pages, specialty/procedure pages, editorial policy, provider onboarding, contact, and blog routes.

The public pages were read without submitting forms, making payments, accessing private accounts, or testing provider availability. JavaScript-only menus, search responses, and authenticated result states therefore need a later interactive audit; the behaviors below distinguish evidence from MedBridge requirements.

## Shared interaction grammar

- **Entry and hierarchy:** dense desktop navigation, utility sign-in/register and language controls, directory landing pages, SEO landing pages, detail pages, related entities, FAQs, repeated contact/quote calls to action, and a large cross-linking footer. A route may be reached from home, a directory, a search-result URL, or a related-content link.
- **Directory pattern:** headline and short explanation, lead/enquiry form, result count, entity list, place/specialty/procedure cues, quote or consultation CTA, load-more pagination. The public hospital list exposes hospital location, bed/procedure counts and accreditation labels; doctor list exposes hospital, location, specialty, experience, languages and consultation price. These are reference *fields*, not verified MedBridge data.
- **Detail pattern:** profile summary and contextual CTA, structured sections, related procedures/providers, FAQs, and contact prompt. Treatment detail uses tab-like sections for procedure, symptoms, diagnostics, recovery and stories. Package detail has description, inclusions, benefits, related packages and FAQs.
- **Comparison pattern:** procedure + two countries as required selectors; result has cost breakdown, quality, clinician expertise, infrastructure, travel/stay sections and a recommendation CTA.
- **State handling:** public HTML rarely exposes empty, loading or error states. MedBridge must define them explicitly. No absence of a public state should be mistaken for proof the reference lacks it.

## 1. Discovery and global search

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Turn an uncertain patient question into a navigable treatment, provider, destination or service choice; patient and caregiver. |
| Entry; route | Home navigation and internal cross-links; reference `/`, `/hospitals/all`, `/doctors/all`, `/medical-specialists/...`; proposed `/search`, `/discover`. |
| Components; information | Search input, entity tabs, suggestions, result list, result provenance, filters; home links to procedures, hospitals, doctors, countries and packages. The home mentions AI search, but public HTML did not expose a complete response flow. |
| Filters; search | Specialty, procedure, country, city, service availability; route-backed query parameters and canonical result templates. Natural-language clarification is a proposed MedBridge capability. |
| Forms; CTAs; actions | Search term or natural-language need; choose result; save comparison; ask coordinator. |
| Result / empty / loading / error | Grouped typed results with source and match reason / helpful alternatives and manual enquiry / skeleton rows with announced status / retry and preserved query. These are MedBridge requirements, not observed public states. |
| Next; data; relationships | Detail page or case intake; taxonomy aliases, provider inventory, locations, reviewed content; feeds all discovery modules. |
| Automation; AI | Query normalization and entity linking; DiscoveryAgent may clarify uncertainty but cannot diagnose or invent providers. |

## 2. Treatment and specialty knowledge

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Explain a procedure and expose options; patient researching an advised treatment. |
| Entry; route | Sitemap and footer procedure links; observed `/treatment/asd-closure-repair-adult`, `/hospitals/{specialty}/{procedure}/{country}/{city}`, `/medical-specialists/{procedure}`. |
| Components; information | Procedure overview, symptoms, diagnostics, recovery, destinations, related doctors, stories, enquiry. The treatment page has tab-like section buttons. Specialty is both taxonomy and a search landing dimension. |
| Filters; search | Treatment directory by specialty/name; related hospitals and doctors by country/city. A specialty index is proposed for MedBridge because the reference distributes this through directory routes. |
| Forms; CTAs; actions | Enquiry (name, email, phone), choose destination, compare costs, consult doctor. |
| Result / empty / loading / error | Evidence-backed treatment page and provider lists / say no matching provider is published / section and list skeletons / content unavailable and contact route. |
| Next; data; relationships | Hospital, doctor, destination, comparison, package, case. Requires reviewed treatment content, taxonomy, provider-procedure mappings, dated price offers. |
| Automation; AI | Recommend next research questions and summarize reviewed material; no treatment recommendation without clinician review. |

## 3. Hospitals and clinics

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Shortlist institutions by service and location; patient, caregiver, coordinator. |
| Entry; route | Observed `/hospitals/all`, `/clinics/all`, `/hospital/{slug}` and sitemap-generated procedure/place results. |
| Components; information | Result count, profile list, location, accreditation badges, bed/procedure counts, quote/advisor actions; profile includes overview, infrastructure, location, awards, specialties, procedures and doctors. |
| Filters; search | Country, city, specialty, procedure, accreditation and service. Some result-route dimensions are observed; exact interactive filter UI was not fully verified. |
| Forms; CTAs; actions | Name, email and phone enquiry; quote, advisor, hospital visit. |
| Result / empty / loading / error | Verified provider record with last-reviewed date / no match with wider geography / paged list skeleton / retry or coordinator request. |
| Next; data; relationships | Doctor, procedure, package, cost, case and quote. Need hospital identity, location, verified accreditation with expiry, facilities, mappings, provenance. |
| Automation; AI | Deterministic eligibility and shortlist explanation from published attributes; HospitalMatchingAgent cannot infer accreditation or outcomes. |

## 4. Doctors and consultation discovery

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Find a suitable clinician and consultation channel; patient and coordinator. |
| Entry; route | Observed `/doctors/all`, `/doctor/{specialty}/{slug}`, `/online-video-consultation`, procedure doctor result routes. |
| Components; information | List includes specialty, hospital, geography, experience, languages and listed teleconsult fee. Profile has qualifications, experience, memberships, procedures, FAQs, upload-report prompt and consultation CTA. |
| Filters; search | Specialty/procedure/country/hospital; video consultation landing exposes “by specialty / procedure / country” controls. Slot data was not visible in the sampled public HTML. |
| Forms; CTAs; actions | Enquiry, screening, book/pay, upload reports; selecting a doctor and appointment is described publicly. |
| Result / empty / loading / error | Clinician with verified credentials and booking mode / no matching clinician plus related specialties / list or slot skeleton / booking conflict or unavailable slot with recovery. |
| Next; data; relationships | Consultation booking or second opinion. Need credentials, licenses/verification, hospital relationships, fees, timezone-aware slots and consent. |
| Automation; AI | Explain objective match criteria and prepare intake; DoctorMatchingAgent may not fabricate schedules. |

## 5. Countries, destinations, cost and comparison

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Compare where to obtain treatment and plan cross-border constraints; patient and caregiver. |
| Entry; route | Observed `/treatment-comparison`, `/treatment-comparison/{procedure}/{a}/{b}`, `/{country}/medical-tourism`, `/international-patients/{origin}`. |
| Components; information | Procedure/country selectors, cost breakdown, quality and clinician sections, travel/stay logistics, related hospitals/doctors, destination guides and FAQ. |
| Filters; search | Procedure and two countries required. Destination directory should filter available providers, services, language and verified cost offers. |
| Forms; CTAs; actions | Select comparison, request personalized costs, ask advisor. |
| Result / empty / loading / error | Two-column sourced comparison with dates/currency/inclusions / explain missing side / calculation skeleton / stale or incompatible quote warning. |
| Next; data; relationships | Treatment, providers, package, visa and travel case. Need country/city, dated cost observations, currency, inclusions, source, travel rules from approved source. |
| Automation; AI | CostAgent computes only sourced arithmetic; TreatmentComparisonAgent describes tradeoffs without unsupported success claims. |

## 6. Packages and booking

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Understand bundled treatment offer before expressing intent; patient and coordinator. |
| Entry; route | Observed `/packages`, `/packages/{procedure}/{country}`, `/hospital/{hospital}/package/{id}`. |
| Components; information | Package selector and featured offer cards; detail has provider, price, benefits, description, inclusions, related packages, procedure context and FAQs. Some cards link to an advance-payment action. |
| Filters; search | Procedure, destination, price/order; package results expose sorting and filtering controls. |
| Forms; CTAs; actions | View details, request quote, reserve/book where an actual payment integration exists. |
| Result / empty / loading / error | Versioned offer and clear included/excluded items / no active package and custom quote path / loading offer / expired price or payment failure with no duplicate order. |
| Next; data; relationships | Provider confirmation, order, travel tasks. Requires offer terms, currency, validity, provider, procedure, inclusions, exclusions, capacity. |
| Automation; AI | PackageAgent finds eligible published offers; booking tasks start only after confirmed order. |

## 7. Second opinion and clinical workbench

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Obtain independent professional review of records; patient, caregiver, clinician, clinical coordinator. |
| Entry; route | Observed `/products/second-opinion`, specialty/diagnosis landings and `/products/second-opinion/workbench/personal/register`. Workbench steps are [described publicly](https://medigence.com/product-services). |
| Components; information | Service tiers, specialty list, six-step explainer, registration; described workbench captures diagnosis, symptoms, investigations and DICOM; country/service choice, payment, review and downloadable report. |
| Filters; search | Specialty, condition, clinician panel, country, service tier. |
| Forms; CTAs; actions | Register via name, phone, email/OTP; structured case intake, history and documents; select service, pay, review, download or consult. Do not assume undocumented fields are on the reference form. |
| Result / empty / loading / error | Case status: draft → awaiting documents → ready for review → assigned → review in progress → report ready → follow-up; no case/records states; upload progress; invalid file, failed scan, payment failure, SLA breach and reviewer escalation. Proposed MedBridge design. |
| Next; data; relationships | Consultation, treatment discovery, travel if patient chooses. Requires patient consent, clinical facts, private files, reviewer assignment, report version, audit and payment. |
| Automation; AI | CaseIntakeAgent requests missing data, DocumentAgent extracts metadata, ClinicalSummaryAgent prepares *unverified* draft, SecondOpinionAgent tracks handoffs; only a licensed professional signs the report. |

## 8. Video consultation

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Speak with a specialist remotely before or after travel; patient and clinician. |
| Entry; route | Observed `/online-video-consultation`, doctor cards and profile booking CTAs. The public page [describes](https://medigence.com/online-video-consultation) doctor selection, date and online payment. |
| Components; information | Search modes, doctor cards, consultation price, step explainer, FAQs, links to second opinion/travel. |
| Filters; search | Specialty, procedure, country; availability must come from scheduling source, not marketing text. |
| Forms; CTAs; actions | Select clinician/slot, enter patient details, upload records, pay, join session, view follow-up. |
| Result / empty / loading / error | Confirmed booking with timezone and join instructions / no slots with waitlist or alternate doctors / slot reservation pending / collision, payment timeout, device or connection failure. |
| Next; data; relationships | Care case, notes, treatment plan or travel request. Need slots, appointment, video vendor, documents, orders, consent. |
| Automation; AI | ConsultationAgent prepares nonclinical briefing and reminders; clinician controls advice and notes. |

## 9. Medical travel and logistics

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Coordinate lawful, practical movement around treatment; patient, companion, travel coordinator. |
| Entry; route | Observed `/medical-visa`, `/medical-visa/{origin}-to-{destination}`, `/accommodation`, `/air-ambulance`, destination pages. Homepage describes transfer, interpreter and coordination. |
| Components; information | Visa origin/destination, FAQ, travel date, passport/attendant fields; accommodation/flights entry; medical tourism guides and service lists. |
| Filters; search | Origin/destination, travel date, attendant count, accommodation constraints, transport type; travel rules must show source and checked date. |
| Forms; CTAs; actions | Visa enquiry, request quote/callback, coordinate flight/stay/transfer, confirm itinerary. Public site shows lead capture; end-to-end transaction flow was not verified. |
| Result / empty / loading / error | Checklist and confirmed vendor references / no matching vendor, manual support / quote pending / visa rule uncertainty, schedule change, rejected request. |
| Next; data; relationships | Case timeline, admission, recovery. Need case, companions, request states, vendor offers, documents and consents. |
| Automation; AI | TravelAgent drafts checklist and identifies missing documents; no claim of filing a visa or booking flight without recorded integration confirmation. |

## 10. Recovery and rehabilitation

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Continue coordinated care after discharge; patient, clinician, rehabilitation and care teams. |
| Entry; route | Observed `/products/care-packages` and `/products/medi-rehab`. Public recovery page shows procedure-specific packages, purchase steps, dashboard access and expert-service descriptions. |
| Components; information | Package list/detail, nutrition, specialist follow-up, pain/rehab/wellbeing service descriptions, how-it-works, FAQ; neuro rehab page presents conditions and multidisciplinary team. |
| Filters; search | Condition/procedure, age group, service type, location/remote mode. |
| Forms; CTAs; actions | Choose package, register, pay, receive plan, check in, book follow-up; the latter operational steps are proposed based on public service description. |
| Result / empty / loading / error | Clinician-approved plan and dated tasks / no active plan / check-in saving / overdue or concerning response escalates. |
| Next; data; relationships | Follow-up consultation, local handover, case closure. Need plan version, tasks, check-ins, clinician review, notifications. |
| Automation; AI | RecoveryAgent drafts adherence prompts and summaries; clinical thresholds and escalations are deterministic and professionally approved. |

## 11. Identity, patient account, payments and operations

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Sustain a case across services and let staff operate it; patient, caregiver, coordinator, reviewer, admin. |
| Entry; route | Observed `/products/authenticate/login` and `/products/authenticate/register` use email/phone and OTP. Recovery and second-opinion pages refer to a dashboard; account content was **not publicly accessible**. |
| Components; information | Public auth forms; proposed patient case timeline, documents, appointments, travel, payments, messages and recovery; staff queues, review workbench, provider/offer verification and audit. |
| Filters; search | Patient case status, assigned coordinator, service, urgency, dated queue. Private access only. |
| Forms; CTAs; actions | Verify identity, give consent, upload, pay, message, approve work; staff assign/review/escalate. |
| Result / empty / loading / error | Role-scoped dashboard and next task / no active case with discovery path / route skeleton / expired session, forbidden access, payment reconciliation issue. |
| Next; data; relationships | Every service module. Requires Auth identities, role grants, cases, orders, activity log, consent and RLS. |
| Automation; AI | CareCoordinatorAgent prioritizes queues but cannot silently mutate clinical records or mark external work complete. |

## 12. Content, stories and footer ecosystem

| Dimension | Audit / MedBridge implication |
|---|---|
| Purpose; user | Provide discoverable education and trust context; prospective patient and editor. |
| Entry; route | Observed `/patientstory/all`, blog and cost/SEO links in footer, product-service and editorial-policy links. Stories list has destination filters and load more. |
| Components; information | Editorial article, review date, source, linked treatment/provider/destination; optional consented story. |
| Filters; search | Topic, treatment, country, publication date; only consented stories in MedBridge. |
| Forms; CTAs; actions | Read, follow related path, enquire; editors draft/review/publish. |
| Result / empty / loading / error | Published reviewed article / no story shown / list skeleton / stale content flagged and withheld if clinically material. |
| Next; data; relationships | Discovery and service intake; content belongs to taxonomy and editorial workflow. |
| Automation; AI | Summaries/metadata drafts only; human editorial and clinical review before publishing. |

## Gaps and follow-up audit

1. Public HTML does not establish private dashboard modules, actual slot calendars, payment outcome screens, precise menu hover behavior, or all interactive search/filter semantics. Validate these only with authorized test accounts and no real patient data.
2. The reference contains inconsistent public counts and timelines across pages. MedBridge needs per-record verification, timestamps and explicit estimates; do not reuse any reference numbers as facts.
3. Generated sitemap volume implies template governance, canonical URLs, deduplication and indexability rules. MedBridge should publish only substantive, reviewed pages with real inventory; no combinatorial empty SEO pages.
4. Clinical, privacy and cross-border compliance claims on the reference were not independently verified. MedBridge must establish its own legal and security review before making any such claim.
