# CivicTrack backend

CivicTrack now uses Node/Express with a **hosted Supabase test database**. No existing
SQL Server accounts or reports are imported. Hosted schema, restricted application
login, verified TLS, Express readiness and both API sign-ins are verified (see below).
The frontend remains in `docs/` on GitHub
Pages; `Client/` is the older copy and is unchanged.

`server.js` loads `Server/.env` and starts Express. `app.js` exports the app without
listening. `database.js` owns the lazy PostgreSQL pool and named-value bindings.
`npm.cmd start` serves the API and the local `docs/` frontend. Node >=22 is required;
local checks use Node 24. Use a supported Node LTS on the eventual API host.

## Local checks without a hosted database

From the repository root in Windows PowerShell:

```powershell
Set-Location -LiteralPath .\Server
npm.cmd ci --ignore-scripts --no-audit --fund=false
npm.cmd test
npm.cmd audit
```

Tests include fixture-based browser/API checks and embedded PostgreSQL via PGlite.
The embedded suite executes the actual schema, grants, RLS, parameterized queries,
registration, bcrypt/JWT sign-in, ownership, status changes and private image reads.
It uses only disposable memory and temporary image files. PGlite is a development
dependency and does not replace the hosted PostgreSQL server or run in production.
These checks do not establish Supabase networking, TLS or pooler compatibility.

## Fresh Supabase test setup (operator steps, not applied automatically)

1. Select a new, isolated non-production Supabase project. Do not reuse a populated
   database for these scripts. Keep `civictrack` out of the Data API's exposed schemas.
2. In its SQL Editor, review and run `Database/Postgres/001_schema.sql` and then
   `Database/Postgres/002_server_permissions.sql` as the database owner. These are
   one-time, transactional scripts; they intentionally fail if their schema/role
   already exists. They contain no DROP statements, account data or passwords.
3. The second script creates `civictrack_app` with NOLOGIN and limited permissions.
   Privately enable LOGIN and assign a new strong password to that role using an
   approved database administration session. Use this dedicated role in Express,
   never the owner login. Do not put password-setting SQL in Git, chat or screenshots.
4. For test-account setup only, review/run `Database/Postgres/test_employee.sql`
   as the operator. It approves the single employee ID `CT-TEST-ADMIN`. The Express
   role cannot insert or delete employee approvals or edit their identity/role.
5. Copy `.env.example` to `.env` only if it does not already exist, then replace
   placeholders privately. Delete unused optional lines. Existing host environment
   settings take precedence over dotenv; the file path is independent of the shell
   working directory. Never print or commit actual values.
6. In Supabase's Connect dialog, choose **Session pooler** for an IPv4-only network.
   Copy its exact hostname and port (normally 5432); do not derive them from the
   region. The custom-role username is `civictrack_app.<project-ref>` through the
   shared pooler, or `civictrack_app` for a direct connection. Use the role's password,
   not the project owner's password. Direct access normally needs IPv6 unless the
   project has the IPv4 add-on. Session mode fits the persistent Express process.
7. Use verified TLS. If the provider requires a CA certificate, download its CA
   certificate and set `DB_SSL_CA_FILE` privately. Do not disable certificate
   verification to work around a connection error.

The private schema has RLS enabled on all twelve tables. Only `civictrack_app` has
application DML policies; Supabase `anon`/`authenticated` roles have no schema/table
access. The server role can read all application rows so **Express must continue
checking identity, resident ownership and administrator permissions**. RLS here
blocks browser roles; it does not implement per-resident ownership independently.
No Supabase browser/service key is needed for this PostgreSQL connection.

