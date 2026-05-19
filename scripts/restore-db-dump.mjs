#!/usr/bin/env node
/**
 * Sonja HQ — DB dump restore helper.
 *
 * Reads a gzipped JSONL dump produced by /api/cron/db-dump and emits the
 * SQL needed to repopulate a freshly-migrated Postgres database with the
 * snapshotted rows. The schema itself comes from `supabase/migrations/`
 * (apply via `supabase db push` before running this script).
 *
 * Usage:
 *   node scripts/restore-db-dump.mjs <input.jsonl.gz> > restore.sql
 *
 * Then apply with:
 *   psql "$NEW_SUPABASE_DB_URL" -f restore.sql
 *
 * Or stream straight in:
 *   node scripts/restore-db-dump.mjs <input.jsonl.gz> | psql "$NEW_SUPABASE_DB_URL"
 *
 * What it does:
 *   - Parses the gzipped JSONL stream.
 *   - For each table, batches rows into a single INSERT statement (1000/
 *     batch by default) wrapped in a single transaction.
 *   - Disables triggers per-table during the load so foreign keys with
 *     ON INSERT triggers don't fire on partially-populated tables.
 *
 * What it does NOT do:
 *   - Restore schema (you applied migrations first).
 *   - Resolve sequence values (run `SELECT setval(...)` manually if needed).
 *   - Validate that the target schema matches the dump's schema version.
 *
 * Designed for a human-in-the-loop restore drill, not automated runs.
 */
import { readFileSync } from 'fs'
import { gunzipSync } from 'zlib'

const [, , inputPath] = process.argv
if (!inputPath) {
  console.error('Usage: node scripts/restore-db-dump.mjs <input.jsonl.gz>')
  process.exit(1)
}

const gzipped = readFileSync(inputPath)
const raw = gunzipSync(gzipped).toString('utf8')
const lines = raw.split('\n').filter(line => line.length > 0)

if (lines.length === 0) {
  console.error('Empty dump.')
  process.exit(1)
}

const meta = JSON.parse(lines[0])
if (!meta._meta) {
  console.error('First line is not a _meta record. Aborting.')
  process.exit(1)
}

const byTable = new Map()
for (let i = 1; i < lines.length; i++) {
  const row = JSON.parse(lines[i])
  const table = row._table
  if (!table) {
    console.error(`Line ${i + 1}: missing _table field`)
    continue
  }
  delete row._table
  if (!byTable.has(table)) byTable.set(table, [])
  byTable.get(table).push(row)
}

const out = []
out.push(`-- Restore from ${inputPath}`)
out.push(`-- Snapshot taken: ${meta._meta.taken_at}`)
out.push(`-- Schema version: ${meta._meta.schema_version ?? 'unknown'}`)
out.push(`-- Tables: ${meta._meta.tables.length}`)
out.push(`-- Rows: ${lines.length - 1}`)
out.push('')
out.push('BEGIN;')
out.push('SET session_replication_role = replica;  -- skip triggers/FKs during bulk load')
out.push('')

const BATCH = 500

for (const table of meta._meta.tables) {
  const rows = byTable.get(table) ?? []
  if (rows.length === 0) {
    out.push(`-- ${table}: 0 rows, skipped`)
    continue
  }
  out.push(`-- ${table}: ${rows.length} rows`)
  const columns = Object.keys(rows[0])
  const quotedCols = columns.map(quoteIdent).join(', ')
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const values = slice.map(row =>
      `(${columns.map(c => formatValue(row[c])).join(', ')})`
    )
    out.push(`INSERT INTO ${quoteIdent(table)} (${quotedCols}) VALUES`)
    out.push(values.join(',\n') + ' ON CONFLICT DO NOTHING;')
    out.push('')
  }
}

out.push('SET session_replication_role = origin;')
out.push('COMMIT;')
out.push('')
out.push('-- Done. You may want to run:')
out.push('--   ANALYZE;')
out.push('-- And re-sync any serial sequences if rows used non-default IDs.')

process.stdout.write(out.join('\n'))

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

function formatValue(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'NULL'
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (Array.isArray(v) || typeof v === 'object') {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  }
  return `'${String(v).replace(/'/g, "''")}'`
}
