# Provider publication assessment

The baseline already has tenant membership, all nine listing record kinds, private document storage, immutable revisions and submissions, field verification, explicit admin publication, canonical public catalog projection, shared support cases, notifications, and audit events. Existing public catalog services feed Discovery, Comparison, packages, and requirement matching.

Remaining gaps are persistent section decisions, a database approval gate for every frozen section, an audit event for opening a review, actionable feedback on the provider dashboard, richer published section details, and explicitly documented package services. Assigned support reviewers currently share the overall approval action and must lose approval permission.

Reuse portal commands, RLS helpers, revision snapshots, document APIs, forms, review components, and catalog services. Add one append-only section review table and a migration for review gates and safe published projections. A follow-up migration preserves the assigned reviewer when the first section decision moves a submission under review, a bug found by the live workflow test. Keep historical published submissions intact; require section review for all new and still pending submissions. No new agents, routes, catalogs, or required environment variables.

Validation must cover per-section changes and resubmission, unresolved approval rejection, support approval denial, revision isolation, public privacy, accreditation evidence, published package information, and existing agent contracts.
