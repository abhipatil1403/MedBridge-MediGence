# Route architecture

The site uses canonical task/entity routes, with query parameters for filters and result state. The public [MediGence sitemap](https://medigence.com/sitemap.xml) demonstrates very large combinations of procedure, country, city, and provider pages. MedBridge will only index combinations with reviewed content and active inventory; filtered combinations otherwise stay query-driven and non-indexed. This map is the **target**, not a claim that routes exist in the foundation shell.

| Route or template | Purpose | Access | Priority |
|---|---|---|---|
| `/` | Entry and care-pathway orientation | Public | Built shell |
| `/search?q=&type=&country=&specialty=` | Typed search and filter state | Public | M2 |
| `/discover` | Guided natural-language clarification with provenance | Public | M14 |
| `/treatments`, `/treatments/[slug]` | Directory and reviewed detail | Public | M3 |
| `/treatments/[slug]/costs` | Sourced country cost table | Public | M3/M6 |
| `/specialties`, `/specialties/[slug]` | Taxonomy and specialty entry | Public | M3 |
| `/hospitals`, `/hospitals/[slug]` | Directory/profile; country/city in query | Public | M4 |
| `/doctors`, `/doctors/[slug]` | Directory/profile; specialty/country/hospital in query | Public | M5 |
| `/countries`, `/countries/[slug]` | Destination discovery/guide | Public | M6 |
| `/compare`, `/compare/countries?procedure=&a=&b=` | Comparison selector and deterministic result | Public | M6 |
| `/compare/hospitals?ids=`, `/compare/doctors?ids=` | Attribute comparison when evidence is sufficient | Public | M6+ |
| `/packages`, `/packages/[slug]` | Active offers and inclusion detail | Public | M7 |
| `/second-opinion`, `/second-opinion/start` | Service detail and resumable intake | Public then auth | M8 |
| `/second-opinion/cases/[id]` | Patient case status/report | Patient/granted caregiver | M8 |
| `/consultations`, `/consultations/book/[doctorId]` | Doctor selection and booking | Public then auth | M9 |
| `/consultations/[id]` | Appointment/session/follow-up | Participant | M9 |
| `/travel`, `/travel/visa`, `/travel/flights`, `/travel/stays`, `/travel/transfers` | Service information and case-scoped requests | Public then auth | M10 |
| `/recovery`, `/recovery/packages`, `/recovery/packages/[slug]` | Recovery service catalog | Public | M12 |
| `/stories`, `/resources`, `/resources/[slug]` | Consented stories and reviewed editorial content | Public | M17 |
| `/auth/login`, `/auth/register`, `/auth/callback` | Authentication and return | Public | M8/M11 |
| `/dashboard` | Current case and next action | Patient | M11 |
| `/dashboard/cases`, `/dashboard/cases/[id]` | Case list and timeline | Patient | M11 |
| `/dashboard/documents`, `/dashboard/appointments`, `/dashboard/opinions`, `/dashboard/travel`, `/dashboard/recovery`, `/dashboard/payments`, `/dashboard/messages`, `/dashboard/notifications`, `/dashboard/profile` | Focused patient tasks | Patient | M11–12 |
| `/staff` | Work queue | Staff | M13 |
| `/staff/cases/[id]`, `/staff/opinions/[id]`, `/staff/consultations/[id]`, `/staff/travel/[id]`, `/staff/recovery/[id]` | Operational workbenches | Assigned staff/clinician | M8–13 |
| `/admin/providers`, `/admin/catalog`, `/admin/packages`, `/admin/content`, `/admin/payments`, `/admin/ai`, `/admin/audit` | Controlled management and monitoring | Role-specific admin | M13–17 |
| `/api/health` | Minimal deployment health | Public, no sensitive data | Foundation |
| `/api/*` | Server route handlers for authorized mutations/webhooks | Auth/service | As needed |

## Route rules

1. Directory facets are query parameters, not overlapping dynamic segments such as `/doctors/[specialty]` and `/doctors/[country]`. Slugs resolve only within their entity namespace.
2. IDs for private cases and bookings are opaque UUIDs; access checks live in server services and database RLS. Client-side route guards are only UX.
3. `404` is used for unknown published entities; unpublished or unverified entities are never leaked. Private unauthorized access returns a neutral response.
4. Search/filter query URLs have canonical base routes. Reviewed detail pages get unique metadata, breadcrumbs, structured data only where factually supported, and a content review date.
5. No placeholder route is linked from the initial shell. Navigation expands as milestones make destinations real.
