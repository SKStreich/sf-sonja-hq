# DR Standard Posture — Runbook

This is the next tier above `dr-2fa-checklist.md` (DR Minimum). Standard posture adds **off-platform storage backups** so account loss or Supabase project deletion doesn't destroy uploaded files.

## What's covered by this tier

| Threat | Covered? | How |
|---|---|---|
| Account takeover (any single vendor) | ✓ | DR Minimum 2FA on Tier 1–4 accounts |
| Supabase project deletion | ✓ (storage only) | Daily R2 mirror — recover files into a fresh Supabase project |
| Storage bucket data loss | ✓ | Daily R2 mirror of `knowledge`, `vault`, `project-files` |
| Logical corruption / accidental delete in DB | ✗ | Free-tier 7-day snapshots only. DB dump cron deferred to a follow-up PR |
| Region-wide Supabase outage | partial | Restore is manual, takes ~30 min. Need a new region to be reachable |
| Vendor lock-in / migrate off Supabase | ✓ | All bucket content is in R2 in original layout |

## How it works

The Vercel cron `/api/cron/backup-buckets` runs daily at **04:00 UTC** (`vercel.json`):

1. Lists every object in each Supabase Storage bucket (`knowledge`, `vault`, `project-files`).
2. For each object, runs HEAD against Cloudflare R2 at the corresponding key. If R2 already has the object, skip.
3. For new objects, downloads from Supabase, uploads to R2.
4. Vault objects are wrapped with **AES-256-GCM** before upload using `VAULT_BACKUP_KEY`. R2 stores opaque cipherblobs.
5. `backup_state` table tracks last successful run per bucket (visible on the Connections page).

Per-run cap is `MAX_OBJECTS_PER_BUCKET_PER_RUN = 200` so a slow upload day can't time out the cron. Remainder picks up the next run via the HEAD-skip path.

### Retention

This PR does **not** delete objects from R2. An object accidentally deleted in Supabase remains in R2 indefinitely so you can restore it. R2 storage is cheap (~$0.015/GB/mo) and at projected scale (<50 GB) the cost is negligible.

Snapshot-style retention (30 daily / 12 weekly / 24 monthly) will land with the **DB-dump cron** in a follow-up PR — that's where retention windows actually matter, because each daily DB dump is a discrete file rather than an idempotent mirror.

## R2 object layout

| Source | R2 key |
|---|---|
| `knowledge/{org_id}/{user_id}/{uuid}-{name}.pdf` | `knowledge/{org_id}/{user_id}/{uuid}-{name}.pdf` |
| `vault/{org_id}/{user_id}/{uuid}-{name}.pdf` | `vault/{org_id}/{user_id}/{uuid}-{name}.pdf.enc` |
| `project-files/{project_id}/{filename}` | `project-files/{project_id}/{filename}` |

Object metadata captures the original `src-bucket`, `src-path`, and `src-content-type` for restore.

## Vault encryption layout

Each `.enc` blob in R2:

```
[ 12-byte IV ][ ciphertext ][ 16-byte GCM auth tag ]
```

Algorithm: AES-256-GCM. Key: `VAULT_BACKUP_KEY` env var (64-char hex preferred, 32-byte base64 also accepted).

**This key is the sole protection.** If you lose it, vault backups become unrecoverable. The key lives in:
- 1Password entry: "Sonja HQ — VAULT_BACKUP_KEY"
- Vercel production env

It must **not** appear in code, git history, this conversation, or any printout that isn't in a fireproof box.

## Required env vars (Vercel production scope)

| Name | Source |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare R2 dashboard, top-right |
| `R2_ACCESS_KEY_ID` | R2 API Token ("sonja-hq-backups-writer") |
| `R2_SECRET_ACCESS_KEY` | Same token, shown once |
| `R2_BUCKET_NAME` | `sonja-hq-backups` |
| `VAULT_BACKUP_KEY` | `openssl rand -hex 32` output |
| `CRON_SECRET` | Already set by the prior usage-sync cron PR |

If any of `R2_*` is missing, the cron route returns 503 cleanly without partial state changes. If `VAULT_BACKUP_KEY` is missing, same — we never want to upload vault content as plaintext.

## Restore procedure — Supabase still alive, individual object recovery

You accidentally deleted a workspace page attachment. You want it back.

