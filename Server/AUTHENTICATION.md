# Shared authentication review

## SQL connection readiness

Connections are lazy and shared, with a 250 ms retry backoff after a failed connection.
An unavailable connection returns a generic 503; it never exits the application process.
`GET /api/health` is public and does not contact SQL. `GET /api/health/ready` performs
`SELECT 1` and returns 503 without driver details if SQL is unavailable.

The backend now uses PostgreSQL via `database.js`. TLS defaults to verified
encryption (`DB_SSL_MODE=require`); disabling TLS is limited to loopback development.
An optional provider CA certificate is configured with `DB_SSL_CA_FILE`.
See the [general README](../README.md#deployment-and-local-setup) for Supabase setup.
`DB_POOL_MAX` defaults to 5 connections per process; `DB_CONNECT_TIMEOUT_MS` and
`DB_REQUEST_TIMEOUT_MS` each default to 15000 ms. Positive integers override them.

The Express-served frontend is `docs/`. `Client/` is an older copy and is unchanged.
The shared page is `docs/Pages/Public/Sign-In/Sign-In.html`. The old resident,
administrator and role-selection pages redirect there, including on a GitHub Pages project path.
GitHub Pages can preview the interface; it cannot run Express or database authentication.

## Accounts and identifiers

The Supabase setup starts empty with test accounts; existing SQL Server data is not imported.
The bcrypt/JWT account contract and separate account-ID namespaces are retained.
Residents use `residents.email`; administrators can use either `administrators.employee_number`
or `administrators.email`. Each table has its own email uniqueness constraint; emails are not
unique across the tables. Both ID sequences can also contain the same number. Employee numbers
are unique within administrators, but the SQL schema does not constrain their format or exclude
values that also match an email.

`POST /api/auth/login` accepts `{ identifier, password }`. A parameterized query
looks in both tables, using case-insensitive email comparisons and exact employee-ID comparisons. It verifies
the existing bcrypt hash and requires an active record. It never uses a submitted ID or role
to create the JWT identity. No candidate or no active password match returns the same generic
401 message. If exactly one active account matches the credentials, it signs in that account.
If multiple active accounts match the same identifier and password, it returns the same generic
401 as invalid credentials, without a token or account-choice prompt. Client `role`, `id` and
`account_type` hints never narrow the lookup. The same rule applies to collisions within one
table. An existing unique alternate identifier can still be used (for example, an employee
number); otherwise the project operator must resolve the duplicate identifier/credential pair
through an authorised account-maintenance process. There is no self-service collision-resolution
flow or working password recovery yet. PostgreSQL enforces case-insensitive email uniqueness within each account table;
cross-table ambiguity remains handled by the shared sign-in flow.

The old `/api/auth/resident/login` and `/api/auth/admin/login` URLs delegate to this handler.
Their success response is now the shared `{ token, user }` format. They translate old input
field names without filtering by role. There is one browser form and one credential-verification
implementation. Only a successfully authenticated database record determines the dashboard.

## Public authentication interface

The public pages use neutral wording and expose no role selector:

- `docs/Pages/Public/Sign-In/Sign-In.html`: email or account ID and password.
- `docs/Pages/Public/Create-Account/Create-Account.html`: ordinary account registration.
- `docs/Pages/Public/Activate-Account/Activate-Account.html`: prior-authorisation account setup.
- `docs/Pages/Public/Recover-Account/Recover-Account.html`: honest unavailable state and support link.

The old sign-up and recovery URLs redirect to these pages. Account activation still calls the
existing server registration handler and requires an unregistered authorised employee record;
changing the page wording does not relax that restriction. The old browser-generated OTP demo
is no longer served from the recovery pages. Recovery sends no email and changes no password.

`docs/Assets/CSS/auth.css` shares the charcoal/yellow palette, embedded landing photograph,
responsive form layout and focus styles. `auth-interface.js` implements password visibility;
`auth-registration.js` handles both registration forms. `navigation.css` adds native cross-document
transitions to the landing page, public information/team pages, authentication and dashboards.
Browsers without that feature retain normal navigation and a short authentication-page entrance.
Reduced-motion preferences disable the entrance and transition animations. No navigation delays,
link interception or extra runtime dependencies are introduced. Public wording is not an access
control: routes/source can still reveal the account model; Express remains responsible for access.

## Session and access rules

The browser retains the existing bearer-JWT storage keys, `civictrack_token` and
`civictrack_user`. `GET /api/auth/session` verifies the JWT and reloads the active account.
Dashboard scripts load only after this succeeds; localStorage's role/name is never used
to authorize or select the dashboard. Wrong-role URLs redirect to the server-confirmed
dashboard. Missing/invalid/expired sessions clear browser state and redirect to shared sign-in.
An expiry timer, cross-tab changes and browser-history restores also recheck or end the session.
Sign-out clears this browser's session and private photo URLs. It does not revoke copies of a
bearer JWT on the server; those expire at `JWT_EXPIRES_IN` and require an active database account.

All protected API requests verify HS256 signature, expiry, allowed role and positive integer ID,
then reload that account from its own table. Missing/deactivated accounts return 401; database
outages fail closed with 503; forbidden actions return 403. Authentication responses are not cached.

| API | Resident | Administrator |
| --- | --- | --- |
| `GET /api/issues`, `GET /api/issues/:id` | Own reports | All reports |
| `POST /api/issues`, `GET /api/issues/my-history` | Own identity from verified session | Forbidden |
| `PUT /api/issues/:id` | Own pending report only | Forbidden; use status management |
| `DELETE /api/issues/:id` | Own pending report only | Any report, preserving existing permissions |
| `PATCH /api/issues/:id/status` | Forbidden | Allowed |
| Issue stats/analytics, resident lists/history, resident/project stats | Forbidden | Allowed |
| Projects, published notices/events and polls: reads | Allowed | Allowed |
| Project/notice/event/poll management | Forbidden | Existing management permissions retained |
| `POST /api/polls/:id/vote` | Allowed as own resident ID | Forbidden |
| `GET /uploads/:filename` | Only a photo attached to own report | Any attached report photo |

Report edits/deletes repeat ownership and pending-status predicates in the SQL write to handle
an intervening status update. Resident report rendering and other dynamic dashboard text are
escaped before insertion into HTML. Report photos load with authenticated fetch and blob URLs.
Only `docs/` is exposed as general static content; backend code/configuration/schema are not served.

Administrator registration still requires an existing, unregistered `authorised_employees` record;
the employee-number unique constraint and foreign key remain in force. Registration is not opened
to arbitrary role selection. The existing schema contains no automatic `is_registered` trigger;
its employee-number uniqueness still prevents a second administrator account for the same employee.
The recovery link leads to the shared unavailable state; server password reset is not implemented.

## Windows local setup

Use Node.js with npm, SQL Server with SQL authentication enabled, an accessible TCP port, and SSMS.
The existing `Database/Schema/civictrack.sql` creates `civictrack_db`; run it once on a development
instance, not on an existing populated database. This change does not require rerunning that script.
For administrators, an authorised employee record must already exist before normal registration.
The schema does not seed authorised employees or test accounts.

From the repository root, in PowerShell:

```powershell
Set-Location Server
npm.cmd ci
# Configure the ignored .env file privately; preserve any existing settings.
notepad.exe .env
npm.cmd test
npm.cmd start
```

Create `.env` only if it does not already exist. Fill in actual local values for `DB_HOST`, `DB_NAME`,
`DB_PORT`, `DB_USER`, `DB_PASSWORD`, `PORT`, `JWT_SECRET` and `JWT_EXPIRES_IN`. For a named
SQLEXPRESS instance, obtain the actual enabled TCP port from SQL Server configuration; use its
hostname and that port rather than assuming the instance listens on 1433. Use a development SQL
login with access to the existing schema and a separate, randomly generated JWT secret. Never
commit `.env` or put credentials in screenshots/logs. `.env` now resolves relative to `Server/`,
so `node Server/server.js` from the repository root also uses the same configuration.

Open `http://localhost:<PORT>/Pages/Public/Sign-In/Sign-In.html`. Use existing test accounts or
register development-only residents and authorised employees through the normal registration paths.

## Verification and current limits

`npm.cmd test` uses Node's built-in test runner, real Express HTTP handlers, bcrypt and JWT,
with an isolated database substitute. It does not open a SQL connection or require `.env`.
Checks cover account overlap, inactive/invalid credentials, signed/expired/forged sessions,
role boundaries, ownership, intervening status changes, private photos, civic-content reads,
administrator registration rejection and dashboard guards. SQL syntax, collation and actual
database behavior still require the real environment.

Browser review at 375, 768 and 1440 pixels confirmed all four public authentication layouts,
shared photograph loading, keyboard focus/password visibility, generic errors with no role choice,
fixture sign-in for both roles and sign-out. All legacy authentication URLs redirect to shared
public pages. The automated suite checks wrong-dashboard redirects and server authorization.
The existing dashboards also requested blocked external Google Fonts; the resident
dashboard has an existing relative `Hero Picture 2.jpg` request that returns 404. These do not
block the authentication checks and are outside this change's visual scope.

For opt-in **read-only** sign-in checks against existing real test accounts, add these local-only
variables to `Server/.env`: `TEST_RESIDENT_IDENTIFIER`, `TEST_RESIDENT_PASSWORD`,
`TEST_ADMIN_IDENTIFIER`, `TEST_ADMIN_PASSWORD`. Then run:

```powershell
npm.cmd run test:sql
```

It starts Express on an ephemeral loopback port, signs in both accounts, verifies `/api/auth/session`,
and closes the server/pool. It neither creates accounts nor changes report data. It prints only
role-level results, not credentials or JWTs. For full browser verification use the regular server,
sign in as each role, open the opposite dashboard URL, try report actions on development-only data,
sign out, and reopen a dashboard. Real SQL verification remains pending by the owner's choice.

For isolated browser review without SQL, `node tests/helpers/browser-preview.cjs` starts a
loopback-only fixture preview on port 4176. It is a test helper, not a deployment configuration.
