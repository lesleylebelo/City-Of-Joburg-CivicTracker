# CivicTrack backend

`server.js` loads `Server/.env` and listens locally, serving the API and `../docs/`.
`app.js` exports Express without listening. The package `main` now points to
`src/functions/api.js`, the Azure Functions v4 entry. `npm.cmd start` still runs
`server.js`. GitHub Pages remains the frontend host; the old `Client/` is untouched.

## Runtime prerequisites

The backend now requires **Node >=22**, including the new Blob SDK's engine floor. Express
5.2.1 needs >=18, mssql 12.5.4 >=18.19, tedious 19.2.1 >=18.17 and bcrypt 6 >=18,
and several older transitive Azure core/identity packages need >=20. Those lower
floors do not override the application/Blob floor. `package.json` declares `node >=22`.
This is a compatibility floor,
**not a production runtime selection or lifecycle recommendation**. Confirm the
chosen host's current supported Node LTS list before deploying. Fixture tests for
this change ran on local Node 24.19.0, not on every version allowed by `engines`.

Functions supports Node 22 and 24 GA in the inspected official documentation:
[Node developer reference](https://learn.microsoft.com/azure/azure-functions/functions-reference-node).
Verify the selected plan/runtime again before deployment; no Azure plan was selected.

For real application use, provide SQL Server with SQL authentication, TCP enabled,
a known reachable hostname/port, the CivicTrack schema and a suitable application
login. SSMS is useful for operator-managed setup. Named SQLEXPRESS instances can use
dynamic ports; do not assume port 1433. For a new development database only, inspect
`Database/Schema/civictrack.sql` and apply it through SSMS. It is not an idempotent
migration for populated databases. This readiness work requires no schema change.
Existing bcrypt hashes and IDs remain unchanged. Administrator registration still
requires an existing authorised employee record; the schema seeds no test accounts.

## Windows PowerShell local run

From the repository root (commands for the operator; no real SQL verification was
performed in this phase):

```powershell
Set-Location -LiteralPath .\Server
node --version
npm.cmd ci
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
notepad.exe .env
npm.cmd test
npm.cmd start
```

Replace every used placeholder privately and remove unused optional lines before
starting. Never commit `.env`, credentials or tokens. Environment variables already
set by the host take precedence over dotenv. The `.env` path is relative to
`Server/`, so `node Server/server.js` from the repository root also works. The
standalone listener requires `JWT_SECRET`, even when SQL is offline.

Open `http://localhost:<PORT>/Pages/Public/Sign-In/Sign-In.html` (default port 3000).
With no database, the listener/static pages and `/api/health` can still run;
sign-in and `/api/health/ready` return 503. Real database setup and test accounts
remain the operator's responsibility.

## Environment variables

Only variable names and placeholders belong in `.env.example`. Defaults below are
applied when the optional variable is absent; placeholders are not configuration.

| Variable | Default / requirement | Purpose |
| --- | --- | --- |
| `DB_HOST` | Required for SQL | SQL hostname (not a connection string). |
| `DB_NAME` | Required for SQL | Existing database name. |
| `DB_PORT` | `1433` | Positive TCP port. |
| `DB_USER` | Required for current SQL authentication | SQL login; never browser configuration. |
| `DB_PASSWORD` | Required for current SQL authentication | Private SQL credential. |
| `DB_ENCRYPT` | `true` | TLS; only the exact value `false` disables encryption. |
| `DB_TRUST_SERVER_CERT` | `false` | Only the exact value `true` bypasses certificate validation. |
| `DB_POOL_MAX` | `5` | Maximum connections per process; zero minimum, 30-second idle timeout. |
| `DB_CONNECT_TIMEOUT_MS` | `15000` | Connection timeout in milliseconds. |
| `DB_REQUEST_TIMEOUT_MS` | `15000` | SQL request timeout in milliseconds. |
| `PORT` | `3000` | Standalone Express listener port. |
| `JWT_SECRET` | Required by standalone entry point | Private HMAC signing key; preserve the existing account/session contract. |
| `JWT_EXPIRES_IN` | `7d` | Existing jsonwebtoken duration setting. |
| `CORS_ALLOWED_ORIGINS` | Empty | Comma-separated exact frontend origins, with scheme and optional port; no paths, trailing slash, credentials or wildcards. |
| `IMAGE_STORAGE` | `local` | Select `local` disk or `blob`; other values fail configuration. |
| `AZURE_STORAGE_ACCOUNT_URL` | Unset | Required HTTPS account origin for Blob with DefaultAzureCredential; no SAS, keys or URL credentials. |
| `AZURE_STORAGE_CONTAINER` | Unset | Required existing private container for Blob; never created or modified by the application. |
| `AZURE_STORAGE_CONNECTION_STRING` | Unset | Optional loopback-emulator connection only; remote connection strings are rejected. |
| `FUNCTIONS_WORKER_RUNTIME` | No application default; set `node` | Functions/Core Tools host setting; not used by the standalone listener. |
| `AzureWebJobsStorage` | No application default | Functions host storage setting, separate from report-photo storage; use local emulator storage only for local runs. |
| `TEST_RESIDENT_IDENTIFIER` | Unset | Existing account for opt-in real-SQL verification only. |
| `TEST_RESIDENT_PASSWORD` | Unset | Private test-account credential, real-SQL verification only. |
| `TEST_ADMIN_IDENTIFIER` | Unset | Existing account for opt-in real-SQL verification only. |
| `TEST_ADMIN_PASSWORD` | Unset | Private test-account credential, real-SQL verification only. |

Pool size and SQL timeout values must be positive integers; invalid values use the
defaults. Port uses the same positive-integer fallback. TLS remains strict for
unrecognised boolean values. For **local development only**, a developer can opt
into `DB_ENCRYPT=false` and `DB_TRUST_SERVER_CERT=true` for an appropriate local SQL
instance. Remote deployments should use encrypted connections with a validated
server certificate. No actual environment file was created or changed here.

SQL connects only on first acquisition, shares concurrent acquisitions and reuses
the pool. A failed connection is closed and becomes a generic 503; the next
acquisition waits out a 250 ms backoff and retries. Pool error events discard the
pool. Requests/writes are never automatically replayed. Driver errors are not
returned or logged with connection details.

`GET /api/health` is public and never calls SQL, retaining its existing response.
`GET /api/health/ready` runs `SELECT 1`, returning `{ "status": "ready" }` on success
or a generic 503 on failure. It is an explicit readiness probe, not an idle-liveness
probe: polling it can keep a future auto-pausing database active.

## Frontend API origin and CORS

`../docs/Assets/JS/config.js` contains the **one public** `API_BASE_URL` setting.
The empty default uses the frontend's origin. A separate API must use an exact
HTTP(S) origin, with no path, query, fragment, credentials or wildcard. All existing
API and `/uploads/` paths remain at that origin's root, even when the frontend is
under a GitHub Pages project path. Edit that setting only when a backend host has
been approved; no separate host was configured here. Never place secrets in it.

Set the API's `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s) when hosting
separately. Browser requests from other origins receive 403 before route handling.
Same-origin and clients without an Origin header continue to work; CORS is not
authentication. Bearer and Content-Type preflight is supported for GET, POST, PUT,
PATCH, DELETE and OPTIONS; cookie credentials and wildcard origins are disabled.
The same-origin comparison uses Express's protocol and Host. A future reverse
proxy must configure forwarded-origin/trust handling deliberately; do not enable
trust for arbitrary proxies without a host-specific review.

Authenticated browser requests only target the configured API origin and API/photo
paths, omit cookie credentials, and reject redirects. Returned photo URLs are
resolved through the same configuration and fetched with existing authorization.
Sign-in/dashboard navigation remains on the frontend host. The external Nominatim
address lookup is unchanged and receives no bearer token. GitHub Pages alone still
cannot execute this backend.

## Tests and verification limits

```powershell
# Inside Server; fixture-only, no real SQL connection:
npm.cmd test
```

The Node test runner uses the existing in-memory SQL helper and a fake driver for
pool lifecycle tests. It exercises real loopback HTTP handlers, bcrypt/JWT fixtures,
role/ownership restrictions, dashboard guards, lazy pooling/outage/recovery,
health/readiness, exact-origin CORS/preflight, browser API configuration and token
isolation, private photo reads and upload cleanup/signatures. Tests create and
remove fixture photos and their own temporary directories. New Functions/Blob checks
run in memory with network listeners/connections forbidden. Only the authorised SDK
declarations were added; exact versions and the audit result are below.

For a separately authorised, real-SQL check only, privately configure the four
`TEST_*` inputs and run `npm.cmd run test:sql`. **It was not run in this phase.**
It signs in existing accounts and reads their sessions; it does not create accounts
or reports. Actual T-SQL execution/collation, certificate trust, network timeouts,
native bcrypt packaging on the selected host and deployed cross-origin browser
behaviour remain unverified. See `AUTHENTICATION.md` for the account contract and
prior UI verification; no UI layout was changed in this phase.

## Azure readiness: completed and remaining

Completed: strict configurable TLS, bounded configurable pools/timeouts, lazy
retryable connection acquisition, cheap health plus SQL readiness, one frontend
API origin with token isolation, exact-origin CORS, a private local image-storage
interface and regression coverage. Server export/listener separation is retained.

`image_storage.js` exposes `saveImage(file) -> id`, `getImageStream(id)` and
`deleteImage(id)`; implementations are local disk under `Server/uploads` (default)
and private Blob storage selected explicitly with `IMAGE_STORAGE=blob`.
URLs remain `/uploads/<id>` with database owner/admin authorization. Uploads are
buffered in memory up to 5 MiB per request, checked against JPEG/PNG/GIF/WebP magic
bytes plus MIME/extension, then written only after report validation. Failed inserts
delete the new file. Signature checking is not a full image decoder, malware scan
or decompression limit. Concurrent upload memory still needs capacity/rate planning.
Cleanup failure is logged generically; disk failures or process crashes can still
need reconciliation. SQL and files are not one transaction.

The Functions adapter and Blob implementation are now covered by local fake-based
tests. Remaining: resolve audit findings and historical credential exposure (F01),
inventory the live database/photos, verify Azure plan/region/offer/costs, and
rehearse staging authorization, durability, backups and rollback after approval.
No Azure resource, deployment, real SQL change or data migration was performed.
Password reset, identity-provider migration, throttling, administrator
enrolment, polls, geofence, tracked dependencies and Git history remain out of scope.

## Azure Functions HTTP adapter

`host.json` uses format `2.0` and an empty HTTP `routePrefix`. The sole v4 HTTP
function registers `{*path}` for GET, POST, PUT, PATCH, DELETE and OPTIONS with
`authLevel: anonymous`; existing Express JWT/account/role/ownership middleware still
protects data. There are no Functions keys in the browser and no route rewrites.
`server.js` is unchanged for the standalone local listener.

`src/http-adapter.js` maps the Functions absolute URL, method, query, headers and
raw body into Node IncomingMessage/ServerResponse types with an in-memory
transport. It preserves multipart bytes, status, end-to-end headers and binary
photo data, while stripping transport framing. It never opens a network connection
or logs request headers/bodies. The scheme and Host come from the Functions URL;
arbitrary forwarded headers are not trusted.

The adapter buffers the incoming request and the complete outgoing body; it is
not end-to-end HTTP streaming. Express's 16 KiB JSON/urlencoded limit and the 5 MiB
image limit remain; multipart overhead consumes additional memory. Overall host
request/response limits, timeouts, cancellation, concurrency, memory, cold starts,
plan-specific Node support and proxy URL handling **need verification on real
Azure**. Existing SQL connection/request timeouts remain separate from host limits.
Readiness probes execute SQL and can prevent future SQL auto-pause.

`.funcignore` excludes tests, uploads, `.env`/examples, local settings/examples,
database scripts and frontend docs. Publish from `Server/` only in a later approved
phase. The frontend stays on GitHub Pages; no UI or API-origin setting was changed.

## Private Blob storage

The application does not create containers or change permissions. The operator
must provide a private container, preferably with account-level public access
disabled. Before every Blob operation, the adapter checks the container properties
and rejects public access. This is a fail-closed check, not a substitute for Azure
policy; ACL changes can race an application request.

Hosted configuration uses `AZURE_STORAGE_ACCOUNT_URL` and DefaultAzureCredential,
which can use managed identity once configured by an operator. No key/SAS/browser
storage URL is generated. A connection string is accepted only for loopback emulator
endpoints (or the development-storage shortcut with an optional loopback proxy);
remote account-key connection strings are rejected.

New Blob names are random UUIDs plus extensions selected from a fixed validated
image-type map; submitted filenames are discarded. The original magic-byte/MIME/
extension checks and size limit are shared with disk storage. Blob Content-Type is
set from the validated type. `/uploads/<id>` retains owner/admin checks, no-store
and adds `X-Content-Type-Options: nosniff` for both backends. Missing blobs retain
the existing generic missing-photo response; failed SQL inserts delete the newly
saved blob. No existing disk photos are migrated automatically when switching.
Storage outages and ambiguous upload outcomes can still require reconciliation;
SQL and Blob are not one transaction. Versions, soft-deleted objects and retention
require an operator-approved policy. Per-operation privacy checks add storage calls.

## Operator-only Functions + Azurite local run

These commands were **not executed** in this phase. They assume Node >=22,
dependencies, Azure Functions Core Tools v4 and Azurite are already installed.
Do not install global tools as part of this phase. Use isolated development data
only; no real SQL or Azure service was used for the implementation tests.

Terminal 1, for the local emulator only:

```powershell
azurite --location "$env:TEMP\civictrack-azurite" --blobHost 127.0.0.1 --queueHost 127.0.0.1 --tableHost 127.0.0.1 --silent
```

Terminal 2, from the repository root:

```powershell
Set-Location -LiteralPath .\Server
node --version
npm.cmd ci
if (-not (Test-Path -LiteralPath local.settings.json)) {
    Copy-Item -LiteralPath local.settings.json.example -Destination local.settings.json
}
notepad.exe local.settings.json
npm.cmd test
func start --port 7071
```

All template Values are placeholders, not working credentials. Set
`FUNCTIONS_WORKER_RUNTIME` to `node`. `AzureWebJobsStorage` is a Functions host
setting with no application default; use the local development-storage shortcut
for this emulator run. It is independent of `AZURE_STORAGE_CONNECTION_STRING`,
which configures report photos only. Core Tools loads `local.settings.json`; the
standalone Node listener does not. Host-injected settings override dotenv.

For local Blob verification choose `IMAGE_STORAGE=blob`, an existing **private**
emulator container, and the loopback emulator connection setting. Create that
container in the emulator using an operator's local Storage Explorer connection;
the application never creates it. Remove unused account-URL/optional placeholders.
Use only separately approved isolated development SQL settings for real manual
report flows. With SQL unconfigured, health works and readiness/sign-in remain
unavailable. Do not run the real-SQL test script in this code-only phase.

In a third terminal, after the operator has started Core Tools:

```powershell
Invoke-RestMethod -Uri http://localhost:7071/api/health
# Returns 503 until the operator configures an approved development SQL instance:
Invoke-RestMethod -Uri http://localhost:7071/api/health/ready
```

Functions uses port 7071 from `func start`; `PORT` remains the standalone listener
setting. The frontend's unchanged same-origin API setting does not automatically
point to 7071; use direct API requests for this phase. A later approved integration
will set its single API origin and matching CORS allowlist. Azurite/SDK API-version
compatibility and actual Core Tools routing remain untested here.

## Pinned SDKs and dependency audit

Public npm publication metadata checked 17 November 2026:

| Dependency | Exact version | Published | Reason |
| --- | --- | --- | --- |
| `@azure/functions` | `4.17.0` | 22 October 2026 | Stable v4 release older than 14 days; HTTP registration and request/response models. |
| `@azure/storage-blob` | `12.34.0` | 24 September 2026 | Stable release older than 14 days; private Blob client with Node >=22 floor. |
| `@azure/identity` | `4.13.1` | 20 March 2026 | Existing transitive version promoted to an exact direct dependency for DefaultAzureCredential; version retained to avoid an unrequested upgrade. Audit finding below remains. |

Sources: public registry metadata for
[@azure/functions](https://registry.npmjs.org/@azure%2Ffunctions),
[@azure/storage-blob](https://registry.npmjs.org/@azure%2Fstorage-blob) and
[@azure/identity](https://registry.npmjs.org/@azure%2Fidentity).
Only these direct SDK declarations were added. npm updated their required
transitive dependencies in the lockfile; install lifecycle scripts were disabled.

`npm.cmd audit --json` on 17 November 2026 exited 1: **6 affected packages**,
1 critical, 4 high, 1 moderate; no low/info findings. No auto-fix was run.

| Package | Severity |
| --- | --- |
| `proxy-addr` | Critical |
| `@azure/identity` | High |
| `@azure/msal-node` | High |
| `body-parser` | High |
| `multer` | High |
| `qs` | Moderate |

The audit proposed Identity 4.14.1 for its affected chain and updates for the other
packages. This phase deliberately leaves those remediations unapplied. These
findings are **deployment blockers**, even though functional regression tests pass.
Review advisories and approve targeted updates/regression checks before any rollout.

## Deploy checklist (not done yet)

- Resolve the audit findings and confirm historical secret rotation privately;
  revoke affected sessions. Never restore an exposed secret.
- Select the currently supported Functions runtime/plan, region and approved cost
  ceiling; verify limits and cold-start behaviour. Create nothing without approval.
- Configure protected app settings, Functions host storage and managed identity.
  For production report photos select Blob, omit the emulator connection string,
  and grant least-privilege Blob data access to an existing private container.
- Configure CORS with the exact GitHub Pages origin and later update its one API
  setting. Verify host-level CORS does not bypass or conflict with Express checks.
- Approve SQL access/firewall/network rules, validated TLS and least privilege.
  Verify real SQL sign-in and role/ownership regressions against staging data.
- Reconcile/copy photos and preserve their IDs before switching storage. Test
  private downloads, failed inserts, missing objects, backups and rollback.
- Configure redacted monitoring, retention, alerts, budget alert recipients and
  operational ownership; verify actual usage/costs and avoid secret-bearing logs.
