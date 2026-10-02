# UI system and reference observations

The [reference audit](MEDIGENCE_REFERENCE_AUDIT.md) shows a dense directory-and-service product. MedBridge should preserve task depth while using an original visual language and copy. The foundation shell uses a restrained ink/teal palette and editorial spacing; these are MedBridge choices, not copied reference branding.

| Surface | Public reference pattern | MedBridge component contract |
|---|---|---|
| Global navigation | Utility auth/language row and broad service navigation; many routes | Two-level desktop hierarchy grouped by Explore, Plan care, Travel, Recover, Account. Mobile disclosure menu with focus, Escape and route-change handling. Link only shipped routes. |
| Home | Planning/treatment/recovery storyline, provider/procedure links, comparison selector, multiple CTAs | Concise task orientation, clear route choices, honest availability; no fabricated provider counts or outcomes. |
| Search/directory | Lead form plus result list, entity-specific attributes, load more | Search field, entity tabs, filter rail/drawer, result count, list rows with key comparable attributes, applied-filter chips and reset. URL retains state. |
| Detail pages | Section navigation, related entities, FAQs and enquiry | Breadcrumbs, concise summary, evidence/status panel, task CTA, sticky desktop context rail, mobile anchored action. Different section types use prose, tables and lists as appropriate. |
| Provider profiles | Hospital specialties/procedures/doctors; doctor credentials/experience/FAQ | Verification date and source near claims; affiliations and services as relationship lists; no decorative badges without evidence. |
| Comparison | Procedure + two countries, cost/quality/travel sections | Compact selector above a side-by-side table; units, price basis, source date and missing values visible in cells. |
| Package | Price and provider cards, inclusions, FAQ | Offer identity, validity, structured inclusion/exclusion table, eligibility and request/booking state. |
| Intake forms | Enquiry forms, OTP registration; second-opinion workflow described | Stepper for long clinical intake, save/resume, inline validation, private upload progress, review page and consent text. Short enquiry uses one page. |
| Dashboard/workbench | Dashboard is referenced but not publicly viewable | Status timeline, next action, owner, timestamps; staff queue is table-first with filters and case side panel. |
| FAQ/editorial | Accordions and long SEO content with deep footer linking | Accessible `details`/disclosure, reviewed article metadata, related routes; avoid repeated filler sections. |
| Feedback states | Public HTML exposes little | Every async surface has loading, empty, error and success states; no fabricated streaming or progress. |

## Foundations

- **Typography:** readable system sans for interface, modest display treatment for page titles; numeric data uses tabular figures. No oversized hero that displaces the task.
- **Color:** deep ink for text, warm white for background, restrained teal for actions/status. Red, amber and green mean actual error/warning/success, with text and icon labels as well as color.
- **Spacing:** 4 px base scale; content max width around 1200 px; reading columns 65–75 characters; lists and tables use tighter density than marketing sections.
- **Controls:** visible focus rings, minimum 44 px touch targets, labels outside fields, helper/error text tied by ID, disabled state only when reason is clear.
- **Responsive:** mobile nav is a disclosure; filter rails become drawers; comparisons scroll with sticky row labels or stack with explicit country headings; long forms keep step context and save state.
- **Data display:** one source and reviewed timestamp for each clinical/provider/cost assertion. Estimated and confirmed states have distinct language. Unknown values display “Not verified,” not zero or a dash that implies none.
- **Motion:** only state/wayfinding transitions, short and reduced-motion aware. No generic scroll animation.

## Reusable primitives by milestone

Foundation: `Container`, `SiteHeader`, `MobileNav`, `SiteFooter`, `Button`, `SectionHeading`. Discovery: `SearchBox`, `FilterPanel`, `ResultRow`, `StatusBlock`, `SourceNote`. Detail: `Breadcrumbs`, `KeyFacts`, `SectionNav`, `RelatedList`, `EnquiryPanel`. Operations: `CaseTimeline`, `TaskList`, `DataTable`, `DocumentStatus`, `ReviewBanner`, `AuditTrail`. Build each when its actual task ships, not as speculative UI inventory.

## Implemented shared refinement — 2 October 2026

The delivered system is `app/ui-system.css`, `components/page-header.tsx` and `components/ui/status-badge.tsx`. H1 uses a shared 36–64px/700/1.08 scale (compact authentication 32–44px); H2/H3/body/meta and a 4px spacing base are shared. Containers are 1216px maximum with 18–32px responsive gutters. Main landmarks are focusable skip-link destinations.

Public navigation uses active route labels; mobile navigation is a disclosure. Discovery filters use a focus-trapped mobile dialog. Comparison cells wrap on mobile, retaining explicit country headings. The Care Workspace uses two columns, with primary results before collapsed completed activity and contextual case/documents. Evidence, unresolved criteria, ownership and actual audit/history records remain accessible. No speculative dashboard or staff component was introduced. See [the measured audit and release validation](UX_UI_REFINEMENT.md).

## Product transformation — 2 October 2026

`app/ui-system.css` now defines warm ivory, sage and warm decision surfaces; a 36–62px page title scale, 28–40px section titles, 22px subheads, 16px body and 13px metadata. Interface typography uses the existing sans family; Georgia provides restrained editorial accents. Heading weights vary by importance (400 editorial, 500 section/entity, 600 page/action, 700 small eyebrow), with source/technical content tertiary. Content width is 1216px, reading 720px and workspace 1360px; responsive gutters are 20–40px. Radii are 6px controls and 8–10px meaningful surfaces. Color, spacing, borders, shadows and states are semantic tokens.

Shared primitives include PageHeader, SearchPrompt, StatusBadge, DemoNotice, DetailNavigation and existing result/evidence/requirement/progress components. Home, category-based treatment exploration, hospital trust lists, clinician profiles, package decisions, comparison, review preparation, travel and recovery use distinct compositions. Navigation groups Explore and Plan with a direct workspace entry. Cards remain for decision objects and inputs; replies and explanations use flat regions. Reduced-motion behavior, visible focus, 44–48px actions, labels and the existing mobile filter focus trap are preserved. See PRODUCT_TRANSFORMATION.md for the audit and release evidence.
