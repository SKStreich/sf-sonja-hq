import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock (mirrors knowledge-detail.test.ts) ──────────────────────────

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

type Resp = { data?: any; error?: any }

function makeChain(responses: {
  default?: Resp
  single?: Resp
  maybeSingle?: Resp
  onInsert?: (payload: any) => void
  onDelete?: () => void
} = {}): any {
  const chain: any = {}
  const methods = ['select', 'eq', 'neq', 'in', 'order', 'limit', 'update', 'or', 'gte', 'ilike', 'not']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.insert = vi.fn((payload: any) => { responses.onInsert?.(payload); return chain })
  chain.delete = vi.fn(() => { responses.onDelete?.(); return chain })
  const def: Resp = responses.default ?? { data: null, error: null }
  chain.single = vi.fn().mockResolvedValue(responses.single ?? def)
  chain.maybeSingle = vi.fn().mockResolvedValue(responses.maybeSingle ?? def)
  chain.then = (resolve: any, reject?: any) => Promise.resolve(def).then(resolve, reject)
  return chain
}

function setupTables(tables: Record<string, any>) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const cfg = tables[table]
    if (!cfg) return makeChain()
    if ('data' in cfg || 'error' in cfg) {
      return makeChain({ default: cfg as Resp, single: cfg as Resp, maybeSingle: cfg as Resp })
    }
    return makeChain(cfg)
  })
}

const PROFILE_OK = { user_profiles: { single: { data: MOCK_PROFILE, error: null } } }

import {
  searchAttachableEntries,
  attachEntryToProject,
  detachEntry,
  getProjectAttachments,
  getEntryAttachments,
} from '@/app/api/knowledge/links'

beforeEach(() => { vi.clearAllMocks() })

// ── searchAttachableEntries ───────────────────────────────────────────────────

describe('searchAttachableEntries', () => {
  it('maps rows and flags vault entries', async () => {
    const rows = [
      { id: 'e1', title: 'Cash Exposure Spec', kind: 'doc', entity: 'sf', access: 'standard' },
      { id: 'e2', title: 'Secret', kind: 'doc', entity: 'sf', access: 'vault' },
    ]
    setupTables({ ...PROFILE_OK, knowledge_entries: { default: { data: rows, error: null } } })
    const out = await searchAttachableEntries('cash')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: 'e1', title: 'Cash Exposure Spec', vault: false })
    expect(out[1].vault).toBe(true) // vault entries ARE returned (OQ6)
    expect(mockFrom).toHaveBeenCalledWith('knowledge_entries')
  })

  it('returns [] when no rows', async () => {
    setupTables({ ...PROFILE_OK, knowledge_entries: { default: { data: null, error: null } } })
    expect(await searchAttachableEntries('zzz')).toEqual([])
  })
})

// ── attachEntryToProject ──────────────────────────────────────────────────────

describe('attachEntryToProject', () => {
  it('inserts an attached row with the right shape', async () => {
    let payload: any = null
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') return makeChain({ maybeSingle: { data: { id: 'e1', org_id: 'org-1' }, error: null } })
      if (table === 'projects') return makeChain({ maybeSingle: { data: { id: 'p1', org_id: 'org-1' }, error: null } })
      if (table === 'knowledge_links') return makeChain({ default: { data: null, error: null }, onInsert: p => { payload = p } })
      return makeChain()
    })
    await attachEntryToProject('e1', 'p1')
    expect(payload).toMatchObject({
      from_entry: 'e1', to_entry: null, to_project: 'p1', to_task: null,
      relation: 'attached', created_by: 'user-1',
    })
  })

  it('throws when the entry is missing', async () => {
    setupTables({ ...PROFILE_OK, knowledge_entries: { maybeSingle: { data: null, error: null } } })
    await expect(attachEntryToProject('nope', 'p1')).rejects.toThrow('Entry not found')
  })

  it('throws when the entry is in a different org', async () => {
    setupTables({ ...PROFILE_OK, knowledge_entries: { maybeSingle: { data: { id: 'e1', org_id: 'other' }, error: null } } })
    await expect(attachEntryToProject('e1', 'p1')).rejects.toThrow('Entry in different org')
  })

  it('throws when the project is in a different org', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') return makeChain({ maybeSingle: { data: { id: 'e1', org_id: 'org-1' }, error: null } })
      if (table === 'projects') return makeChain({ maybeSingle: { data: { id: 'p1', org_id: 'other' }, error: null } })
      return makeChain()
    })
    await expect(attachEntryToProject('e1', 'p1')).rejects.toThrow('Project in different org')
  })

  it('swallows a duplicate-attach (23505) as a no-op', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') return makeChain({ maybeSingle: { data: { id: 'e1', org_id: 'org-1' }, error: null } })
      if (table === 'projects') return makeChain({ maybeSingle: { data: { id: 'p1', org_id: 'org-1' }, error: null } })
      if (table === 'knowledge_links') return makeChain({ default: { data: null, error: { code: '23505', message: 'dup' } } })
      return makeChain()
    })
    await expect(attachEntryToProject('e1', 'p1')).resolves.toBeUndefined()
  })

  it('throws on a non-23505 insert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') return makeChain({ maybeSingle: { data: { id: 'e1', org_id: 'org-1' }, error: null } })
      if (table === 'projects') return makeChain({ maybeSingle: { data: { id: 'p1', org_id: 'org-1' }, error: null } })
      if (table === 'knowledge_links') return makeChain({ default: { data: null, error: { code: '500', message: 'boom' } } })
      return makeChain()
    })
    await expect(attachEntryToProject('e1', 'p1')).rejects.toThrow('Failed to attach document')
  })
})

