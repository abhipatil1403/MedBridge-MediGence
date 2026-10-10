# Automation map

## Request-driven workflow recovery — 10 October 2026

Eligible public-catalog reads retry only an explicit transient failure, at most once,
within the existing invocation/time budget. An owned latest unfinished run may be resumed
once after 180 seconds without saved progress, under the existing conversation lease.
Current publication is checked before read reuse. A saved final output is returned without
tool replay. Inquiry preparation reads the selected published listing and opens the
existing reviewed consent form; it does not submit or share. No scheduler, background
clinical task, external delivery or consequential replay is added. See
[the audit, implementation and validation contract](AGENTIC_WORKFLOW_RELEASE.md).

## Provider Verification Agent

Explicit verify/field/recheck requests resolve a provider through existing structured conversation references, then execute `verify_provider_information` or `refresh_provider_verification` in the shared authenticated runtime. Exact user action authorizes only a private evidence snapshot; no catalog mutation or provider selection occurs. Status/history are read-only registered tools. `compare_provider_evidence` runs under ComparisonAgent, reads real owned reports and supplies no clinical ranking. Source calls are bounded, deduplicated and selectively retried; refresh bypasses the evidence cache. Freshness is projected on reads under an optional central policy. There are no scheduled verifications, background source monitors, automatic catalog writes or clinical decisions. See [PROVIDER_VERIFICATION.md](PROVIDER_VERIFICATION.md).

Implemented ComparisonAgent is request-driven. Comparison intent selects two independent catalog search contexts; task completion records actual tool outcomes, and a separate review remains for the user. Identical completed inputs reuse saved results, and failed inputs can be retried on the next request while preserving the successful side. Budget updates refresh affected package inputs. No provider contact, booking, outbound notification, currency conversion or clinical decision is triggered by a comparison.

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


## Agentic execution milestone (2026-10-01)

The existing request-driven runtime now has a typed registry, validated service execution, structured result observations, bounded Cloudflare next decisions, canonical read-result reuse, safe recovery and persisted run activity. Goal/reference/requirement policies and compound dependencies remain the existing infrastructure. This is request-driven execution; it adds no scheduler, external integrations or patient-data workflow. Case Intake is parked.

Run states are queued, planning, executing, observing, waiting_for_input, awaiting_confirmation, completed, partially_completed, failed and cancelled, persisted in existing private run JSON. Owned history restores compact progress; refreshing never replays tools. Read tools execute automatically; existing writes remain approval proposals. Future executing writes/external/clinical tools are blocked until an independently authorized workflow exists.

See [AI_AGENT_ARCHITECTURE.md](./AI_AGENT_ARCHITECTURE.md) for the loop, budgets, permissions and provenance and [AGENTIC_TOOL_EXECUTION_VALIDATION.md](./AGENTIC_TOOL_EXECUTION_VALIDATION.md) for measured gates, security, manual scenarios and deployment limits. No new environment variables or database migration is required.

## Request-driven external research

An identified internal catalog evidence gap can authorize one bounded official-source research call in the existing execution loop. This is an authenticated user-request capability, not a recurring monitor. Source retrieval and deterministic evidence extraction cannot invoke tools or create providers. Existing output/action/run JSON records the external source IDs and timestamps. A failed or missing source leaves catalog results visible; conflicts remain unresolved. Refresh restores owned evidence without replaying retrieval. No notifications, sharing, bookings or patient collection are triggered. See [EXTERNAL_RESEARCH_AGENT_VALIDATION.md](EXTERNAL_RESEARCH_AGENT_VALIDATION.md).


## Request-driven document coordination

| User action | Registered operation | Boundary | Recorded evidence |
|---|---|---|---|
| Select hospital/service | `get_document_requirements` | Published configured checklist or explicitly attributed research; no invented checklist | Hospital/service IDs, requirement sources, conversation ownership |
| Select/drop file | `upload_document` | Authenticated transport; validated format/size; private owner storage | SHA256, original filename/type/size, uploader/time, duplicate/version links |
| Confirm category/change mapping | `match_document_to_requirement` | Exact user-confirmed file/requirement IDs; suggestions are not matches | Mapping and confirmation timestamp, revision audit |
| Remove file/version | `remove_document` | Owner and exact user selection; prepared package invalidated | Removed metadata retained; stored bytes deleted, retry if storage fails |
| Supply explicit requirement | `add_document_requirement` | User-supplied provenance; no model generation | Requested label/status/source/target and revision |
| Review and prepare | `prepare_document_package` | Required documents confirmed, reviewed current revision | Ordered sourced manifest, actor/time, atomic audit |
| Review sharing status | `get_document_package` | No connected hospital channel; no submission | Ready-to-share boundary, `submittedToProvider: false` |

No reminder, background processing, clinical extraction, automatic sharing or retention schedule is introduced. Existing agent and external research automation rules retain their behavior.