1. Look up the deleted entry's `storage_path` in the `knowledge_entries` table (or check `knowledge_versions` for prior versions). Construct the R2 key (`knowledge/{storage_path}`).
2. Download from R2:
   ```sh
   AWS_ACCESS_KEY_ID=<R2_KEY> \
   AWS_SECRET_ACCESS_KEY=<R2_SECRET> \
   aws s3 cp s3://sonja-hq-backups/knowledge/{path} ./recovered.pdf \
     --endpoint-url https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com \
     --region auto
   ```
3. Re-upload to Supabase Storage at the original path via the Supabase dashboard or `supabase` CLI.
4. Re-insert/update the `knowledge_entries` row to point at it.

For vault objects: download the `.enc` blob, decrypt locally using the key from 1Password:

```js
// node decrypt-vault.mjs <input.enc> <output> <hex-key>
import { createDecipheriv } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
const blob = readFileSync(process.argv[2])
const iv = blob.subarray(0, 12)
const tag = blob.subarray(blob.length - 16)
const ct = blob.subarray(12, blob.length - 16)
const d = createDecipheriv('aes-256-gcm', Buffer.from(process.argv[4], 'hex'), iv)
d.setAuthTag(tag)
writeFileSync(process.argv[3], Buffer.concat([d.update(ct), d.final()]))
```

## Restore procedure — Supabase project lost entirely

Worst case. The Supabase project is gone (deletion, billing, account loss).

1. **Create new Supabase project.** Save the new URL + service role key.
2. **Apply migrations.** From a clean clone of `sf-sonja-hq`:
   ```sh
   supabase db push --db-url 'postgresql://...new-project...'
   ```
3. **Recreate storage buckets** via the Supabase dashboard or CLI: `knowledge`, `vault`, `project-files` with the same access policies (see `supabase/migrations/`).
4. **Bulk-restore objects from R2 to Supabase.** Walk R2 prefix-by-prefix:
   ```sh
   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
   aws s3 sync s3://sonja-hq-backups/knowledge ./tmp-knowledge \
     --endpoint-url https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com --region auto
   # then for each file: supabase storage cp ./tmp-knowledge/<path> supabase://knowledge/<path>
   ```
5. **For vault, decrypt before uploading.** Reverse the wrapping with the script above.
6. **Recover the DB.** Until the DB-dump cron lands, this depends on Supabase free-tier 7-day snapshots. If you're past 7 days, DB recovery from PITR isn't possible — workspace pages and metadata are gone, only the storage bucket contents survive.
7. **Update Vercel + DNS.** Point `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the new project. Redeploy.

Target recovery time: ~30 minutes for storage; DB recovery is the bottleneck and is why **the DB-dump cron is the immediate next priority** after this PR lands.

## Operational checks

- **Connections page** (`/dashboard/cost/connections`) shows last run per bucket. Red row = a cron run errored. Amber row = partial (cap hit; will catch up next run).
- **Cron logs** in Vercel dashboard → Cron Jobs → `/api/cron/backup-buckets`. Logs include the per-bucket result JSON.
- **R2 dashboard** → Cloudflare → R2 → `sonja-hq-backups` → Metrics shows storage used + ops/day.

## When this tier is no longer enough

Move to **Paranoid posture** when one of these is true:
- HQ holds material financial records (PITR + audit log become useful)
- Multiple humans rely on it daily (an RTO under 30 minutes matters)
- A long outage would have real business consequences

Paranoid posture adds: Supabase Pro PITR, an automated restore test (monthly), and a second R2 bucket in a different region for backup-of-backup.

## What's NOT covered by this tier — read this honestly

- **No DB backup off-platform yet.** If Supabase is lost and you're past 7 days, the database content is gone. The storage buckets survive but the `knowledge_entries.body` Markdown does not. **Don't merge anything that creates irreplaceable DB-only content (Slice 4 chat archives, code snippets) before the DB-dump cron lands.**
- **No restore test automation.** A backup you've never tried to restore is theoretical. Run the partial restore drill (recover one object end-to-end) at least once after this lands.
- **VAULT_BACKUP_KEY rotation** has no procedure yet. If the key needs rotation (suspected leak), all existing vault backups become unreadable unless you keep the old key alongside the new one for a transition window. Out of scope for v1.