// ── detachEntry ───────────────────────────────────────────────────────────────

describe('detachEntry', () => {
  it('deletes the link row', async () => {
    let deleted = false
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_links') return makeChain({ default: { data: null, error: null }, onDelete: () => { deleted = true } })
      return makeChain()
    })
    await detachEntry('link-1')
    expect(deleted).toBe(true)
  })

  it('throws on delete error', async () => {
    setupTables({ ...PROFILE_OK, knowledge_links: { default: { data: null, error: { message: 'boom' } } } })
    await expect(detachEntry('link-1')).rejects.toThrow('Failed to detach document')
  })
})

// ── getProjectAttachments ─────────────────────────────────────────────────────

describe('getProjectAttachments', () => {
  it('maps joined rows, flags vault, excludes other-org + inactive, sorts newest first', async () => {
    const joined = [
      { id: 'l1', from_entry: 'e1', knowledge_entries: { id: 'e1', title: 'Old', kind: 'doc', entity: 'sf', updated_at: '2026-01-01', org_id: 'org-1', access: 'standard', status: 'active' } },
      { id: 'l2', from_entry: 'e2', knowledge_entries: { id: 'e2', title: 'New', kind: 'doc', entity: 'sf', updated_at: '2026-05-01', org_id: 'org-1', access: 'vault', status: 'active' } },
      { id: 'l3', from_entry: 'e3', knowledge_entries: { id: 'e3', title: 'Foreign', kind: 'doc', entity: 'sf', updated_at: '2026-06-01', org_id: 'other', access: 'standard', status: 'active' } },
      { id: 'l4', from_entry: 'e4', knowledge_entries: { id: 'e4', title: 'Archived', kind: 'doc', entity: 'sf', updated_at: '2026-06-02', org_id: 'org-1', access: 'standard', status: 'archived' } },
    ]
    setupTables({ ...PROFILE_OK, knowledge_links: { default: { data: joined, error: null } } })
    const out = await getProjectAttachments('p1')
    expect(out.map(a => a.id)).toEqual(['e2', 'e1']) // newest first; foreign + archived dropped
    expect(out[0]).toMatchObject({ linkId: 'l2', vault: true })
    expect(out[1].vault).toBe(false)
  })

  it('throws when the query errors', async () => {
    setupTables({ ...PROFILE_OK, knowledge_links: { default: { data: null, error: { message: 'boom' } } } })
    await expect(getProjectAttachments('p1')).rejects.toThrow('Failed to load attachments')
  })
})

// ── getEntryAttachments ───────────────────────────────────────────────────────

describe('getEntryAttachments', () => {
  it('maps projects, excludes other-org + archived, sorts by name', async () => {
    const joined = [
      { id: 'l1', to_project: 'p2', projects: { id: 'p2', name: 'Zebra', org_id: 'org-1', archived: false } },
      { id: 'l2', to_project: 'p1', projects: { id: 'p1', name: 'Apple', org_id: 'org-1', archived: false } },
      { id: 'l3', to_project: 'p3', projects: { id: 'p3', name: 'Foreign', org_id: 'other', archived: false } },
      { id: 'l4', to_project: 'p4', projects: { id: 'p4', name: 'Gone', org_id: 'org-1', archived: true } },
    ]
    setupTables({ ...PROFILE_OK, knowledge_links: { default: { data: joined, error: null } } })
    const out = await getEntryAttachments('e1')
    expect(out.map(a => a.name)).toEqual(['Apple', 'Zebra']) // alpha; foreign + archived dropped
    expect(out[0]).toMatchObject({ linkId: 'l2', projectId: 'p1' })
  })

  it('throws when the query errors', async () => {
    setupTables({ ...PROFILE_OK, knowledge_links: { default: { data: null, error: { message: 'boom' } } } })
    await expect(getEntryAttachments('e1')).rejects.toThrow('Failed to load entry attachments')
  })
})
