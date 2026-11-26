# Render Free staging

Use GitHub Pages for the existing static frontend, Render Free for Express, and
the existing Supabase test project for PostgreSQL and private report photos.
This is a student-project staging deployment, not an always-available municipal
service. Render Free sleeps after 15 minutes idle; waking can take about a minute.
Files on its disk disappear on restarts, redeploys and spin-down. Free usage quotas
still apply. No paid disk, Render database or plan upgrade is needed by this setup.

## Staging verification - 2026-11-26

- Render Free service `civictrack-api-staging` is live at
  https://civictrack-api-staging.onrender.com, deployed from `c88707c`.
- Public HTTPS checks returned 200 for health, readiness and the shared sign-in
  page. Readiness covers PostgreSQL and the configured private image bucket.
- CORS preflight allowed `https://lesleylebelo.github.io` and rejected an
  unrelated origin with 403 and no allow-origin header.
- The operator confirmed resident and administrator sign-in and confirmed the
  same uploaded report photo remained readable after a manual redeployment.
  These browser and persistence checks are operator-reported.
- The public configuration now routes only the GitHub Pages origin to Render;
  local Express and Render-served pages retain same-origin API requests.
- After Pages publishes this change, verify both sign-ins and authorised photo
  access from the Pages URL. Browser sessions are separate between origins.
- Credential rotation is not confirmed by these deployment checks. IDE-selected
  passwords have been exposed; rotate the affected credential privately and keep
  database-role and Render settings consistent if the database password changes.

## Historical preparation status — 2026-11-22

The deployment files and storage adapter are prepared for staging. All 94 local
tests pass, including private Storage contract tests, bounded streaming, readiness
failure/recovery, one-proxy HTTPS CORS and launch-directory-independent CA loading.
No dependencies were added or upgraded for this preparation.

Hosted migration `20261122205340` (`civictrack_003_private_image_bucket`) was applied
and its private flag, 5242880-byte limit and four image MIME types verified. No
Storage object policies existed when inspected; no public policy was added.
No existing images were transferred or deleted. The backend Storage secret key is
configured privately. Real Express/PostgreSQL sign-ins and authorization checks
passed with the hosted bucket, including a synthetic upload, byte-exact owner/admin
downloads, unrelated-resident/anonymous denial, public-object URL denial, fresh
adapter persistence and object deletion. Disposable records and the object were
removed, leaving the original one resident, one administrator and zero reports.
Persistence across an actual Render restart/redeployment remains unverified.

Repeat explicitly against the approved test project only:

```powershell
cd Server
node tests/sql-authorization.cjs --disposable-test-data --supabase-images
```

This mode requires the exact project/bucket configuration and an initial database
containing only the two approved test accounts and no reports. It stops if that
baseline differs; inspect fixture state before retrying a failed run.

Both test-account passwords were rotated privately and real sign-in/session checks
passed afterwards. The offline SQL/readiness suites explicitly select local image
fixtures, so a developer's hosted Storage configuration cannot change their results.
The refreshed dependency audit reports zero vulnerabilities; current private
credential values were absent from the publishable-file scan.

Render is not connected through tools in this session; the operator has signed in
to its dashboard. No service or paid resource has been created. Publishing this
staging branch does not change the Pages branch. Blueprint validation by Render and the
Linux build/startup check remain pending. GitHub Pages configuration is unchanged.

## Prepared configuration

The repository-root `render.yaml` specifies:

- Name: `civictrack-api-staging`; runtime Node; plan `free`.
- Region: Frankfurt, an available European region near the Ireland database.
- Branch: `azure-functions-adapter`, preserving the currently published `main`.
- Node `24.19.0`, matching local validation; production dependencies only.
- Build: `npm --prefix Server ci --omit=dev --ignore-scripts --no-audit --fund=false`.
- Start: `npm --prefix Server start`; Render supplies `PORT`.
- Health check: `/api/health/ready` verifies PostgreSQL and private image storage.
- Automatic deployment disabled. Never set the root directory to `Server`: the
  full checkout is needed for Express's `../docs` static preview.
- CORS allows the exact `https://lesleylebelo.github.io` origin. The project path
  is not part of an Origin. Express trusts one ingress proxy in production so
  same-origin HTTPS previews work through Render's proxy.

The database CA is included as a public certificate; relative `DB_SSL_CA_FILE`
paths resolve from `Server`, independent of the shell's working directory.
The Blueprint uses the dedicated application login, never the database owner.
It generates a separate JWT signing key for Render instead of copying the local
key. Existing local JWT sessions do not become staging sessions automatically.

