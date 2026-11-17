# CivicTrack backend

Express serves the API and the current `../docs/` frontend. `server.js` loads
`Server/.env` and listens locally; `app.js` exports the Express app without listening.
The old `Client/` frontend is outside this work.

## Runtime prerequisites

The checked-in dependency tree declares a minimum of **Node 20.0.0**: Express
5.2.1 needs >=18, mssql 12.5.4 >=18.19, tedious 19.2.1 >=18.17 and bcrypt 6 >=18,
but the transitive Azure core/identity packages and typespec HTTP runtime need >=20.
All declared dependency engine ranges in `package-lock.json` accept 20.0.0.
The Functions adapter phase raises `package.json` to `node >=22` for the supported
Functions runtime family. The dependency floor remains 20; the application floor
is now 22. This is a compatibility floor,
**not a production runtime selection or lifecycle recommendation**. Confirm the
chosen host's current supported Node LTS list before deploying. Fixture tests for
this change ran on local Node 24.19.0, not on every version allowed by `engines`.

For real application use, provide SQL Server with SQL authentication, TCP enabled,
a known reachable hostname/port, the CivicTrack schema and a suitable application
login. SSMS is useful for operator-managed setup. Named SQLEXPRESS instances can use
dynamic ports; do not assume port 1433. For a new development database only, inspect
`Database/Schema/civictrack.sql` and apply it through SSMS. It is not an idempotent
migration for populated databases. This readiness work requires no schema change.
Existing bcrypt hashes and IDs remain unchanged. Administrator registration still
requires an existing authorised employee record; the schema seeds no test accounts.

## Windows PowerShell local run

From the repository root (commands for the operator; no installation or real SQL
verification was performed in this phase):

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
remove fixture photos and their own temporary directories. No dependency was added.

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
`deleteImage(id)`; the only implementation is local disk under `Server/uploads`.
URLs remain `/uploads/<id>` with database owner/admin authorization. Uploads are
buffered in memory up to 5 MiB per request, checked against JPEG/PNG/GIF/WebP magic
bytes plus MIME/extension, then written only after report validation. Failed inserts
delete the new file. Signature checking is not a full image decoder, malware scan
or decompression limit. Concurrent upload memory still needs capacity/rate planning.
Cleanup failure is logged generically; disk failures or process crashes can still
need reconciliation. SQL and files are not one transaction.

Remaining: privately resolve historical credential exposure (assessment F01),
inventory the live database/photos, verify current Azure runtime/region/offer/costs,
choose and test a hosting adapter, implement durable private Blob storage, and
rehearse an isolated staging migration with authorization/backup/rollback checks.
No Azure resource, SDK, hosting manifest, live SQL change or data migration was
created. Password reset, identity-provider migration, throttling, administrator
enrolment, polls, geofence, tracked dependencies and Git history remain out of scope.
