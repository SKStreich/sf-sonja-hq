import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * HQ Databases primitive — tenant isolation RLS (hq_databases / hq_db_properties
 * / hq_db_records / hq_db_entities). All four tables are org-scoped under
 * get_my_org_id() with FOR ALL policies (migration 20260621000001). This suite
 * asserts a user in org B cannot read or write org A's database or its records.
 *
 * Requires local Supabase running with migrations applied:
 *   npm run supabase:start && npm run db:reset && npm run test:rls
 *
 * Env (defaults target the local CLI):
 *   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_KEY
 */

const URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function createUserAndOrg(email: string) {
  const password = 'Test-password-1234!'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const userId = data.user.id

  const { data: org, error: orgErr } = await admin
    .from('orgs')
    .insert({ name: `Test org ${email}`, slug: `db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
    .select('id').single()
  if (orgErr) throw orgErr
  const orgId = (org as { id: string }).id

  // handle_new_user() already created a profile (role 'member', arbitrary org) —
  // upsert to pin it to this test's org + role.
  const { error: profErr } = await admin
    .from('user_profiles')
    .upsert({ id: userId, org_id: orgId, full_name: `User ${email}`, email, role: 'platform_owner' }, { onConflict: 'id' })
  if (profErr) throw profErr

  const signInClient = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: sess, error: sErr } = await signInClient.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  const accessToken = sess.session!.access_token

  const authed = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { userId, orgId, authed }
}

type User = Awaited<ReturnType<typeof createUserAndOrg>>
let userA: User
let userB: User
let dbA: string // a database owned by org A
let recordA: string // a record in org A's database
const createdUserIds: string[] = []

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_TEST_SERVICE_KEY required for RLS tests')
  const uniq = Date.now()
  userA = await createUserAndOrg(`db-a-${uniq}@test.local`)
  userB = await createUserAndOrg(`db-b-${uniq}@test.local`)
  createdUserIds.push(userA.userId, userB.userId)

  // Seed a database + one record in org A via service role (bypasses RLS).
  const { data: db, error: dbErr } = await admin
    .from('hq_databases')
    .insert({ org_id: userA.orgId, created_by: userA.userId, title: 'Org A DB' })
    .select('id').single()
  if (dbErr) throw dbErr
  dbA = (db as { id: string }).id

  const { data: rec, error: recErr } = await admin
    .from('hq_db_records')
    .insert({ database_id: dbA, position: 0, values: {} })
    .select('id').single()
  if (recErr) throw recErr
  recordA = (rec as { id: string }).id
})

afterAll(async () => {
  await admin.from('hq_databases').delete().eq('id', dbA)
  for (const uid of createdUserIds) {
    await admin.from('orgs').delete().eq('id', uid === userA.userId ? userA.orgId : userB.orgId)
    await admin.auth.admin.deleteUser(uid)
  }
})

describe('hq_databases RLS — tenant isolation', () => {
  it('org member can read their own org database', async () => {
    const { data, error } = await userA.authed
      .from('hq_databases').select('id').eq('id', dbA).single()
    expect(error).toBeNull()
    expect(data?.id).toBe(dbA)
  })

  it('a different org cannot read the database', async () => {
    const { data } = await userB.authed
      .from('hq_databases').select('id').eq('id', dbA)
    expect(data).toEqual([])
  })

  it('a different org cannot insert a database into org A', async () => {
    const { error } = await userB.authed
      .from('hq_databases')
      .insert({ org_id: userA.orgId, created_by: userB.userId, title: 'Forged' })
    expect(error).not.toBeNull()
  })

  it('a different org cannot update the database', async () => {
    const { data } = await userB.authed
      .from('hq_databases').update({ title: 'Hacked' }).eq('id', dbA).select('id')
    expect(data).toEqual([])
    const { data: check } = await admin.from('hq_databases').select('title').eq('id', dbA).single()
    expect(check?.title).toBe('Org A DB')
  })

  it('a different org cannot delete the database', async () => {
    const { data } = await userB.authed
      .from('hq_databases').delete().eq('id', dbA).select('id')
    expect(data).toEqual([])
    const { data: check } = await admin.from('hq_databases').select('id').eq('id', dbA).single()
    expect(check?.id).toBe(dbA)
  })
})

describe('hq_db_records RLS — tenant isolation', () => {
  it('org member can read records of their own database', async () => {
    const { data, error } = await userA.authed
      .from('hq_db_records').select('id').eq('database_id', dbA)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('a different org cannot read records of the database', async () => {
    const { data } = await userB.authed
      .from('hq_db_records').select('id').eq('database_id', dbA)
    expect(data).toEqual([])
  })

  it('a different org cannot insert a record into the database', async () => {
    const { error } = await userB.authed
      .from('hq_db_records').insert({ database_id: dbA, position: 99, values: {} })
    expect(error).not.toBeNull()
  })

  it('a different org cannot delete a record of the database', async () => {
    const { data } = await userB.authed
      .from('hq_db_records').delete().eq('id', recordA).select('id')
    expect(data).toEqual([])
    const { data: check } = await admin.from('hq_db_records').select('id').eq('id', recordA).single()
    expect(check?.id).toBe(recordA)
  })
})
