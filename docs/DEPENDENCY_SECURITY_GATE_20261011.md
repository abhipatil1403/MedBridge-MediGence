# Dependency security gate — 11 October 2026

Baseline: local HEAD and `origin/main` are
`5279eafe39b72c2bc4b9df0b48e5efa61464695c`. All changes remain local and
uncommitted. Production is unchanged. Existing release CI and its 45-test skip
inventory are preserved; no security exception is added.

## Findings and compatible remediation

The fresh pre-change `npm audit --json` returned exit 1: seven high-severity
**affected packages**, representing three advisory sources, not seven distinct
application exploits. The four glob-chain ancestor entries below have no separate
advisory. Their aggregate npm ranges describe dependency exposure, not independent
vulnerable code. No production exploitation test was attempted.

| Affected package | Installed before → locked after | Dependency path | Advisory / affected range | Resolution |
| --- | --- | --- | --- | --- |
| `next` | 16.3.6 → 16.3.8 | Direct runtime dependency | Six advisories below; aggregate `16.0.0 - 16.3.7` | Minimal patched 16.3.8, replacing npm's suggested 16.4.0 update |
| `source-map-js` | 1.2.1 → 1.2.2 | `next → postcss`; `@tailwindcss/postcss → postcss`; `@tailwindcss/postcss → @tailwindcss/node` | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), CVE-2026-93749; `>=1.0.0 <1.2.2` | Targeted lock update to patched 1.2.2 within all parents' `^1.2.1` ranges |
| `eslint-config-next` | 16.3.6 → 16.3.8 | Direct development dependency | Inherited braces exposure; npm aggregate `>=14.3.0-canary.0` | Kept aligned with Next; braces exposure remains |
| `@next/eslint-plugin-next` | 16.3.6 → 16.3.8 | `eslint-config-next → plugin` | Inherited braces exposure; npm aggregate `>=14.3.0-canary.0` | Patch does not remove `fast-glob@3.3.1` |
| `fast-glob` | 3.3.1 → 3.3.1 | `eslint-config-next → plugin → fast-glob` | Inherited braces exposure; npm aggregate `*` | No compatible resolution established |
| `micromatch` | 4.0.8 → 4.0.8 | Previous path `→ micromatch` | Inherited braces exposure; npm aggregate `>=0.2.0` | Requires `braces ^3.0.3`; exposure remains |
| `braces` | 3.0.3 → 3.0.3 | Previous path `→ braces` | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), CVE-2026-93687; `<=3.0.3` | No published patch: registry latest is 3.0.3; explicit query for 3.0.4 returned E404 |

The braces advisory describes recursive stack exhaustion from deeply nested glob
patterns. Static inspection found this chain only under the development ESLint
plugin, no application imports of braces/micromatch/fast-glob and no patient/API
input passed into it. A production request exploit is not demonstrated in this
configuration; malicious build/lint inputs remain a toolchain concern. This
assessment does **not** waive the required audit gate.

Both the matching plugin 16.3.8 and latest stable 16.4.0 still pin fast-glob 3.3.1.
Registry latest fast-glob 3.3.3 still requires micromatch `^4.0.8`; latest
micromatch 4.0.8 still requires braces `^3.0.3`. Updating these parents alone would
not remove the advisory, so no unnecessary parent update/override was added.
No safe patched upstream chain was found. npm proposes downgrading
eslint-config-next to 14.2.35, a different framework generation. That proposal was
rejected; removing lint rules, introducing an unreviewed fork, overriding with an
unpublished version, or suppressing the advisory would not satisfy this task.
The smallest follow-up is an upstream fixed compatible glob chain, followed by
a targeted lock update and the same gates. Any alternative replacement needs
explicit compatibility/security review first.

The source-map advisory concerns attacker-controlled indexed-map offsets causing
event-loop blocking. Repository searches found no application source-map consumer
or uploaded source-map processing. Its demonstrated use is CSS build tooling,
with Next also carrying PostCSS. No runtime exploit is established; the compatible
patch is applied regardless. The upstream [1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)
and npm metadata identify the patched version.

### Next.js advisory details

