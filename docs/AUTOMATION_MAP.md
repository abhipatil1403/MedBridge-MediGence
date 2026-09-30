# Automation map

Automations are event-driven service workflows with an owner, idempotency key, audit event and retry/dead-letter behavior. An AI draft is not an action. Rules and notifications must reflect persisted state; deadlines are configured by service and jurisdiction, not borrowed from marketing claims.

Implemented assistant planning is request-driven: a planning goal creates/reuses one coordination plan, generates request-specific catalog searches, records real completion, and leaves review/preference tasks for the user. Stable task keys prevent duplicates; unchanged searches reuse saved results. A per-conversation lease prevents simultaneous turns and expires after a server interruption. User review updates derive plan status from actual tasks. No reminders, enquiries, payments, bookings, travel requests, or outbound messages are triggered by this milestone.

| Trigger | Automated action | Human gate / exception | Evidence and state |
|---|---|---|---|
| Enquiry submitted | Validate, deduplicate, classify service, create case and coordinator task | Coordinator checks ambiguous urgency | Case ID, consent, assigned owner |
| Case draft saved | Identify missing required fields | Patient confirms AI-suggested interpretation | Checklist version and answers |
| Document uploaded | Scan file, detect type, extract metadata, link to case | Clinical extraction reviewed before use | File checksum, scan result, source pages |
| DICOM uploaded | Validate format, extract study metadata, queue protected viewer conversion | Clinician verifies study completeness | Study UID and processing state |
| Required records absent | Ask patient for specific missing document | No repeated reminders after opt-out or manual hold | Task due date, delivery log |
| Intake complete | Generate attributed case summary draft | Clinical coordinator verifies completeness | Source document links, draft version |
| Review requested | Filter eligible clinicians and create assignment candidates | Staff confirms reviewer/conflict check | Candidate criteria and decision |
| Hospital search or case match | Compute eligible shortlist | Coordinator verifies clinical suitability | Evidence date and excluded reasons |
| Doctor match | Deterministic eligibility/score then explanation | Credential/availability verification | Score components and sources |
| Comparison requested | Normalize currencies, inclusions, date and calculate | Staff resolves incomparable offers | Calculation version and stale flags |
| Package selected | Validate offer validity and provider terms | Provider confirms before booking | Offer version and confirmation reference |
| Order created | Create payment intent idempotently | Finance handles mismatch | Order/payment IDs and webhook events |
| Slot held | Expire hold or confirm after payment | Reschedule/refund on collision | Timezone and hold expiry |
| Appointment approaching | Send preference-aware reminder and document checklist | Staff follows bounced notifications | Delivery status and appointment ID |
| Treatment date confirmed | Generate travel tasks from approved rules | Coordinator checks visa/vendor specifics | Rule version and itinerary |
| Visa/flight/stay request changed | Update dependent tasks and notify owner | Vendor confirmation required before “booked” | Request/quote/confirmed states |
| Patient arrives | Surface admission checklist and contact details | Coordinator confirms arrival | Timestamp and responsible contact |
| Treatment completed | Draft recovery plan template and schedule follow-up | Clinician approves plan before activation | Discharge record and plan version |
| Recovery check-in due | Notify patient based on preferences | No clinical inference from missing answer | Reminder count and task state |
| Missed or concerning check-in | Escalate under approved deterministic protocol | Clinician/care team triages | Threshold, reviewer and resolution |
| AI recommendation created | Validate IDs and evidence; mark draft | Human accepts/rejects consequential recommendation | Run trace and reviewer feedback |
| Private document accessed | Record access and unusual-pattern signal | Security reviews alert | Actor, purpose, object, timestamp |
| Provider credential/offer near expiry | Remove or flag from patient-facing eligibility; request re-verification | Admin approves renewed evidence | Evidence and expiry date |
| Content review date reached | Unpublish or flag clinically material content | Editor/clinician republishes | Content version and approver |

**Implementation order:** outbox and audit first; then enquiry/case tasks; document processing; provider/cost freshness; booking/payment reconciliation; travel; recovery; AI-generated proposals. Use bounded retries and suppress duplicate notifications. Health and travel escalations have explicit on-call owners.
