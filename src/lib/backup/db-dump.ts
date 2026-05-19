/**
 * DB-dump helpers — produces a gzipped JSONL snapshot of every public table.
 *
 * Approach: walk the table list returned by the service-role-only RPC
 * `__backup_list_tables()`, page each table with the existing Supabase
 * admin client (1000 rows/page via PostgREST's `range`), and stream rows
 * into a gzipped JSONL buffer.
 *
 * Why supabase-js, not pg (node-postgres):
 *   - Already in deps; no new dependency for a tiny PR
 *   - Reuses the same auth path as the rest of the app (service role
 *     bypasses RLS so we see every row)
 *   - Tables are small (single-user HQ at the moment); pagination overhead
 *     is negligible
 *   - Avoids a second connection-pool vector in serverless
 *
 * JSONL format (one JSON object per line):
 *   line 0: { "_meta": { ... } }
 *   line 1..N: { "_table": "tasks", ...row columns }
 *
 * Restore is a node script (scripts/restore-db-dump.mjs) — see runbook.
 */
import { gzipSync } from 'zlib'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

export interface DbDumpResult {
  gzipped: Buffer
  tables: string[]
  totalRows: number
  perTable: Record<string, number>
  /** Latest committed migration filename — restored DBs need this schema. */
  schemaVersion: string | null
  takenAt: string
}

/** Tables we never dump (managed by Supabase or holding ephemeral state). */
const SKIP_TABLES = new Set<string>([
  // No skips today, but this is the seam — Supabase doesn't put system
  // tables in `public`, so the list-RPC already filters by `schemaname`.
])

const PAGE_SIZE = 1000

/**
 * Lists every public table via the RPC, then dumps each one as JSONL.
 * Returns the gzipped buffer + summary stats for backup_state.
 *
 * `schemaVersion` is the latest migration filename, pulled from the
 * `supabase_migrations.schema_migrations` table if available — captures
 * which schema the dump assumes. Falls back to null on environments where
 * the migrations table isn't exposed.
 */
export async function dumpAllTables(admin: Admin): Promise<DbDumpResult> {
  const takenAt = new Date().toISOString()
  const schemaVersion = await getSchemaVersion(admin)
  const tables = await listTables(admin)

  const perTable: Record<string, number> = {}
  // We assemble JSONL in-memory because Supabase serverless functions
  // don't expose streaming gzip + R2 PUT in one operation cleanly, and
  // the dump is small enough (target <50 MB raw / <10 MB gzipped) that
  // a single buffer is fine.
  const lines: string[] = []
  lines.push(JSON.stringify({
    _meta: {
      taken_at: takenAt,
      schema_version: schemaVersion,
      tables,
      format_version: 1,
    },
  }))

  let totalRows = 0
  for (const table of tables) {
    if (SKIP_TABLES.has(table)) continue
    let from = 0
    for (;;) {
      const { data, error } = await (admin as any)
        .from(table)
        .select('*')
        .range(from, from + PAGE_SIZE - 1)
      if (error) {
        throw new Error(`dump ${table} failed at offset ${from}: ${error.message}`)
      }
      const rows = (data ?? []) as Array<Record<string, unknown>>
      for (const row of rows) {
        lines.push(JSON.stringify({ _table: table, ...row }))
      }
      perTable[table] = (perTable[table] ?? 0) + rows.length
      totalRows += rows.length
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  const raw = Buffer.from(lines.join('\n'), 'utf8')
  const gzipped = gzipSync(raw, { level: 9 })
  return { gzipped, tables, totalRows, perTable, schemaVersion, takenAt }
}

async function listTables(admin: Admin): Promise<string[]> {
  const { data, error } = await (admin as any).rpc('__backup_list_tables')
  if (error) {
    throw new Error(`__backup_list_tables failed: ${error.message}`)
  }
  type Row = { table_name: string; est_rows: number }
  const rows = (data ?? []) as Row[]
  // Exclude backup_state itself — it churns every cron run and the dump
  // would race against the row we're about to write.
  return rows.map(r => r.table_name).filter(t => t !== 'backup_state')
}

async function getSchemaVersion(admin: Admin): Promise<string | null> {
  // `supabase_migrations.schema_migrations` is in a separate schema and
  // not in the generated types. Catch any failure and return null —
  // schema version is metadata, not critical for restore (migrations in
  // git are the source of truth).
  try {
    const { data, error } = await (admin as any)
      .schema('supabase_migrations')
      .from('schema_migrations')
      .select('version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return (data as { version: string }).version
  } catch {
    return null
  }
}