## Before publishing any branch

1. Resolve any password exposed through IDE selection/chat context. Privately
   rotate the affected account/database password and update `.env` consistently.
   Historical credential/key revocations elsewhere remain operator-confirmation
   items. Do not copy an exposed credential into Render.
2. Inspect existing buckets and Storage object policies before applying
   `Database/Postgres/003_private_image_bucket.sql`. It creates a **private**
   `civictrack-issue-images` bucket, a 5 MiB per-file limit, and only JPEG/PNG/GIF/WebP.
   Existing incompatible settings stop the script; it never replaces stored data.
   No public or anonymous Storage policies are needed. SQL is used only for bucket
   configuration; object bytes are uploaded/deleted through the Storage API.
3. In Supabase Project Settings > API Keys, create/select a dedicated backend
   secret key. Enter its value privately as `SUPABASE_SECRET_KEY` in local `.env`.
   Keep it out of chat, screenshots, frontend files and Git. A secret key has
   elevated project-wide access, not just this bucket; only Express may hold it.
4. Add the non-secret settings privately to local `.env`:

   ```dotenv
   IMAGE_STORAGE_PROVIDER=supabase
   SUPABASE_URL=https://ogzurumjuxwrvpsewwra.supabase.co
   SUPABASE_IMAGE_BUCKET=civictrack-issue-images
   ```

5. Restart local Express after settings changes. Readiness must succeed. Verify
   a synthetic upload/download/deletion through Express, owner/admin access and
   unrelated-resident/anonymous denial, with the actual bucket. Current tests
   cover the Storage API contract with fixtures; this is not hosted Storage proof.
   `tests/sql-authorization.cjs` defaults to a temporary local image adapter;
   include `--supabase-images` for actual hosted Storage verification.
6. Review the existing uncommitted migration work and deployment changes before
   committing/pushing the staging branch. Never include `.env`, uploaded photos,
   local artifacts or old deployment archives. No push has been made for this work.

## Connect Render and create the free service

Connect the available Render integration and sign in, or use the Render Dashboard.
Check for an existing CivicTrack service before creating another. The actual
service URL and service ID must be obtained from Render, not assumed from its name.

Once the reviewed staging branch is available on GitHub, choose **New > Blueprint**,
select this repository and `azure-functions-adapter`, and review `render.yaml`.
Confirm the service is Free and no paid resources are listed before creation.
Enter only the prompted `DB_PASSWORD` and `SUPABASE_SECRET_KEY` through Render's
private environment interface. Never paste the entire local `.env`: it includes
test passwords and a local signing key, which are not deployment settings.

Blueprint creation triggers its first deploy even with automatic deployments off.
Afterwards, use manual deploys. Do not switch the live Pages API origin yet.

## Release checks before Pages integration

1. Confirm the deployment commit, Node version, successful build and healthy service.
2. Use the Render HTTPS URL for `/api/health` and `/api/health/ready`.
3. Test both existing accounts through the Express-served shared sign-in page on
   the Render URL and confirm their dashboard routing. Test signed-out/expired
   sessions, role restrictions and another resident's report access.
4. Upload a synthetic photo through Express, verify authorized bytes and denial
   for unauthorized requests, redeploy/restart, then verify the photo still works.
   Remove only these disposable fixtures. Verify the private bucket cannot serve
   the photo through a public object URL.
5. Verify CORS allows Pages and rejects an unrelated origin. Test in a frontend
   preview before changing `docs/Assets/JS/config.js` to the exact verified HTTPS
   API origin. Never put passwords, a secret key or signing key in that file.
6. Keep rollback to the previous Pages commit available. Review/approve the Pages
   change separately, then verify public sign-in and private photo access again.

The app checks the bucket's private flag, size and MIME configuration before
image operations and readiness. It proxies private reads through the existing
authorized `/uploads/:filename` endpoint; it never emits public or signed Storage
URLs. Uploads use unique names without overwrite. Storage errors are generic,
redirects are refused, and production never falls back to local disk.

Remaining operational gap: report-row deletion and object deletion are separate
operations. A Storage outage after the SQL delete can leave an orphaned private
object; reconcile those failures before retrying. This migration does not import
old report photos or implement a background orphan-cleanup job.

Sources: [Render Free](https://render.com/docs/free),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets),
[Supabase API keys](https://supabase.com/docs/guides/api/api-keys).