Sources: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres),
[database roles](https://supabase.com/docs/guides/database/postgres/roles),
[Data API security](https://supabase.com/docs/guides/api/securing-your-api).

## Environment variables

Only names/placeholders belong in `.env.example`; placeholders are not configuration.

| Variable | Default / purpose |
| --- | --- |
| `DB_HOST` | Required PostgreSQL/session-pooler hostname, without credentials or URL. |
| `DB_NAME` | `postgres`; use the chosen database name. |
| `DB_PORT` | `5432`; use the exact Connect dialog port. |
| `DB_USER` | Required dedicated database role, with project suffix for shared pooling. |
| `DB_PASSWORD` | Required private password for that database role. |
| `DB_SSL_MODE` | `require`: verified TLS. `disable` is accepted only for localhost/loopback development. |
| `DB_SSL_CA_FILE` | Optional local path to the provider CA PEM certificate. |
| `DB_POOL_MAX` | `5` connections per Express process; choose within the project's connection budget. |
| `DB_CONNECT_TIMEOUT_MS` | `15000` milliseconds. |
| `DB_REQUEST_TIMEOUT_MS` | `15000` milliseconds, client query timeout. |
| `PORT` | `3000`, Express listener. |
| `JWT_SECRET` | Required private signing key for standalone startup. |
| `JWT_EXPIRES_IN` | `7d`, existing session duration. |
| `CORS_ALLOWED_ORIGINS` | Empty by default; exact allowed frontend origins separated by commas. |
| `TEST_RESIDENT_IDENTIFIER` | Private test-resident email for opt-in seeding/sign-in verification. |
| `TEST_RESIDENT_PASSWORD` | Private test-resident password. |
| `TEST_ADMIN_IDENTIFIER` | Private test-administrator email for seeding; shared login also accepts employee IDs. |
| `TEST_ADMIN_PASSWORD` | Private test-administrator password. |
| `TEST_DATABASE_SEED_CONFIRM` | Set to `empty-test-database` only to allow explicit non-production seeding. |
| `NODE_ENV` | Development locally; `production` on Render enables its single trusted ingress proxy and requires durable storage. |
| `IMAGE_STORAGE_PROVIDER` | `local` by default for development; `supabase` is required in production. No silent disk fallback. |
| `SUPABASE_URL` | Required for remote images: exact HTTPS project origin, without credentials or paths. |
| `SUPABASE_SECRET_KEY` | Backend-only `sb_secret_...` API key for Storage; never put it in frontend code or Git. |
| `SUPABASE_IMAGE_BUCKET` | Defaults to the private `civictrack-issue-images` bucket. |
| `IMAGE_STORAGE_TIMEOUT_MS` | Default `15000`; accepted range `1000`–`60000` milliseconds. |

Positive integers override pool/timeout/port defaults. Invalid TLS modes fail
closed. Connection failures return generic 503 errors; driver details and settings
are not logged. The pg pool replaces failed clients; acquisition retries have a
250 ms backoff. Statements/writes are never automatically replayed. The server
role also has a 15-second database statement timeout and idle-transaction timeout.
A timed-out connection is discarded. Reconcile ambiguous write outcomes before retrying.

## Create two test accounts and run locally

### Masked operator setup for the approved hosted test project

After configuring the ignored `Server/.env` from the project's actual Connect
dialog, run this in a local PowerShell terminal from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\Server\scripts\configure-test-login.ps1 -SeedTestAccounts
```

The helper is deliberately pinned to the approved CivicTrack project and session
pooler endpoint. It privately prompts for the **postgres database-owner password**,
not the Supabase website password. The owner credential is passed through redirected
standard input, never command-line arguments, environment variables or saved files.
It reads the application password already in `.env`; it never replaces that password.
No password, verifier, token, SQL text or raw driver error is printed. Memory holding
credentials is temporary; managed strings cannot be guaranteed to be zeroed.

The helper requires verified TLS for owner and application connections, checks the
owner/database identity, restricted role attributes, memberships, table/column grants,
RLS and policies, and changes only LOGIN/password in a transaction. It sends a
client-derived SCRAM verifier instead of a plaintext password in the ALTER statement,
following the approach used by PostgreSQL's `psql` `\password` command. The verifier
is sensitive database metadata; access to provider statement/audit logs must remain
restricted. It is never put in local output, a migration or an MCP call.

The dedicated account is then used for a real verified-TLS connection and Express
readiness check. With `-SeedTestAccounts`, the helper invokes the existing guarded
seed once and then verifies resident/admin shared sign-in and sessions. The seed
confirmation exists only in that child process, not persisted to `.env`. Existing
accounts cause seeding to stop; inspect account state before retrying a failure.
Without the switch, it only configures LOGIN/password and verifies readiness.
Do not reset the project-owner password just to configure the application role.

`RemoteSigned` applies only to the child PowerShell process; organizational policy
still takes precedence. If local scripts remain blocked, follow that policy. If
TLS validation fails, obtain the provider CA and set
`DB_SSL_CA_FILE` privately. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` or disable TLS.
The operator successfully ran the helper on 2026-11-22. Do not rerun it with
`-SeedTestAccounts` against this already-seeded project. Normal startup is
`npm.cmd start`; account verification is `npm.cmd run test:sql`.

Local preparation checks passed 87 tests, including three operator-setup checks
and a public RFC 7677 SCRAM proof vector. A network-enabled application preflight
on 2026-11-22 reached the pooler but failed certificate validation with
`SELF_SIGNED_CERT_IN_CHAIN` before authentication. Download the project's CA from
Database Settings > SSL Configuration and set `DB_SSL_CA_FILE` to its local path
before running the masked setup. Do not trust a certificate merely captured from
the failing connection. Hosted inspection still showed the application NOLOGIN.

The CA blocker was subsequently resolved on the same date: the production CA URL
was verified against Supabase's official dashboard source and the public certificate
was saved in `certs/supabase-prod-ca-2021.crt`. Its provenance/fingerprint are recorded
in `certs/README.md`. Only `DB_SSL_CA_FILE` was added to the private `.env`; existing
passwords and signing keys were preserved. A fresh connection probe confirmed
`TLS authorized: true`. The operator then completed the private owner setup;
application login/readiness and seeded API sign-ins were independently verified.

### Manual seed and startup commands

The seed steps below are for a new, unseeded isolated project only. The current
project already contains both test accounts; use only verification/startup commands.
For an unseeded project, first create its schema and unused test employee approval:

```powershell
# Inside Server. Edit privately; do not paste credentials into the terminal/chat.
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
notepad.exe .env
# Set the TEST_* inputs privately, including the explicit seed confirmation.
npm.cmd run seed:test
# Remove TEST_DATABASE_SEED_CONFIRM after the one-time seed.
npm.cmd run test:sql
npm.cmd start
```

Seeding checks that both account tables are empty and that the approved employee is
unused, then uses the normal resident/admin registration endpoints. It creates no
reports. It never logs passwords, hashes or tokens. It refuses to run without the
explicit confirmation. A later registration failure can leave the first account
created; inspect the isolated database before retrying. It never resets tables.

`test:sql` is the retained command name for an opt-in, read-only PostgreSQL account
check. It verifies shared sign-in/session for the two configured test accounts and
closes its temporary listener/pool. It is separate from the offline test suite.
Hosted schema access through MCP, dedicated-role Express connectivity with verified
TLS, test seeding and both real API sign-ins/session checks are verified.

An additional explicit hosted regression creates only uniquely marked disposable
records and a temporary image, then removes them while retaining the seeded pair:

```powershell
# Inside Server, only on the approved test project with 1 resident, 1 admin, 0 reports.
node tests/sql-authorization.cjs --disposable-test-data
```

This check passed for invalid credentials, inactive accounts, expired/missing
sessions, resident report isolation (read/edit/delete), pending-only resident
changes, permitted administrator status updates/deletion, private photo access,
shared civic reads and rejection of an unapproved CORS origin. Cleanup was verified
as 1 resident, 1 administrator and 0 reports. It never resets identity sequences or
deletes unmarked records. On failure, inspect fixture state before retrying.

### Hosted setup progress — 2026-11-22

The operator selected an empty CivicTrack database; existing SQL Server data is
untouched. On the project scoped by reference `ogzurumjuxwrvpsewwra`, MCP applied:

- `20261122003116`: `civictrack_001_schema` from `001_schema.sql`.
- `20261122003148`: `civictrack_002_server_permissions` from `002_server_permissions.sql`.

Verified 12 tables with RLS enabled, no schema/table read access for `anon` or
`authenticated`, 12 server policies, usable identity sequences, and the expected
application DML grants. `civictrack_app` has no superuser, role/database creation,
or RLS bypass privileges. The operator enabled LOGIN and assigned the existing
private application password through the masked setup, with grants unchanged. It
cannot insert/delete employee approvals or change their employee IDs; it can
update `is_registered`. The approved test ID `CT-TEST-ADMIN` was consumed by normal
administrator registration. Exactly 1 resident and 1 administrator now exist;
there are 0 reports after hosted authorization fixture cleanup.

The operator reported successful verified-TLS owner/application connections,
Express readiness, registration and both API sign-ins. Independent reruns of
`npm.cmd run test:sql` and the explicit hosted authorization check passed. MCP
confirmed LOGIN, restricted role attributes, the consumed approval, and final
account/report counts. Do not rerun setup scripts, the employee insert or seeding.

Browser dashboard routing/visual verification remains manual: the in-app browser
was unavailable, and the connected browser rejected localhost access under its
enterprise network policy. No browser-policy workaround was attempted. The 87
local tests cover dashboard guard logic, but do not replace this real browser check.

Open `http://localhost:3000/Pages/Public/Sign-In/Sign-In.html` (or your configured
`PORT`). `GET /api/health` works without SQL; `/api/health/ready` executes `SELECT 1`
and returns 503 if unavailable. Polling readiness can keep a database awake.

## Authentication and PostgreSQL behavior

The shared sign-in form, JWT format, bcrypt password hashes, separate account-ID
namespaces and role/ownership guards are retained. Email comparisons and uniqueness
are case-insensitive within each account table; identical identifiers across tables
remain possible and ambiguous matching credentials fail generically. Employee IDs
use exact comparison. Administrator registration consumes an approved employee in
one atomic PostgreSQL statement, so concurrent requests cannot reuse that approval.

Queries use PostgreSQL syntax: boolean literals, CURRENT_TIMESTAMP, LIMIT and
RETURNING. The request binding helper converts fixed SQL's named values to native
$n parameters; user values never become SQL text. Result rows/affected-row counts
retain the shape expected by the existing handlers. Dates remain calendar-date
strings; counts are parsed only when safely representable as JavaScript integers.
Poll deletion removes votes, options and the poll in one dependent CTE statement.
The old `Database/Schema/civictrack.sql` is retained only as a SQL Server reference;
do not run it in Supabase. There is no automatic data-import or schema-reset command.

## Frontend and image hosting

`docs/Assets/JS/config.js` still has the unchanged empty `API_BASE_URL`, meaning the
frontend's own origin. GitHub Pages can preview the interface but cannot run Express.
A separately deployed API will need that one public setting plus the exact frontend
origin in `CORS_ALLOWED_ORIGINS`; no passwords or database settings belong in docs/.
CORS is not authentication. Existing token-origin restrictions, authorized image
fetches and dashboard guards remain in force.

Local development defaults to private disk in `Server/uploads`. Production requires
the private Supabase Storage adapter; local disk fallback is refused. Both retain
owner/administrator checks and type/signature/5 MiB validation. Failed report inserts
remove the new image. Readiness checks both SQL and the private bucket settings.
The adapter is fixture-tested; real Storage API access still needs the backend
secret key and a hosted round-trip check. No images have been moved and no live
frontend configuration has changed.

## Security and remaining verification

pg 8.23.1 (30 September 2026) and development-only PGlite 0.5.15 (3 November 2026)
were selected on 22 November 2026; both releases exceed the 14-day release-age rule.
Install lifecycle scripts remain disabled. SQL Server driver packages have been
removed; Multer 2.5.0 and the targeted Express dependency fixes are retained.
Refresh `npm.cmd audit` whenever dependencies change.

Local verification on 22 November 2026: clean lockfile install succeeded with
lifecycle scripts disabled; all 87 tests passed (including eight embedded-PostgreSQL
integration checks), all 26 server JavaScript/helper files passed syntax checks,
and the fresh full dependency audit reported zero vulnerabilities.
The offline suite is complemented by the successful hosted checks recorded above.

Historical SQL credentials and the JWT signing key were recorded as exposed in
Git history. New, separate passwords and a new signing key were generated for this
test configuration. Revocation/replacement of historical credentials wherever
reused, including retirement of the old signing key in other deployments, remain
**pending operator confirmation**. Starting empty or
removing files does not rotate credentials or rewrite history. Record completion
status/operator/date only, never values.

API hosting, GitHub Pages/API integration, durable private image storage, production
backups and rollback remain subsequent work. Real browser dashboard routing and
cross-origin integration remain unverified. Existing SQL Server data is untouched;
photos or other data outside this checkout have not been inventoried or migrated.
No push or production deployment is performed by these local scripts/checks.

## Render Free staging preparation

See [the Render staging runbook](RENDER.md). The root `render.yaml` prepares one
Free Node service, manual deployments, verified database TLS, a separate generated
signing key and a private Supabase Storage provider. It creates no Render database
or disk. The Blueprint has not yet been deployed. GitHub Pages is unchanged.
