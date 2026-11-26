# CivicTrack — City of Joburg

> A civic engagement web platform empowering City of Joburg residents to report municipal issues and track infrastructure development across the region.

---

##  Overview

**CivicTrack** is a web application built exclusively for residents of the **City of Joburg** municipality. The platform bridges the gap between residents and the city by providing a centralised space to:

- **Report** civic and municipal issues in your area
- **Track** ongoing maintenance work and new development projects across the region
- **Stay informed** on what's happening in your neighbourhood and beyond

> This platform is geo-restricted to the City of Joburg municipal boundary. Submissions or access attempts from outside the region are automatically filtered by the system.

---

## Features

### Issue Reporting
Residents can log civic and municipal issues such as:
- Potholes and road damage
- Water and electricity outages
- Illegal dumping and waste management
- Broken streetlights and traffic signals
- Sewage and drainage problems

### Project & Maintenance Tracker
Residents can view and follow:
- Active road and infrastructure maintenance
- New development projects in their ward or suburb
- Status updates on ongoing city projects

### Geo-Restriction
The system restricts access or submissions to within the **City of Joburg** municipal boundary, ensuring all data remains relevant and region-specific.

---

## Tech Stack

Local setup is documented below. See also the [authentication review](Server/AUTHENTICATION.md) and [Render deployment notes](Server/RENDER.md).

| Layer | Technology |
|---|---|
| **Frontend** | HTML, CSS, JavaScript |
| **Backend** | Node.js, Express.js |
| **Database** | Supabase PostgreSQL |
| **API** | RESTful API via Node Express |

---

## Geo-Restriction

CivicTrack is designed exclusively for **City of Joburg** residents. The system uses location-based filtering to verify that users and submitted reports fall within the official CoJ municipal boundary. Any activity detected outside this boundary is automatically restricted.

<p align="center">Built for the people of <strong>Johannesburg</strong></p>


## Deployment and local setup

The frontend is published through [GitHub Pages](https://lesleylebelo.github.io/City-Of-Joburg-CivicTracker/).
The [Express API](https://civictrack-api-staging.onrender.com) runs on Render Free;
Supabase hosts PostgreSQL and private report photos. Resident and administrator
sign-in and photo access were confirmed through Pages, including photo persistence
after a Render redeployment. Free instances can take time to wake after inactivity.

The current frontend is in `docs/`; `Client/` is an older copy.
Use Node.js 22 or later. From the repository root:

```powershell
npm.cmd --prefix Server ci
npm.cmd --prefix Server start
```

Open http://localhost:3000. Express loads the ignored `Server/.env`.
If that file does not exist, copy `Server/.env.example` and configure it privately.
Never overwrite an existing environment file or commit passwords, signing keys,
test credentials or Storage secret keys. Local and Render-served pages use their
own API origin; GitHub Pages uses the configured Render API.

For a new database only, review and apply
`Server/Database/Postgres/001_schema.sql`, then
`Server/Database/Postgres/002_server_permissions.sql`.
Use the restricted `civictrack_app` login with verified TLS and connection
settings from the selected Supabase project's Connect dialog. Do not rerun setup
or seed commands against the deployed database without inspecting existing data.
Test employees require an operator approval; the application cannot grant it.

Run offline tests with `npm.cmd --prefix Server test`.
The hosted check `npm.cmd --prefix Server run test:sql` requires privately
configured test credentials. Explicit test-account seeding uses
`npm.cmd --prefix Server run seed:test` only against an approved isolated database.
See [Render deployment notes](Server/RENDER.md) for staging configuration and checks.

### Environment settings

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

### Verified database TLS

`Server/certs/supabase-prod-ca-2021.crt` is a public CA certificate, not a
private key. It was downloaded on 22 November 2026 from
[Supabase's certificate endpoint](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).
Its subject is Supabase Root 2021 CA, Supabase Inc.; SHA-256 fingerprint:

`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

`DB_SSL_CA_FILE` resolves relative to `Server/`. Keep certificate-chain and
hostname verification enabled. Obtain replacements from the official provider.

### Map sources and third-party attribution

The municipal boundary and seven regions were retrieved on 16 November 2026
from the City of Johannesburg GIS [CITY layer](https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer/0)
and [REGION layer](https://ags.joburg.org.za/server/rest/services/FeatureServices/CGIS_CORE_DATA/FeatureServer/1).
The retrieval date is not a legal boundary revision date. GeoJSON uses WGS84,
`CITY_ID=COJ`; refresh via each layer's `/query` endpoint with
`where=CITY_ID='COJ'`, `outFields=*`, `outSR=4326`, `f=geojson`.
Then rebuild and verify the SVG fallback:

```powershell
node scripts/build-johannesburg-map.cjs
node scripts/build-johannesburg-map.cjs --check
```

The interactive map clips OpenStreetMap tiles to the municipal polygon. Internet
access is required; it does not display live reports or enforce backend location
authorization. Retain [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)
and comply with its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
Leaflet 1.9.4 was vendored unmodified from unpkg on 16 November 2026; its
[BSD-2-Clause licence](docs/Assets/Vendor/leaflet/LICENSE) remains included.
