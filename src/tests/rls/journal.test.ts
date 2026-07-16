import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Daily Journal — journal_days RLS (Sprint 14 J1, migration 20260714000001).
 *
 * The journal is OWNER-ONLY (spec OQ-1): stricter than the usual org scope.
 * This suite asserts BOTH tenant isolation (org B can't touch org A's rows)
 * AND the owner-only property (a teammate in the SAME org can't read another
 * member's journal), plus the journal_append RPC concat behaviour (D8).
 *
 * Requires local Supabase running with migrations applied:
 *   npm run supabase:start && npm run db:reset && npm run test:rls
 */

const URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function createUser(email: string, orgId?: string) {
  const password = 'Test-password-1234!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const userId = data.user.id

  let resolvedOrgId = orgId
  if (!resolvedOrgId) {
    const { data: org, error: orgErr } = await admin
      .from('orgs')
      .insert({ name: `Test org ${email}`, slug: `jr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
      .select('id').single()
    if (orgErr) throw orgErr
    resolvedOrgId = (org as { id: string }).id
  }

  // handle_new_user() already created a profile — upsert to pin org + role.
  const { error: profErr } = await admin
    .from('user_profiles')
    .upsert({ id: userId, org_id: resolvedOrgId, full_name: `User ${email}`, email, role: 'platform_owner' }, { onConflict: 'id' })
  if (profErr) throw profErr

  const signIn = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: sess, error: sErr } = await signIn.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr

  const authed = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${sess.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { userId, orgId: resolvedOrgId, authed }
}

type User = Awaited<ReturnType<typeof createUser>>
let alice: User      // org A — journal owner
let mallory: User    // org B — different tenant
let sam: User        // org A — same-org teammate

const DATE = '2026-07-14'

beforeAll(async () => {
  const stamp = Date.now()
  alice = await createUser(`journal-alice-${stamp}@test.dev`)
  mallory = await createUser(`journal-mallory-${stamp}@test.dev`)
  sam = await createUser(`journal-sam-${stamp}@test.dev`, alice.orgId)
})

describe('journal_days RLS', () => {
  it('owner can create and read their own day', async () => {
    const { error } = await alice.authed.from('journal_days').insert({
      org_id: alice.orgId, user_id: alice.userId, entry_date: DATE, body: 'Alice private thoughts',
    })
    expect(error).toBeNull()

    const { data } = await alice.authed.from('journal_days').select('body').eq('entry_date', DATE)
    expect(data).toHaveLength(1)
    expect((data![0] as { body: string }).body).toBe('Alice private thoughts')
  })

  it('another org cannot read it', async () => {
    const { data } = await mallory.authed.from('journal_days').select('id').eq('entry_date', DATE)
    expect(data ?? []).toHaveLength(0)
  })

  it('a SAME-org teammate cannot read it (owner-only, OQ-1)', async () => {
    const { data } = await sam.authed.from('journal_days').select('id').eq('entry_date', DATE)
    expect(data ?? []).toHaveLength(0)
  })

  it('a same-org teammate cannot write a row AS the owner', async () => {
    const { error } = await sam.authed.from('journal_days').insert({
      org_id: alice.orgId, user_id: alice.userId, entry_date: '2026-07-15', body: 'forged',
    })
    expect(error).not.toBeNull() // WITH CHECK user_id = auth.uid() rejects
  })

  it('a same-org teammate cannot update the owner row (0 rows affected)', async () => {
    const { data } = await sam.authed
      .from('journal_days')
      .update({ body: 'defaced' })
      .eq('entry_date', DATE)
      .select('id')
    expect(data ?? []).toHaveLength(0)

    const { data: check } = await alice.authed.from('journal_days').select('body').eq('entry_date', DATE)
    expect((check![0] as { body: string }).body).toBe('Alice private thoughts')
  })

  it('teammates keep fully separate pages for the same date', async () => {
    const { error } = await sam.authed.from('journal_days').insert({
      org_id: sam.orgId, user_id: sam.userId, entry_date: DATE, body: 'Sam own page',
    })
    expect(error).toBeNull()
    const { data } = await sam.authed.from('journal_days').select('body').eq('entry_date', DATE)
    expect(data).toHaveLength(1)
    expect((data![0] as { body: string }).body).toBe('Sam own page')
  })
})

describe('journal_append RPC (D8)', () => {
  const RPC_DATE = '2026-07-16'

  it('creates the day row on first append', async () => {
    const { error } = await alice.authed.rpc('journal_append', {
      p_entry_date: RPC_DATE, p_chunk: 'first chunk',
    })
    expect(error).toBeNull()
    const { data } = await alice.authed.from('journal_days').select('body').eq('entry_date', RPC_DATE)
    expect((data![0] as { body: string }).body).toBe('first chunk')
  })

  it('concatenates on subsequent appends', async () => {
    const { error } = await alice.authed.rpc('journal_append', {
      p_entry_date: RPC_DATE, p_chunk: '\n\n**21:15** — second chunk',
    })
    expect(error).toBeNull()
    const { data } = await alice.authed.from('journal_days').select('body').eq('entry_date', RPC_DATE)
    expect((data![0] as { body: string }).body).toBe('first chunk\n\n**21:15** — second chunk')
  })

  it('lands on the CALLER\'s page only — a teammate append never touches the owner', async () => {
    const { error } = await sam.authed.rpc('journal_append', {
      p_entry_date: RPC_DATE, p_chunk: 'sam chunk',
    })
    expect(error).toBeNull()
    const { data: aliceRow } = await alice.authed.from('journal_days').select('body').eq('entry_date', RPC_DATE)
    expect((aliceRow![0] as { body: string }).body).not.toContain('sam chunk')
    const { data: samRow } = await sam.authed.from('journal_days').select('body').eq('entry_date', RPC_DATE)
    expect((samRow![0] as { body: string }).body).toBe('sam chunk')
  })
})
