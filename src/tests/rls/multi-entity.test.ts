import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Sprint 12 — Multi-entity foundation (PR 1).
 * Junction tables knowledge_entry_entities + project_entities, their RLS, and
 * the transitional ADD-ONLY mirror triggers.
 *
 * Requires local Supabase running with migrations applied:
 *   npm run supabase:start && npm run test:rls
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
    .from('orgs').insert({ name: `Test org ${email}` }).select('id').single()
  if (orgErr) throw orgErr
  const orgId = (org as { id: string }).id

  const { error: profErr } = await admin
    .from('user_profiles')
    .insert({ id: userId, org_id: orgId, full_name: `User ${email}`, role: 'platform_owner' })
  if (profErr) throw profErr

  // Two entities so we can test multi-membership on projects (which FK to entities).
  const { data: ents, error: entErr } = await admin
    .from('entities')
    .insert([
      { org_id: orgId, name: 'Personal', type: 'personal' },
      { org_id: orgId, name: 'SF Solutions', type: 'sf' },
    ])
    .select('id, type')
  if (entErr) throw entErr
  const personalId = (ents as any[]).find((e) => e.type === 'personal').id
  const sfId = (ents as any[]).find((e) => e.type === 'sf').id

  const signInClient = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: sess, error: sErr } = await signInClient.auth.signInWithPassword({ email, password })
  if (sErr) throw sErr
  const accessToken = sess.session!.access_token

  const authed = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { userId, orgId, personalId, sfId, authed }
}

type User = Awaited<ReturnType<typeof createUserAndOrg>>
let userA: User
let userB: User
const createdUserIds: string[] = []

beforeAll(async () => {
  if (!SERVICE) throw new Error('SUPABASE_TEST_SERVICE_KEY required for RLS tests')
  const uniq = Date.now()
  userA = await createUserAndOrg(`me-a-${uniq}@test.local`)
  userB = await createUserAndOrg(`me-b-${uniq}@test.local`)
  createdUserIds.push(userA.userId, userB.userId)
})

afterAll(async () => {
  for (const uid of createdUserIds) {
    const { data: profs } = await admin.from('user_profiles').select('org_id').eq('id', uid).single()
    const orgId = (profs as { org_id: string } | null)?.org_id
    if (orgId) {
      // Junction rows cascade from their parents' deletion.
      await admin.from('knowledge_entries').delete().eq('org_id', orgId)
      await admin.from('projects').delete().eq('org_id', orgId)
      await admin.from('entities').delete().eq('org_id', orgId)
      await admin.from('user_profiles').delete().eq('id', uid)
      await admin.from('orgs').delete().eq('id', orgId)
    }
    await admin.auth.admin.deleteUser(uid)
  }
})

async function createEntry(user: User, entity = 'personal'): Promise<string> {
  const { data, error } = await user.authed
    .from('knowledge_entries')
    .insert({ org_id: user.orgId, user_id: user.userId, kind: 'note', entity, title: 'Test entry' })
    .select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

async function createProject(user: User): Promise<string> {
  const { data, error } = await user.authed
    .from('projects')
    .insert({ org_id: user.orgId, created_by: user.userId, entity_id: user.personalId, name: 'Test project', status: 'planning', priority: 'medium' })
    .select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

describe('mirror triggers backfill the junction on create', () => {
  it('a new knowledge entry gets exactly one junction row matching its legacy entity', async () => {
    const id = await createEntry(userA, 'personal')
    const { data } = await userA.authed
      .from('knowledge_entry_entities').select('entity').eq('entry_id', id)
    const rows = (data ?? []) as any[]
    expect(rows.map((r) => r.entity)).toEqual(['personal'])
  })

  it('a new project gets exactly one project_entities row matching its legacy entity_id', async () => {
    const id = await createProject(userA)
    const { data } = await userA.authed
      .from('project_entities').select('entity_id').eq('project_id', id)
    const rows = (data ?? []) as any[]
    expect(rows.map((r) => r.entity_id)).toEqual([userA.personalId])
  })
})

describe('multi-entity membership', () => {
  it('a second entity can be added to a knowledge entry', async () => {
    const id = await createEntry(userA, 'personal')
    const { error } = await userA.authed
      .from('knowledge_entry_entities').insert({ entry_id: id, entity: 'sf', org_id: userA.orgId })
    expect(error).toBeNull()
    const { data } = await userA.authed
      .from('knowledge_entry_entities').select('entity').eq('entry_id', id)
    expect(new Set((data ?? []).map((r: any) => r.entity))).toEqual(new Set(['personal', 'sf']))
  })

  it('a second entity can be added to a project', async () => {
    const id = await createProject(userA)
    const { error } = await userA.authed
      .from('project_entities').insert({ project_id: id, entity_id: userA.sfId, org_id: userA.orgId })
    expect(error).toBeNull()
    const { data } = await userA.authed
      .from('project_entities').select('entity_id').eq('project_id', id)
    expect(new Set((data ?? []).map((r: any) => r.entity_id))).toEqual(new Set([userA.personalId, userA.sfId]))
  })

  it('ADD-ONLY trigger does not clobber a manually-added entity when the legacy column is re-touched', async () => {
    const id = await createEntry(userA, 'personal')
    await userA.authed.from('knowledge_entry_entities').insert({ entry_id: id, entity: 'sf', org_id: userA.orgId })
    // Re-touch the legacy column — trigger fires AFTER UPDATE OF entity.
    await userA.authed.from('knowledge_entries').update({ entity: 'personal' }).eq('id', id)
    const { data } = await userA.authed
      .from('knowledge_entry_entities').select('entity').eq('entry_id', id)
    expect(new Set((data ?? []).map((r: any) => r.entity))).toEqual(new Set(['personal', 'sf']))
  })
})

describe('junction RLS — visibility mirrors the parent', () => {
  it('user B cannot read user A entry junction rows', async () => {
    const id = await createEntry(userA, 'personal')
    const { data } = await userB.authed
      .from('knowledge_entry_entities').select('*').eq('entry_id', id)
    expect((data ?? []).length).toBe(0)
  })

  it('user B cannot read user A project junction rows', async () => {
    const id = await createProject(userA)
    const { data } = await userB.authed
      .from('project_entities').select('*').eq('project_id', id)
    expect((data ?? []).length).toBe(0)
  })

  it('user B cannot insert a junction row onto user A entry', async () => {
    const id = await createEntry(userA, 'personal')
    const { error } = await userB.authed
      .from('knowledge_entry_entities').insert({ entry_id: id, entity: 'sf', org_id: userB.orgId })
    expect(error).not.toBeNull()
  })
})
