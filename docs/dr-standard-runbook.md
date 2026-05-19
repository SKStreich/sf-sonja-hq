# DR Standard Posture — Runbook

This is the next tier above `dr-2fa-checklist.md` (DR Minimum). Standard posture adds **off-platform storage backups** so account loss or Supabase project deletion doesn't destroy uploaded files.

## What's covered by this tier

| Threat | Covered? | How |
|---|---|---|
| Account takeover (any single vendor) | ✓ | DR Minimum 2FA on Tier 1–4 accounts |
| Supabase project deletion | ✓ | Daily R2 mirror (files) + daily JSONL dump (DB rows) |
| Storage bucket data loss | ✓ | Daily R2 mirror of `knowledge`, `vault`, `project-files` |
| Logical corruption / accidental delete in DB | ✓ (≤24h RPO) | Daily JSONL dump in R2 with 30/12/24 retention |
| Region-wide Supabase outage | partial | Restore is manual, takes ~30 min. Need a new region to be reachable |
| Vendor lock-in / migrate off Supabase | ✓ | Bucket content + DB rows are in R2 in portable formats |

## How it works

Two Vercel crons run daily, both writing to the same R2 bucket (`sonja-hq-backups`).

### Bucket mirror — `/api/cron/backup-buckets` at 04:00 UTC

1. Lists every object in each Supabase Storage bucket (`knowledge`, `vault`, `project-files`).
2. For each object, runs HEAD against Cloudflare R2 at the corresponding key. If R2 already has the object, skip.
3. For new objects, downloads from Supabase, uploads to R2.
4. Vault objects are wrapped with **AES-256-GCM** before upload using `VAULT_BACKUP_KEY`. R2 stores opaque cipherblobs.
5. `backup_state` table tracks last successful run per bucket (visible on the Connections page).

Per-run cap is `MAX_OBJECTS_PER_BUCKET_PER_RUN = 200` so a slow upload day can't time out the cron. Remainder picks up the next run via the HEAD-skip path.

### DB dump — `/api/cron/db-dump` at 05:00 UTC

1. Lists every public table via the `__backup_list_tables()` SECURITY DEFINER RPC.
2. Pages each table via the service-role admin client (1000 rows/page) and writes rows as JSONL into an in-memory buffer.
3. Gzips the result, uploads to R2 at `db-dumps/daily/{YYYY-MM-DD}.jsonl.gz`.
4. Lists the existing `db-dumps/daily/` prefix and applies the 30 daily / 12 weekly / 24 monthly retention policy. Deletes anything that doesn't claim a slot.
5. Writes outcome (tables, rows, gzipped bytes, retention kept/pruned, dump key) to `backup_state.last_run_details` for the `'db-dump'` row.

Schema is not in the dump — restore assumes the target DB has had `supabase/migrations/` applied first. The `vault.body` cipher content lives in Storage and is mirrored by the bucket cron, not the dump.

### Retention

**Storage buckets:** mirror is non-deleting. An object accidentally deleted in Supabase remains in R2 indefinitely so you can restore it. R2 storage is cheap (~$0.015/GB/mo) and at projected scale (<50 GB) the cost is negligible.

**DB dumps:** snapshot-style retention runs at the end of every dump:

| Slot | Count | What it keeps |
|---|---|---|
| Daily | 30 most recent | Every day's dump, up to 30 days back |
| Weekly | 12 most recent | Newest dump in each of the 12 prior ISO weeks (i.e. dumps older than 30 days; one per week) |
| Monthly | 24 most recent | Newest dump in each of the 24 prior calendar months (older than the weekly window) |

So at steady state R2 holds up to 30 + 12 + 24 = 66 DB dump objects at any one time. Newest-first walk means today's dump always lands in the daily slot.

## R2 object layout

| Source | R2 key |
|---|---|
| `knowledge/{org_id}/{user_id}/{uuid}-{name}.pdf` | `knowledge/{org_id}/{user_id}/{uuid}-{name}.pdf` |
| `vault/{org_id}/{user_id}/{uuid}-{name}.pdf` | `vault/{org_id}/{user_id}/{uuid}-{name}.pdf.enc` |
| `project-files/{project_id}/{filename}` | `project-files/{project_id}/{filename}` |
| Daily DB dump | `db-dumps/daily/{YYYY-MM-DD}.jsonl.gz` |

Object metadata captures the original `src-bucket`, `src-path`, and `src-content-type` for restore. DB dump objects carry `taken-at`, `schema-version`, `tables`, and `rows` metadata so a human inspecting R2 can see what's inside without downloading.

## DB dump format

Each `db-dumps/daily/{date}.jsonl.gz` is a gzipped newline-delimited JSON file:

```
{"_meta": {"taken_at": "...", "schema_version": "20260518000001", "tables": [...], "format_version": 1}}
{"_table": "tasks", "id": "...", "title": "...", ...}
{"_table": "tasks", "id": "...", ...}
{"_table": "projects", "id": "...", ...}
...
```

One `_meta` record at line 0, then one row per line tagged with its source table. Tables are processed in alphabetical order. The `backup_state` table is excluded (it churns every run). `vault.body` content is NOT in the dump — vault uploads live in Storage and are mirrored separately (the encrypted blob is in R2 under `vault/...enc`). The dump only contains the `knowledge_entries` metadata rows referencing those blobs.

Schema is NOT in the dump. The dump assumes a target DB has had `supabase/migrations/` applied in order. The `_meta.schema_version` field records the latest migration filename at dump time.

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

