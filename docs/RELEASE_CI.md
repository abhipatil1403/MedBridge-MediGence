# Automated release gates

Baseline: `5279eafe39b72c2bc4b9df0b48e5efa61464695c`.
Implementation: [.github/workflows/release-gates.yml](../.github/workflows/release-gates.yml).
No application features, migrations or production configuration are changed.
The local dependency patch follow-up is documented in
[DEPENDENCY_SECURITY_GATE_20261011.md](DEPENDENCY_SECURITY_GATE_20261011.md).

## Required checks and owner activation

Pull requests targeting `main` and pushes to `main` run:

| Check | Required commands / evidence |
| --- | --- |
| **Application checks** | `npm ci`, `npm audit --audit-level=high`, `npm run typecheck`, `npm run lint`, `npm test`, explicit Vitest result/skip validation, `npm run build` |
| **Isolated SQL and RLS** | Fresh PostgreSQL, all migrations and seed, all 23 existing `validate-*.sql` scripts, migration reapplication and the three existing local inquiry/workflow-persistence tests |
| **Release gates** | Always runs after both jobs; fails if either job failed, was skipped or was cancelled |

There is no `continue-on-error`. After a successful install, the application job
attempts the other checks even when an earlier check fails, preserving the failed
job outcome. Missing/malformed regression evidence fails its reporting step.
Results are visible in job logs, a passed/failed/skipped step summary and seven-day
JSON artifacts. SQL artifacts contain result metadata and synthetic test assertions,
not database dumps, object files or local environment files.

**Workflow creation alone does not enforce protected merging or deployment.** After
an authorized commit/PR is published, the repository owner must verify an actual
GitHub run and configure the `main` ruleset/branch protection to require **Release
gates**, require reviewed PRs and control direct pushes/bypasses. Select the actual
check shown by GitHub and verify a controlled failing PR cannot merge. Fork PRs may
need owner approval to run. External GitHub checks/rules are not verified locally.
This workflow never deploys. Existing Vercel auto-deploy settings are unchanged and
are not automatically gated by these jobs; protect the path into `main` first.

## Runtime and permissions

- Ubuntu 24.04, supported Node 22 series (Vitest requires at least 22.12 on that
  series), locked dependencies through `npm ci`; no cache is shared across jobs.
- PostgreSQL 17 packages come from the official signed PostgreSQL apt repository.
  Runner and package patch revisions can change; version information is printed.
- Only `contents: read`; checkout does not persist credentials. No repository or
  production secrets are referenced. No `pull_request_target`, cloud deployment,
  hosted database, scanner or monitor activation is used.
