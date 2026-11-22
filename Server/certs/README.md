# Supabase PostgreSQL CA

`supabase-prod-ca-2021.crt` is a public CA certificate, not a private key.
Downloaded on 2026-11-22 from the production URL used by Supabase's dashboard:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The URL template was verified in Supabase's official source:
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json

Subject: `Supabase Root 2021 CA`, Supabase Inc.
SHA-256 fingerprint:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

The ignored local `.env` references this certificate through `DB_SSL_CA_FILE`.
Certificate-chain and hostname verification remain enabled. Obtain replacements
from Supabase's official dashboard/download source, never from an unverified
database connection. This certificate must not be used to disable verification.
