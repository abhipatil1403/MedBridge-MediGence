# MedBridge

MedBridge is a healthcare discovery and care coordination platform. Its PostgreSQL catalog exposes governed published records; synthetic seed records are isolated from public production discovery. The authenticated `/assistant` uses server-side Cloudflare Workers AI and registered tools. Provider participation requires separately reviewed authority, canonical ownership, an active authorized team and explicit patient consent. A published reference does not establish an active provider relationship. Clinical advice, confirmed bookings and payments are not provided.

## Start locally

Requires Node.js 22 or newer, npm, and a Supabase project with the migrations and seed applied. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to that project's public URL and publishable/anon key.

With the Supabase CLI and an isolated development project, apply the versioned schema and synthetic QA catalog:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --include-seed
```

The Supabase CLI can also run the project locally with Docker using `supabase start`. `supabase/seed.sql` is idempotent and explicitly synthetic. Applying it to an existing database leaves matching slugs in place.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Discovery supports suggestions, intent parsing, entity matching, filtering, sorting and detail pages for eligible published records. An isolated seeded database can have an empty public catalog until QA publication fixtures are applied. Patient inquiries use reviewed consent and private uploads; provider and document sharing require separate recipient-specific grants. The assistant does not read document contents.

To use `/assistant`, set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_AI_MODEL` (default `@cf/zai-org/glm-4.7-flash`), and `SUPABASE_SECRET_KEY` in the ignored `.env.local`. Set the same server-only variables in Vercel for a deployed assistant. `SUPABASE_SECRET_KEY` is the project's secret server key and must never have a `NEXT_PUBLIC_` prefix. Add the public Supabase URL/key to Vercel as well. Apply `20260928100000_agent_conversations.sql` with `supabase db push` before using the workspace. Without the server keys, `/assistant` displays a configuration state and makes no model call.

The workspace signs in with a Supabase email link. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the production origin and allow the callback URL on each app origin you use, for example `https://your-domain.example/auth/callback**` and `http://localhost:3000/auth/callback**`. The suffix allows the `next` query parameter that returns users to their starting page. Keep the default magic-link email template using `{{ .ConfirmationURL }}`; if you customize it, preserve `{{ .RedirectTo }}` so Supabase uses the requested callback. A successful link opens a confirmation page and then returns to the starting page; an expired or invalid link opens a retry page.

The assistant stores conversations and actual run/task/action/output records. Catalog searches remain deterministic. Case information requires sign-in, an accessible case, and explicit `agent_case_processing` consent from the case owner. Proposed case changes need a separate click to approve; external sharing, bookings, payments, travel purchases, and visa submissions stop at a pending approval boundary because those integrations are not connected. The assistant does not read document contents.

Set `NEXT_PUBLIC_SITE_URL` for the deployment origin when publishing the prototype. Never place service-role or LLM secrets in `NEXT_PUBLIC_*` variables.

## Validate

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

After migrations and seed, regenerate database types from a migrated PostgreSQL database by setting `MEDBRIDGE_TYPES_DB_URL` and running `node scripts/generate-db-types.mjs`. With a local server running, `npm run smoke` checks the catalog inventory, searches, filtering, sorting, suggestions, empty/error responses and linked routes. Set `MEDBRIDGE_TEST_ORIGIN` if the server uses a port other than 3000. `scripts/validate-rls.sql` exercises anonymous directory access, case ownership, caregiver revocation, unauthorized access and private agent/audit tables against a test database.

`GET /api/health` returns generic liveness, not an uptime or integration guarantee. Admin-only `/api/health/ready` measures database readiness. `GET /api/discover` returns ranked eligible published records from PostgreSQL; synthetic records are excluded. `GET /api/discover/suggestions` provides search suggestions. Neither discovery API accepts patient information. `/api/assistant` requires a verified Supabase access token and uses the authenticated client for case reads. The server-only key writes private agent records after ownership and consent checks.

## Architecture

- [Reference audit](docs/MEDIGENCE_REFERENCE_AUDIT.md): public MediGence product patterns, sources and visibility limits.
- [Feature matrix](docs/FEATURE_MATRIX.md): feature scope and priorities.
- [User journeys](docs/USER_JOURNEYS.md) and [route map](docs/ROUTE_MAP.md): target flows and URL structure.
- [Data model](docs/DATA_MODEL.md): normalized entities, relationships and access boundaries.
- [AI agent architecture](docs/AI_AGENT_ARCHITECTURE.md) and [automation map](docs/AUTOMATION_MAP.md): validated tools, human gates and event workflows.
- [Compound intent validation](docs/COMPOUND_INTENT_VALIDATION.md): shared requirements, dependent catalog operations, saved references, partial results, and automated/browser verification.
- [UI system](docs/UI_SYSTEM.md), [design quality](docs/DESIGN_QUALITY_RULES.md) and [content rules](docs/CONTENT_RULES.md): product and editorial standards.
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md): milestone gates.
- [Operational portals](docs/MULTI_PORTAL_PLATFORM.md): provider onboarding, staff roles, evidence review, publishing, support consent, hosting and validation.
- [Production acceptance and provider pilot](docs/PRODUCTION_ACCEPTANCE_AND_PROVIDER_PILOT.md): current journey evidence, security checks, real-provider blockers, owner checklist and rollback/exit gates.

## Code layout

`app/` holds App Router pages, metadata, states and route handlers. `components/` holds reusable UI and site shell. `lib/agents/` contains the provider adapter, schemas, registry, controlled tools, runtime, and persistence. `lib/catalog/` maps normalized database rows to the existing catalog model; `lib/discovery/` contains the deterministic parser, ranker and search service. `supabase/migrations/` holds schema, search and security changes. `supabase/seed.sql` holds the synthetic catalog. `types/database.ts` is generated from the migrated schema.

The button primitive follows the shadcn/ui composition style and `components.json` is ready for future component additions. Tailwind CSS 4 is configured through `postcss.config.mjs` and the token theme in `app/globals.css`.

## Safety and provenance

Reference pages were inspected for product architecture only. MedBridge uses original branding and copy. The seeded providers, clinicians and prices are synthetic and labeled as examples. Provider workspaces can submit first-party information for evidence review and publication; only approved frozen snapshots reach the public catalog and existing agents. Publication approval does not establish clinical suitability or verify every claim. Public medical information and provider/price claims require review and source evidence before publication. The site remains `noindex` until real content and services are ready.