- GitHub-owned checkout v4.3.1, setup-node v4.4.0 and upload-artifact v4.6.2 are
  pinned to full SHAs, verified against their official tag refs. Follow
  [GitHub's action-pinning guidance](https://docs.github.com/en/actions/reference/security/secure-use)
  when reviewing updates. PostgreSQL installation follows the
  [official Ubuntu repository instructions](https://www.postgresql.org/download/linux/ubuntu/).

## Skips are explicit exceptions, not passes

`MEDBRIDGE_CI_VITEST_REPORT` selects default + JSON reporters without changing test
selection or guards. `scripts/ci/report-vitest.mjs` validates the actual report and
lists every skipped test and prerequisite. The baseline **45 skipped cases across
13 files** are explicitly named in
[expected-skips.json](../scripts/ci/expected-skips.json):

| Existing file in `tests/` | Cases skipped in the complete default suite | Required integration |
| --- | ---: | --- |
| `agent-live.test.ts` | 16 | Approved catalog fixtures, Cloudflare/Supabase access; additional explicit discovery/persistence opt-ins |
| `agentic-live.test.ts` | 1 | Disposable hosted accounts and execution persistence |
| `case-intake-live.test.ts` | 1 | Disposable hosted accounts/cases |
| `cloudflare-live.test.ts` | 1 | Actual Cloudflare model credentials |
| `document-restore-local.test.ts` | 1 | Dedicated restore environment/tools/artifact path and opt-in |
| `document-scanner-pipeline-local.test.ts` | 1 | Genuine ClamAV plus isolated SQL/HTTP scanner fixture |
| `document-scanner-real.test.ts` | 1 | Genuine engine and current signatures |
| `governed-packages-production-live.test.ts` | 1 | Production-writing opt-in; never enable in release CI |
| `inquiry-safety-local.test.ts` | 1 | Isolated SQL fixture; executed separately in the SQL job |
| `planning-live.test.ts` | 1 | Disposable hosted accounts/plans |
| `production-catalog.test.ts` | 8 | Approved local HTTP/PostgREST catalog fixture and opt-in |
| `reference-public-catalog.test.ts` | 10 | Approved local sourced catalog HTTP fixture and opt-in |
| `workflow-persistence-local.test.ts` | 2 | Isolated SQL fixture; executed separately in the SQL job |

New skips, renamed/removed expected skips, inconsistent counts, failures or a suite
with no completed tests fail report validation. Review any changed manifest with
the actual report and prerequisites; do not regenerate it automatically in CI or
relax test guards. The three SQL-only cases must **all pass with zero skips** in
their separate execution. They remain honestly reported as skipped in the default
suite; they are not double-counted as default-suite successes.

No Cloudflare/Supabase credentials, restore/scanner opt-ins or live fixture URLs are
injected to make the remaining tests run. A green CI run does not verify them.

## Isolated SQL prerequisites and safety

`scripts/ci/sql-gate.mjs` requires `MEDBRIDGE_CI_SQL=1` and PostgreSQL
`initdb`, `pg_ctl`, `psql` binaries (`MEDBRIDGE_CI_PG_BIN` selects their directory).
It accepts no database URL or command arguments. It creates its own temporary
cluster, a random loopback port and nonce-named disposable databases, verifies the
server's data directory, and removes inherited libpq configuration. Trust auth is
limited to this runner-owned, loopback-only QA cluster. Production credentials are
never needed. Do not run it with production environment secrets or as root.

### PostgreSQL 17 startup and diagnostic evidence

The cluster is an owned process, not a service or container. PGDG PostgreSQL 17
defaults to `/var/run/postgresql` for Unix sockets. The ordinary runner cannot
write its socket lock there. The disposable cluster explicitly disables Unix
sockets (`unix_socket_directories = ''`); all existing clients use loopback TCP.
No permissions on a shared directory, credentials, ports or production settings
are changed. `pg_ctl -w -t 60` must succeed, `pg_isready` must report accepting
connections, and the existing data-directory identity check must pass before
any database, migration or test is executed.

`startup-diagnostics.json` records bounded, redacted process status, health
results and a snapshot of the server log taken **before** migrations/fixture SQL.
It is exported alongside the existing synthetic results even when startup fails.
It never dumps environment variables, the data directory or post-migration logs.
Failed startup prints the same diagnostics, exits unsuccessfully, records zero
unexecuted migrations/tests, and still attempts owned-cluster shutdown. Never
substitute service provisioning success for SQL/RLS execution evidence.

On 11 October 2026, the unchanged launcher from PR #1 commit `3847214` reproduced
the first hosted failure on Ubuntu 24.04 with PGDG PostgreSQL **17.11** and Node
22.23.3 as an ordinary user. The server log showed loopback TCP listening followed
by `FATAL: could not create lock file "/var/run/postgresql/.s.PGSQL.34541.lock":
Permission denied`. The original hosted run did not export its server log, so this
root-cause evidence comes from the equivalent local reproduction, not a recovered
hosted log. See [the original failed run](https://github.com/abhipatil1403/MedBridge-MediGence/actions/runs/38137776701).

The corrected local PostgreSQL 17.11 gate completed 42 migrations, the existing
reapplication/seed checks, all 23 SQL scripts and all three persistence/lifecycle
tests (zero failures or skips); the owned cluster stopped. Seven new startup,
readiness and diagnostic-redaction regressions passed on Linux and Windows.
Restoring the unwritable socket setting **only in an isolated test copy** produced
exit 1, status 3 (stopped), health 2 (no response), the permission-denied diagnostic,
zero migrations/tests and confirmed shutdown. The existing 23 report/SQL/aggregate
failure controls and actionlint also passed. This local evidence does not replace
the next actual GitHub run or waive the unresolved dependency security block.

The runner reuses the existing Auth/Storage bootstrap and fixtures, ordered
migrations and seed. Nineteen independent SQL scripts run against the fresh base.
A separate package clone commits the explicitly isolated publication fixture for
personal-care/package checks; its inquiry clone supplies the existing consent,
provider-response and workflow-persistence tests. Every SQL command uses
`ON_ERROR_STOP=1`; any failed prerequisite/assertion terminates the gate. The owned
cluster is stopped afterward and temporary evidence is left for the ephemeral
runner to discard. Locally, evidence is retained in the printed temporary path.

These are real PostgreSQL queries, transactions, grants and RLS, but the bootstrap
emulates Supabase Auth/Storage schemas. It does not exercise real email auth,
PostgREST transport, stored object bytes, external notifications or genuine malware
detection. Existing metadata-only clean fixtures are not scan evidence.

Local commands (Node 22.12+ and PostgreSQL 17 recommended):

```sh
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
MEDBRIDGE_CI_VITEST_REPORT=/absolute/private/path/vitest.json npm test
node scripts/ci/report-vitest.mjs /absolute/private/path/vitest.json
npm run build
MEDBRIDGE_CI_SQL=1 MEDBRIDGE_CI_PG_BIN=/path/to/postgres/bin node scripts/ci/sql-gate.mjs
```

On PowerShell, set the two task environment variables using `$env:` before invoking
the same commands. Do not add `.env.local` to CI or use hosted live gate scripts.

## Pilot remains NO-GO

Passing CI establishes only these repository regression/security gates. Independent
monitoring, attributable alert receipt reconciliation, approved production ClamAV,
incident primary/deputy coverage, database **and private Storage** restore evidence,
approved retention/holds/RPO/RTO and genuine provider participation/acceptance
remain separate blockers. Production document access stays fail-closed and
automatic expiry stays disabled. CI does not establish any of those approvals.

## Original dependency gate failure

During the original CI implementation, the credential-free clean install succeeded,
but npm audit on 11 October
2026 exited 1 with **seven high-severity affected packages**: `next`,
`source-map-js`, `braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`
and `eslint-config-next`. These are affected package counts, not seven independent
application exploits. Application-specific exploitability was not tested. The
current `next.config.ts` has no `images.remotePatterns`; the vendor states that
configuration is unaffected by the particular image-optimization SSRF advisory.
That observation does not clear other advisories or the dependency gate. The
lockfile was unchanged at that stage; no automatic fix or downgrade was applied.

The audit includes the vendor's
[Next.js image-optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4),
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and
[source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
The install also warns that locked ESLint 9.39.5 is unsupported. Review compatible
patched dependency versions in a separate scoped fix and rerun the gate; do not
blindly use `npm audit fix --force` or accept npm's proposed Next ESLint downgrade.
The required high-severity audit step intentionally blocks that baseline.
Registry unavailability also fails that check rather than implying a clean audit.

The subsequent local dependency work patches Next/config to 16.3.8 and
source-map-js to 1.2.2. The remaining five affected packages share the unpatched
braces advisory. **The dependency gate still fails and is not waived.** See the
linked dependency report for fresh commands, versions, compatibility and results.
The workflow implementation and severity threshold remain unchanged.

## Original CI implementation validation — 11 October 2026

These results are retained from the preceding CI implementation task, **not current
dependency-patch execution or GitHub Actions evidence**. Runtime:
Node 22.16.0, npm 9.9.4, PostgreSQL 18.1. CI targets Node 22 and PostgreSQL 17 on
Ubuntu 24.04; that hosted combination remains unverified until publication/run.

| Check / attempt | Actual result |
| --- | --- |
| Full Vitest attempt 1 | 1,098 passed, 45 skipped; 97.06 seconds. Windows npm did not forward the requested reporter arguments; no JSON report was produced. |
| Full Vitest attempt 2, configured JSON reporter | 1,098 passed, 45 skipped; 72.43 seconds. Exact skip inventory validated successfully. |
| SQL runner attempt 1 | Interrupted during startup after the owned cluster became ready; no SQL validation completed. The owned process/cluster were stopped. `pg_ctl` stdio handling was corrected for Windows. |
| SQL runner attempt 2 | Exit 1: 18 scripts passed, visitor-history script rejected the non-personal fixture database name. No integration tests completed; owned cluster stopped. Database naming was corrected without weakening its guard. |
| SQL runner attempt 3 | Exit 0: 42 migrations installed, existing Operations/monitor reapplication checked, seed loaded, **23 SQL scripts passed**, **3 local persistence/inquiry tests passed with zero skips**; owned cluster stopped. |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0; zero errors, one existing scanner unused-expression warning |
| Final targeted lint of CI helpers and Vitest config | Exit 0; zero errors/warnings |
| `npm run build`, normal checkout | Exit 0, Turbopack production build |
| `npm ci`, separate tracked-source export with current CI helpers/config and no `.env.local` | Exit 0; 419 packages installed, 420 audited; seven high-severity findings and ESLint support warning |
| `npm run build`, credential-free export | Exit 0, Turbopack production build; no production credentials supplied |
| `npm audit --json` and `npm audit --audit-level=high` | Both exit 1; seven high-severity affected packages. Current required dependency gate is **FAILED**, not waived. |
| Actionlint 1.7.7 | Exit 0, including final audit-step workflow; official release archive checksum verified |
| Report / SQL controls | Seven checks passed: actual report accepted; unexpected skip, failed assertion, inconsistent counts, missing report, missing SQL opt-in and external target argument rejected |
| Existing browser-secret checker | Exit 0; configured private secrets absent from 551 repository files and 34 generated browser JavaScript assets |

Private local evidence is under the Codex artifact directory
`medbridge-ci-20261011`, with temporary SQL results in the printed owned cluster
directory. No credentials, database dumps or patient documents are included in the
repository changes. Earlier failed/interrupted attempts are retained separately.
No commit, push, deployment or external enforcement/production change is claimed.
