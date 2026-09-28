# MedBridge

MedBridge is a healthcare discovery, treatment planning, medical travel and recovery prototype. Its searchable catalog is stored in PostgreSQL and contains explicitly synthetic records. It does **not** contain live providers, clinical advice, booking, payment, patient account screens, or AI services yet.

## Start locally

Requires Node.js 22 or newer, npm, and a Supabase project with the migrations and seed applied. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to that project's public URL and publishable/anon key. Do not use a service-role key.

With the Supabase CLI and a linked project, apply the versioned schema and synthetic catalog:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --include-seed
```

The Supabase CLI can also run the project locally with Docker using `supabase start`. `supabase/seed.sql` is idempotent and explicitly synthetic. Applying it to an existing database leaves matching slugs in place.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Try a search such as `knee surgery`, `hospitals in India`, `cardiologist`, or `second opinion`. Discovery supports suggestions, intent parsing, entity matching, filtering, sorting and links into detail pages. Treatment planning, consultation, second opinion, medical travel and recovery routes show the next step with clear demo boundaries. The file picker for reports keeps files in the browser and does not upload them.

Set `NEXT_PUBLIC_SITE_URL` for the deployment origin when publishing the prototype. Never place service-role or LLM secrets in `NEXT_PUBLIC_*` variables.

## Validate

```bash
npm run lint
npm run typecheck
npm run build
```

After migrations and seed, regenerate database types from a migrated PostgreSQL database by setting `MEDBRIDGE_TYPES_DB_URL` and running `node scripts/generate-db-types.mjs`. With a local server running, `npm run smoke` checks the catalog inventory, searches, filtering, sorting, suggestions, empty/error responses and linked routes. Set `MEDBRIDGE_TEST_ORIGIN` if the server uses a port other than 3000. `scripts/validate-rls.sql` exercises anonymous directory access, case ownership, caregiver revocation, unauthorized access and private agent/audit tables against a test database.

`GET /api/health` returns a generic status. `GET /api/discover` returns ranked synthetic catalog results from PostgreSQL; `GET /api/discover/suggestions` provides search suggestions. Neither API accepts patient information.

## Architecture

- [Reference audit](docs/MEDIGENCE_REFERENCE_AUDIT.md): public MediGence product patterns, sources and visibility limits.
- [Feature matrix](docs/FEATURE_MATRIX.md): feature scope and priorities.
- [User journeys](docs/USER_JOURNEYS.md) and [route map](docs/ROUTE_MAP.md): target flows and URL structure.
- [Data model](docs/DATA_MODEL.md): normalized entities, relationships and access boundaries.
- [AI agent architecture](docs/AI_AGENT_ARCHITECTURE.md) and [automation map](docs/AUTOMATION_MAP.md): validated tools, human gates and event workflows.
- [UI system](docs/UI_SYSTEM.md), [design quality](docs/DESIGN_QUALITY_RULES.md) and [content rules](docs/CONTENT_RULES.md): product and editorial standards.
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md): milestone gates.

## Code layout

`app/` holds App Router pages, metadata, states and route handlers. `components/` holds reusable UI and site shell. `lib/catalog/` maps normalized database rows to the existing catalog model; `lib/discovery/` contains the deterministic parser, ranker and search service. `supabase/migrations/` holds schema, search and security changes. `supabase/seed.sql` holds the synthetic catalog. `types/database.ts` is generated from the migrated schema.

The button primitive follows the shadcn/ui composition style and `components.json` is ready for future component additions. Tailwind CSS 4 is configured through `postcss.config.mjs` and the token theme in `app/globals.css`.

## Safety and provenance

Reference pages were inspected for product architecture only. MedBridge uses original branding and copy. Every provider, clinician, price, stay length, credential and experience figure in the catalog is synthetic and labeled as sample data. Public medical information and provider/price claims require review and source evidence before publication. The prototype is set `noindex` until real content and services are ready.
