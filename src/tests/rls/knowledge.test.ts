import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Sprint 1 — Knowledge Base RLS
 *
 * Requires local Supabase running:
 *   npm run supabase:start
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

async function createUser(email: string) {
  const password = 'Test-password-1234!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  const userId = data.user.id

  // Use an isolated client for sign-in so we don't clobber the admin's
  // service-role auth state.
  const signInClient = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sess, error: sErr } = await signInClient.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  const accessToken = sess.session!.access_token

  const authed = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { userId, accessToken, authed }
}

let userA: { userId: string; authed: SupabaseClient }
let userB: { userId: string; authed: SupabaseClient }
let itemA: string
let itemB: string
const createdUserIds: string[] = []

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_TEST_SERVICE_KEY is required for RLS tests')

  const uniq = Date.now()
  const a = await createUser(`rls-a-${uniq}@test.local`)
  const b = await createUser(`rls-b-${uniq}@test.local`)
  userA = a
  userB = b
  createdUserIds.push(a.userId, b.userId)

  // Seed one item per user via service role (bypasses RLS)
  const seed = async (uid: string) => {
    const { data, error } = await admin
      .from('knowledge_items')
      .insert({ user_id: uid, body: 'seed', entity: 'personal', type: 'decision' })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }
  itemA = await seed(a.userId)
  itemB = await seed(b.userId)
})

afterAll(async () => {
  // Clean up — service role deletes cascade seeded rows
  for (const uid of createdUserIds) {
    await admin.from('knowledge_shares').delete().eq('created_by', uid)
    await admin.from('knowledge_items').delete().eq('user_id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
})

describe('knowledge_items RLS', () => {
  it('owner can read their own item', async () => {
    const { data, error } = await userA.authed
      .from('knowledge_items')
      .select('id')
      .eq('id', itemA)
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBe(itemA)
  })

  it("other user cannot read someone else's item", async () => {
    const { data } = await userA.authed
      .from('knowledge_items')
      .select('id')
      .eq('id', itemB)
    expect(data).toEqual([])
  })

  it('owner can insert an item for themselves', async () => {
    const { error } = await userA.authed
      .from('knowledge_items')
      .insert({ user_id: userA.userId, body: 'mine', entity: 'personal', type: 'strategy' })
    expect(error).toBeNull()
  })

  it("user cannot insert an item attributed to another user", async () => {
    const { error } = await userA.authed
      .from('knowledge_items')
      .insert({ user_id: userB.userId, body: 'forged', entity: 'personal', type: 'strategy' })
    expect(error).not.toBeNull()
  })

  it("user cannot update another user's item", async () => {
    const { data, error } = await userA.authed
      .from('knowledge_items')
      .update({ body: 'hacked' })
      .eq('id', itemB)
      .select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: check } = await admin
      .from('knowledge_items')
      .select('body')
      .eq('id', itemB)
      .single()
    expect(check?.body).toBe('seed')
  })

  it("user cannot delete another user's item", async () => {
    const { data } = await userA.authed
      .from('knowledge_items')
      .delete()
      .eq('id', itemB)
      .select('id')
    expect(data).toEqual([])

    const { data: check } = await admin
      .from('knowledge_items')
      .select('id')
      .eq('id', itemB)
      .single()
    expect(check?.id).toBe(itemB)
  })
})

describe('knowledge_versions RLS', () => {
  it('owner can read versions of their own item', async () => {
    await admin.from('knowledge_versions').insert({
      item_id: itemA,
      version: 1,
      body_snapshot: 'seed',
      changed_by: userA.userId,
    })
    const { data, error } = await userA.authed
      .from('knowledge_versions')
      .select('id')
      .eq('item_id', itemA)
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it("user cannot read versions of another user's item", async () => {
    await admin.from('knowledge_versions').insert({
      item_id: itemB,
      version: 1,
      body_snapshot: 'seed',
      changed_by: userB.userId,
    })
    const { data } = await userA.authed
      .from('knowledge_versions')
      .select('id')
      .eq('item_id', itemB)
    expect(data).toEqual([])
  })
})

describe('knowledge_shares RLS', () => {
  it('owner can create a share for their own item', async () => {
    const token = `tok-${Date.now()}-A`
    const { error } = await userA.authed
      .from('knowledge_shares')
      .insert({ item_id: itemA, created_by: userA.userId, share_token: token })
    expect(error).toBeNull()
  })

  it("user cannot create a share for another user's item", async () => {
    const token = `tok-${Date.now()}-forged`
    const { error } = await userA.authed
      .from('knowledge_shares')
      .insert({ item_id: itemB, created_by: userA.userId, share_token: token })
    expect(error).not.toBeNull()
  })

  it("user cannot read another user's shares", async () => {
    const token = `tok-${Date.now()}-B`
    await admin
      .from('knowledge_shares')
      .insert({ item_id: itemB, created_by: userB.userId, share_token: token })

    const { data } = await userA.authed
      .from('knowledge_shares')
      .select('id')
      .eq('share_token', token)
    expect(data).toEqual([])
  })

  it("user cannot revoke another user's share", async () => {
    const token = `tok-${Date.now()}-revoke`
    await admin
      .from('knowledge_shares')
      .insert({ item_id: itemB, created_by: userB.userId, share_token: token })

    const { data } = await userA.authed
      .from('knowledge_shares')
      .update({ revoked: true })
      .eq('share_token', token)
      .select('id')
    expect(data).toEqual([])
  })
})