| Name | Source | Used by |
|---|---|---|
| `R2_ACCOUNT_ID` | Cloudflare R2 dashboard, top-right | both crons |
| `R2_ACCESS_KEY_ID` | R2 API Token ("sonja-hq-backups-writer") | both crons |
| `R2_SECRET_ACCESS_KEY` | Same token, shown once | both crons |
| `R2_BUCKET_NAME` | `sonja-hq-backups` | both crons |
| `VAULT_BACKUP_KEY` | `openssl rand -hex 32` output | bucket cron only |
| `CRON_SECRET` | Already set by the prior usage-sync cron PR | both crons |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings | DB-dump cron (reused) |

The DB-dump cron does **not** introduce any new env vars — it reuses the existing service-role client to query rows, and the existing R2 client to upload the dump. The R2 API token used for bucket writes already has list/delete scope on the bucket, which is needed for the retention pass.

If any of `R2_*` is missing, both cron routes return 503 cleanly without partial state changes. If `VAULT_BACKUP_KEY` is missing, the bucket cron returns 503; the DB-dump cron is unaffected.

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

1. **Create new Supabase project.** Save the new URL + service role key + Postgres connection string.
2. **Apply migrations.** From a clean clone of `sf-sonja-hq`:
   ```sh
   supabase db push --db-url 'postgresql://...new-project...'
   ```
3. **Recreate storage buckets** via the Supabase dashboard or CLI: `knowledge`, `vault`, `project-files` with the same access policies (see `supabase/migrations/`).
4. **Restore DB rows from the latest dump.**
   ```sh
   # Find the newest dump in R2.
   aws s3 ls s3://sonja-hq-backups/db-dumps/daily/ \
     --endpoint-url https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com --region auto | tail
   # Download it.
   aws s3 cp s3://sonja-hq-backups/db-dumps/daily/{date}.jsonl.gz ./latest.jsonl.gz \
     --endpoint-url https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com --region auto
   # Regenerate SQL + apply.
   node scripts/restore-db-dump.mjs ./latest.jsonl.gz | psql "$NEW_DB_URL"
   ```
   The restore script wraps everything in a transaction, disables triggers during the load (so foreign-key insertion order doesn't matter), and uses `ON CONFLICT DO NOTHING` so re-running is safe. Sequence values are NOT reset — run `SELECT setval(...)` manually if you use serial IDs (HQ doesn't; everything is UUID).
5. **Bulk-restore objects from R2 to Supabase Storage.** Walk R2 prefix-by-prefix:
   ```sh
   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
   aws s3 sync s3://sonja-hq-backups/knowledge ./tmp-knowledge \
     --endpoint-url https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com --region auto
   # then for each file: supabase storage cp ./tmp-knowledge/<path> supabase://knowledge/<path>
   ```
6. **For vault, decrypt before uploading.** Reverse the wrapping with the script under "Restore — individual object" above.
7. **Update Vercel + DNS.** Point `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the new project. Redeploy.

Target recovery time:
- ~5 min for DB rows (a single gzipped dump, INSERTs in a single transaction)
- ~30 min for storage (rate-limited by R2 ↔ Supabase Storage transfer)

RPO (recovery-point objective): up to **24 hours** for DB rows (one dump per day at 05:00 UTC). Storage objects have effectively 0 RPO once mirrored (HEAD-skip means objects added between cron runs aren't backed up, but no objects are deleted by the cron).

## Operational checks

- **Connections page** (`/dashboard/cost/connections`) shows last run per bucket + the DB dump row with tables/rows/bytes/retention counts. Red row = a cron run errored. Amber row = partial (cap hit; will catch up next run).
- **Cron logs** in Vercel dashboard → Cron Jobs → `/api/cron/backup-buckets` and `/api/cron/db-dump`. Logs include the per-bucket result JSON / dump summary.
- **R2 dashboard** → Cloudflare → R2 → `sonja-hq-backups` → Metrics shows storage used + ops/day. `db-dumps/daily/` should hover around 30–66 objects at steady state.

## When this tier is no longer enough

Move to **Paranoid posture** when one of these is true:
- HQ holds material financial records (PITR + audit log become useful)
- Multiple humans rely on it daily (an RTO under 30 minutes matters)
- A long outage would have real business consequences

Paranoid posture adds: Supabase Pro PITR, an automated restore test (monthly), and a second R2 bucket in a different region for backup-of-backup.

## What's NOT covered by this tier — read this honestly

- **24-hour RPO for DB rows.** A logical delete that happens between cron runs is gone (unless caught within the Supabase free-tier 7-day PITR window). Pro tier PITR closes this gap if you ever upgrade.
- **No restore test automation.** A backup you've never tried to restore is theoretical. Run the partial restore drill (recover one object end-to-end + restore one dump into a scratch DB) at least once after this lands.
- **VAULT_BACKUP_KEY rotation** has no procedure yet. If the key needs rotation (suspected leak), all existing vault backups become unreadable unless you keep the old key alongside the new one for a transition window. Out of scope for v1.
- **Sequences and identity columns** aren't restored. HQ uses UUIDs everywhere so this doesn't bite us today, but if a future table uses `bigserial`, a restore would need a manual `setval` pass.
- **Schema drift between dump and target.** The dump records `_meta.schema_version` (latest migration filename) but doesn't enforce it. If you apply migrations from a different git revision than the dump was taken against, columns may be missing or extra. Restore script uses `ON CONFLICT DO NOTHING` which masks some mismatches but not all.