The vendor's [16.3.8 security release](https://github.com/vercel/next.js/releases/tag/v16.3.8)
fixes all six original audit advisories:

| Advisory | Original affected range | Configuration assessment |
| --- | --- | --- |
| [GHSA-cjq9-62q9-8jv4](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4), high image SSRF | `>=16.0.0 <16.3.8` in current audit | No `images.remotePatterns` in next.config.ts; vendor says this configuration is unaffected by this particular issue |
| [GHSA-3w37-wq28-93x7](https://github.com/vercel/next.js/security/advisories/GHSA-3w37-wq28-93x7), moderate Draft Mode cache leak | `>=16.3.0 <16.3.8` | No cacheComponents/experimental.useCache configuration, Draft Mode calls or `use cache` directives found; described prerequisites absent |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676), moderate SSG/ISR cache poisoning | `>=16.0.0 <16.3.8` | Requires self-hosted Pages Router; repository has App Router only and production uses Vercel, which vendor excludes |
| [GHSA-39w2-rjm5-chcv](https://github.com/vercel/next.js/security/advisories/GHSA-39w2-rjm5-chcv), low development MCP disclosure | `>=16.0.0 <16.3.8` | Affects `next dev`, not production. The dev script exists, so developer exposure is actionable |
| [GHSA-f87g-xv8r-7p7x](https://github.com/vercel/next.js/security/advisories/GHSA-f87g-xv8r-7p7x), moderate metadata-image bypass | `>=16.0.0 <16.3.8` | Described webpack metadata routes/dynamicParams prerequisites not found; npm build uses Turbopack |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p), moderate cross-user cache poisoning | `>=16.0.0 <16.3.8` | Requires root catch-all with SSG/ISR. Catch-alls are scoped to admin/provider/support, not root; no matching setup found |

These are source/configuration assessments, not proof against every attack or a
live production exploit reproduction. All six are removed from the local audit
by installing 16.3.8. Production retains its original dependency baseline.

## Change boundaries and compatibility

- `package.json`: only exact Next and matching eslint-config-next 16.3.8 pins.
- `package-lock.json`: those patches, matching Next env/native compiler packages,
  and source-map-js 1.2.2. npm 9 also records six already-bundled optional WASI
  metadata entries beneath unchanged `@tailwindcss/oxide-wasm32-wasi@4.3.3`;
  they are not new direct dependencies or Tailwind upgrades.
- React and React DOM stay at 19.3.0. Registry peer range for Next 16.3.8 includes
  `^19.0.0`; Node engine stays `>=20.9.0`. Matching ESLint config still supports
  ESLint `>=9.0.0` and TypeScript `>=3.3.1`. Installed Node 22.16.0 is supported.
- No overrides, scripts, application features, permissions, migrations, production
  flags, audit threshold or skip exceptions are changed.
- Documentation is the only other change in this task. Pre-existing local files:
  modified vitest.config.mjs; untracked workflow, scripts/ci helpers, RELEASE_CI,
  foundation approval record and release readiness audit. Those remain uncommitted.

## Fresh validation

Runtime: Windows, Node 22.16.0, npm 9.9.4, PostgreSQL 18.1. These are this task's
actual local executions, not historical reports or GitHub Actions runs. No hosted
SQL targets, live-test opt-ins, patient records or patient/provider notifications
were used.

| Command / attempt | Actual result |
| --- | --- |
| Pre-change `npm audit --json` | Exit 1; 7 high affected packages, zero other severities |
| Registry metadata: Next/config/plugin 16.3.8, latest stable plugin 16.4.0, braces versions, source-map-js 1.2.2 | Compatibility and available versions inspected. `npm view braces@3.0.4` returned E404: no such release; not an install failure |
| `npm install --package-lock-only --ignore-scripts --save-exact next@16.3.8 eslint-config-next@16.3.8` | Exit 0; 6 high affected packages before the source-map patch |
| `npm update source-map-js --package-lock-only --ignore-scripts` | Exit 0; 5 high affected packages |
| `npm ci` | Exit 0; 415 packages installed, 416 audited, approximately 9 minutes. Existing ESLint 9.39.5 support warning; 5 high findings |
| Post-lock `npm audit --json`, `npm audit --audit-level=high`, and required audit repeated after completed clean installation | All exit 1; exactly the same 5 braces-chain affected packages; Next/source-map-js absent. No suppression or severity downgrade |
| `npm ls next react react-dom eslint-config-next @next/eslint-plugin-next braces micromatch fast-glob source-map-js --all` after install | Exit 0; installed paths/versions match the report and no invalid peer dependency was reported |
| `npm test` with `MEDBRIDGE_CI_VITEST_REPORT` | Exit 0; **1,098 passed, 0 failed, 45 skipped**, 1,143 total; 72.01 seconds; 35 files passed, 12 entirely skipped (13 contain some skipped tests) |
| `node scripts/ci/report-vitest.mjs <fresh-report>` | Exit 0; every skipped name/file matched the existing 45-case manifest; no skips counted as passes |
| `MEDBRIDGE_CI_SQL=1 MEDBRIDGE_CI_PG_BIN=<local-bin> node scripts/ci/sql-gate.mjs` | Exit 0; 42 migrations installed, seed and migration reapplication checked, **23 SQL/RLS scripts passed** and **3 isolated workflow/inquiry tests passed, 0 failed/skipped**. Owned cluster stopped (`clusterStopped: true`) |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; 0 errors, 1 existing unused-expression warning at scripts/document-scanner/engine.mjs:21 |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | Exit 0; Next.js 16.3.8 Turbopack production build, compiled in 104 seconds, build TypeScript phase 56 seconds; routes generated successfully. Existing ignored .env.local was loaded; no deployment occurred |
| Targeted indexed-map check, attempt 1 | Exit 1; offsets 0/1 passed, 1,000,000,000 rejected with `Section offset line must not exceed 10000000`. The check wrongly expected acceptance; inspection confirmed the patch's deliberate validation guard. No dependency/application defect inferred |
| Corrected indexed-map check, attempt 2 | Exit 0; offsets 0/1/10,000,000 preserve code and finish under one second; 1,000,000,000 explicitly asserted to throw the bounded validation error |
| Actionlint 1.7.7 on release-gates.yml | Exit 0 |
| Fresh report / SQL / workflow failure controls | **23 passed**: actual report accepted; unexpected skip, failed assertion, inconsistent counts, missing report, missing SQL opt-in and external target rejected; actual Bash aggregate body exercised for all 16 success/failure/skipped/cancelled pairs and only both-success accepted. No `continue-on-error`; high audit still required |
| `node --env-file=.env.local scripts/validate-browser-secrets.mjs` after build | Exit 0; configured private secrets absent from 552 repository files and 34 browser JavaScript assets; secret values not printed |
| Existing `scripts/smoke-discovery.mjs` against the patched local production server, plus read-only health/auth checks | Exit 0; discovery/source exclusion/parser/suggestions/error handling and public/auth/portal/canonical routes passed. Health returned only `{status:"ok"}`; anonymous inquiry/document/security GETs returned 401. Owned local server stopped |
| Manifest/lock and diff checks | Root lock dependencies/devDependencies match package.json; scripts unchanged from HEAD; `git diff --check` passed. No staged files; HEAD/origin remain 5279eaf |

The source-map reproduction/control scripts and altered invalid-report fixtures
are private local artifacts outside the repository. No duplicate application
test suite was introduced. Existing full-suite auth, comparison, document,
inquiry, orchestration and permission tests were reused.

The SQL environment emulates Supabase Auth/Storage schemas in real PostgreSQL,
not hosted PostgREST, genuine object bytes or malware scanning. CI's Ubuntu 24.04 /
Node 22 / PostgreSQL 17 combination still needs an actual GitHub run; local SQL
used installed PostgreSQL 18.1. The unchanged 45 skips and their external/isolated
prerequisites are enumerated in [RELEASE_CI.md](RELEASE_CI.md).

The runtime smoke used a loopback-bound local Next server with the existing
ignored configuration. Its catalog requests read the configured public Supabase
catalog; this is not a credential-free CI execution or an isolated hosted catalog
fixture. Only unauthenticated GETs were issued, with no uploads, provider/patient
actions, model calls, migrations or external notification tests. Passing the
simple health response establishes local serving, not independent uptime or
critical-dependency monitoring.

Evidence: private Codex artifacts `medbridge-dependencies-20261011`; isolated SQL
metadata copied to `sql-results.json`, originals in
`C:\Users\Lenovo\AppData\Local\Temp\medbridge-ci-pg-1UTFMl`.
No credentials, source environment files, database dumps or documents are added
to the repository report.

## Release decision

**Security gate remains BLOCKED** pending a compatible upstream braces fix.
The workflow can be reviewed as a truthful failing gate; it is not a green release
candidate. No GitHub Actions run, commit, push or deployment is claimed.

**Provider pilot: NO-GO.** External monitoring, attributable alert receipts,
genuine production ClamAV, approved incident coverage, database and private Storage
restore assurance, retention/holds/RPO/RTO approval and real provider acceptance
remain separate blockers. Document access stays fail-closed; expiry stays disabled.

## Focused braces disposition review — 11 October 2026

**Decision record:** MB-SEC-BRACES-20261011-001.
**Gate disposition:** BLOCKED. **Exception:** NOT GRANTED.
**Accountable decision maker:** the requesting user, who explicitly stated:
"I am the authorized project and security decision-maker for MedBridge."
Personal name, signature and private authority-evidence reference remain PENDING
the user's completion; no identity is inferred from an email, portal role or
earlier foundation record. This records the user's stated authority, not an
independent verification of identity or authority.

### Owner decision recorded — 11 October 2026

| Field | Recorded decision |
| --- | --- |
| Finding | `MB-SEC-BRACES-20261011-001`; `GHSA-vfj7-8cjw-p6xm` |
| Decision | **KEEP RELEASE GATE BLOCKED** |
| Exception | **NOT GRANTED** |
| Decision-maker / authority | Requesting user; explicitly self-declared authorized project and security decision-maker for MedBridge |
| Personal name / signature / private authority-evidence reference | **PENDING — user completion**; none supplied or inferred |
| Recording date | **11 October 2026 (UTC)**, the current session date; no earlier effective date or user-supplied signature date is asserted |
| Decision source | User's explicit instruction in this conversation to record this decision for this finding |
| Rationale | `braces@3.0.3` remains in the transitive Next.js ESLint dependency chain. The investigation did not demonstrate a safe compatible remediation. Library stack-overflow behavior was observed, but a MedBridge-specific attack path was neither established nor conclusively ruled out. |
| Reconsideration triggers | A verified upstream patch, a validated compatible remediation, or material new exposure evidence |
| Required follow-up | Re-evaluate the dependency and update the security assessment when a trigger occurs |

This is a decision to retain the block, not risk acceptance or an exception.
The technical observations below remain earlier investigation evidence; recording
this decision does not represent fresh tests or new supporting evidence. No CI,
dependency, production or deployment change is authorized. The foundation record
and separate pilot approvals remain unchanged.

### Independently rechecked facts

- [GitHub Reviewed advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  identifies CVE-2026-93687, high severity, affected versions `<=3.0.3`, and no
  patched version. Fresh npm audit returns the same identifier/range. npm's
  package-level `*` is aggregate exposure metadata, not a replacement for the
  advisory's version range. npm reports CVSS v3 7.5; GitHub's displayed CVSS v4
  score is 8.7. Both classify it as high; no severity was reduced.
- Installed tree and lockfile agree on this sole resolved chain, all marked
  development dependencies:
  `eslint-config-next@16.3.8 → @next/eslint-plugin-next@16.3.8 → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3`.
  The five audit entries are one underlying advisory plus four dependency ancestors.
- Fresh registry queries list braces latest as 3.0.3, with no later published
  version. Latest stable Next ESLint plugin 16.4.0 still pins fast-glob 3.3.1;
  latest fast-glob 3.3.3 still uses micromatch `^4.0.8`, whose latest 4.0.8 still
  uses braces `^3.0.3`. No compatible published fix was identified in these paths.
- In the [upstream issue](https://github.com/micromatch/braces/issues/70), a
  maintainer disputes the practical vulnerability and recommends restricting
  pattern input/length. This is a maintainer position, not a withdrawn advisory
  or published fix. The advisory and current npm finding remain active. The NVD
  page could not be retrieved through the browsing tool; no independent NVD
  status is claimed.

### Mechanism versus MedBridge exposure

Local, isolated Node 22.16.0 child processes tested installed braces with synthetic
patterns, a 128 MB heap limit, ten-second timeout and no application credentials:

| Method | Depth / characters | Observed result |
| --- | --- | --- |
| compile | 1,000 / 2,001 | Completed |
| expand | 1,000 / 2,001 | Completed |
| compile | 4,500 / 9,001 | `RangeError: Maximum call stack size exceeded` |
| expand | 4,500 / 9,001 | Same RangeError |

All four child processes completed without timeout; the exceptions were caught by
the probe to avoid crashing its controller. This reproduces recursive stack
exhaustion below the installed 10,000-character cap. An uncaught exception can
terminate a calling process; this is not evidence of an unauthenticated MedBridge
request reaching that sink, exploitation in production, or a reliable threshold
for all runtimes/stacks.

Source tracing found the plugin's fast-glob call in
`dist/utils/get-root-dirs.js`: it processes string/array values from
`context.settings.next.rootDir`. Without that setting it returns `context.cwd`
directly. Effective ESLint configuration for app/page.tsx has no `settings.next`
and leaves the Next pages-link rule enabled. The repository config has no custom
rootDir override. fast-glob's brace-expansion path calls micromatch/braces.

Repository searches found no application imports of this chain. Existing local
build file traces (`.next/**/*.nft.json`) contain no paths into these five packages.
These are observations about this checkout, representative effective lint config
and existing local build artifacts, not a fresh production bundle inspection or
a proof of universal unreachability. No crafted-pattern path from patient/API
inputs was found; no such request exploit was reproduced. Future configuration,
repository-controlled lint inputs and unknown paths remain considerations.
The finding must not be labeled harmless, a false positive or resolved on that
basis. The previous broad toolchain-risk statement is a conditional risk, not
evidence that ordinary PR files or every lint run trigger the defect.

### Technical-remediation disposition

No **verified compatible** technical remediation is available among the published
dependency versions checked. This does not prove a reviewed custom replacement
could never be built. npm's proposed config downgrade to 14.2.35 changes framework
generation. Removing the plugin/rules reduces existing coverage. An override to
latest fast-glob does not remove braces, and an unpublished braces version cannot
be installed. No fork, glob replacement, length/depth guard in third-party code,
runtime-only audit, severity threshold change or advisory suppression was applied.
Any alternative tree or wrapper would require scoped API/behavior/security review
and regression evidence before being considered safe.

### Requirements before any future temporary exception

The owner's recorded decision above keeps the release gate blocked and grants no
exception. The following requirements are retained for a future request; they do
not reopen or supersede that decision.
If a temporary exception is requested, the authorized project/security owner must
record an explicit accept/reject decision with these minimum fields and evidence:

| Required record | Evidence / scope |
| --- | --- |
| Named approver and authority | Verified project authority or security delegation; dated signature/decision reference; project-owner concurrence if authority is delegated |
| Exact exception scope | Advisory, installed chain, package/lock/workflow hashes, intended release revision, environments and gates affected; explicitly say that five audit entries represent this one advisory |
| Exposure and residual risk | This source/config trace, isolated probes and maintainer dispute; identify unverified paths and acknowledge dependency/toolchain availability risk without asserting harmlessness |
| Compensating controls | Evidence of controlled pattern/config inputs, reviewed changes, bounded jobs, least-privilege execution and absence of production secrets; each proposed control separately marked implemented/configured/verified rather than assumed |
| Bounded validity and ownership | Named remediation owner, explicit expiry date, recheck cadence, compatible-fix adoption deadline and early revocation triggers (new exposure, dependency/config change, exploit evidence or available patch) |
| Exit and rollback | Removal/reversion procedure, evidence required to close the exception, notification/escalation responsibilities and a linked tracking item |
| Explicit implementation authorization | Approval of the exact proposed gate change in a separate reviewed follow-up; approval of this report alone is not permission to alter CI |

Do not store secrets or sensitive evidence in this record; link restricted evidence
references only. A future authorized exception must be narrow, expire automatically
or fail closed when invalid, retain visible raw audit evidence, and reject unrelated
high/critical advisories. No such exception implementation is authorized or created
here. A disposition decision would not authorize publication, deployment or pilot
approval.

### Release workflow review

- **Failure behavior:** required `npm audit --audit-level=high` has no
  `continue-on-error`. Later checks use an explicit successful-install condition
  to collect evidence after an audit failure; they cannot erase the failed step.
  Aggregate gate runs with `always()` and accepts only both jobs reporting success.
  Failure, skipped or cancelled jobs are rejected. Cancellation can prevent a
  check from finishing; it must never be treated as a passing release.
- **Skipped tests:** exact 45-case manifest, counts and completed-tests requirement
  are preserved. Missing/malformed reports, unexpected/missing skips and failures
  are rejected. The isolated profile separately requires all three cases with no
  skips. The manifest is not regenerated by CI.
- **Least privilege:** contents:read only, checkout persist-credentials:false,
  SHA-pinned GitHub actions, no production secrets or pull_request_target.
  SQL helper accepts no hosted target and provisions its own loopback cluster.
- **Reproducibility limits:** locked npm ci inputs and pinned action revisions are
  retained. Node 22 patches, Ubuntu images, PostgreSQL 17 package patches and npm's
  advisory database can change. This is reproducible setup, not bit-identical
  execution or a static advisory snapshot. Local Windows/PostgreSQL 18.1 evidence
  does not establish GitHub's Ubuntu/PostgreSQL 17 execution.
- **Enforcement limit:** owner publication, actual GitHub execution, required-check
  branch rules and controlled failing-PR evidence are still pending. The workflow
  does not deploy and by itself does not block existing Vercel automatic deployment.
  No branch protection or external settings were inspected/changed in this review.

### Checks actually executed in this focused review

| Check | Actual result |
| --- | --- |
| Installed dependency listing and lock traversal | Exit 0; versions/path/development flags verified |
| Registry metadata queries | Exit 0; no published compatible patch in the checked chain |
| Fresh npm audit --json | Exit 1; five high affected packages, zero other severities |
| Fresh required npm audit --audit-level=high | Exit 1; security gate remains failed |
| Effective ESLint --print-config app/page.tsx | Exit 0; no Next rootDir setting; existing pages-link rule enabled |
| Initial inline probe launcher | Exit 1 due Windows shell quoting/SyntaxError; no library probe executed. Moved the controller into a local artifact file to fix the launcher, not application/dependency code |
| Corrected isolated library probes | Controller exit 0; four completed observations above, including two caught stack-overflow exceptions; no timeouts or external requests |
| Actionlint 1.7.7 | Exit 0 |
| Existing gate-control harness | Exit 0; 23 controls passed, including all 16 aggregate outcome combinations and report/SQL guard rejection checks. Earlier Vitest JSON was used only as a validator fixture, not claimed as a new suite run |

The full Vitest suite, SQL provisioning, installation and production build were
**not rerun** for this documentation-only review. Their earlier results above
remain historical for this review. Local controls are not GitHub Actions evidence.
Private review artifacts are under `medbridge-braces-disposition-20261011`.

Only this dependency report is edited by the focused review. All pre-existing
manifest, lockfile, workflow, Vitest config, CI helpers and other documentation
changes are preserved. No exception, commit, push, deployment, production migration
or production-setting change occurred.

**Next single action:** re-evaluate the dependency and update this security
assessment when a verified upstream patch, validated compatible remediation or
material new exposure evidence occurs. The owner's disposition is now recorded;
**release gate: BLOCKED; exception: NOT GRANTED**. No gate change is authorized.
The provider pilot remains **NO-GO** independently of this decision.
