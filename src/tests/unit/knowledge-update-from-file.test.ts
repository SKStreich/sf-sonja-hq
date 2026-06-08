import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  updateKnowledgeEntryFromFile,
  IngestNotFoundError,
  IngestValidationError,
} from '@/lib/knowledge/ingest'

/**
 * Unit coverage for the versioning counterpart to ingestKnowledgeFile.
 * Mirrors knowledge-update-entry.test.ts: assert that a content change
 * snapshots the PRIOR content into knowledge_versions and bumps the entry
 * version, and that an unchanged re-mirror is an idempotent no-op.
 */

const USER = 'user-1'
const ORG = 'org-1'

const CURRENT = {
  id: 'e1',
  version: 3,
  title: 'doc.txt',
  body: 'old content',
  kind: 'doc',
  entity: 'sfe',
  tags: ['alpha'],
  summary: null,
  type_hint: null,
  idea_status: null,
  storage_path: 'org-1/user-1/old-doc.txt',
}

function makeFile(text: string, name = 'doc.txt', type = 'text/plain') {
  return new File([text], name, { type })
}

/** Build a duck-typed supabase mock; capture version inserts + entry updates + storage calls. */
function makeSupabase(opts: { current: any }) {
  const cap = {
    versionInserts: [] as any[],
    entryUpdates: [] as any[],
    uploads: [] as any[],
    removes: [] as any[],
  }

  const entriesChain: any = {}
  ;['select', 'eq'].forEach(m => { entriesChain[m] = vi.fn(() => entriesChain) })
  entriesChain.maybeSingle = vi.fn().mockResolvedValue({ data: opts.current, error: null })
  entriesChain.update = vi.fn((p: any) => { cap.entryUpdates.push(p); return entriesChain })
  entriesChain.then = (resolve: any, reject?: any) =>
    Promise.resolve({ data: null, error: null }).then(resolve, reject)

  const versionsChain: any = {}
  versionsChain.insert = vi.fn((p: any) => { cap.versionInserts.push(p); return versionsChain })
  versionsChain.then = (resolve: any, reject?: any) =>
    Promise.resolve({ data: null, error: null }).then(resolve, reject)

  // Junction: entity membership now lives here (post-cutover). Reads return the
  // current entity; setEntryEntities upsert/delete resolve as no-ops.
  const junctionRows = opts.current
    ? [{ entry_id: opts.current.id, entity: opts.current.entity ?? 'personal' }]
    : []
  const junctionChain: any = {}
  ;['eq'].forEach(m => { junctionChain[m] = vi.fn(() => junctionChain) })
  junctionChain.select = vi.fn(() => junctionChain)
  junctionChain.in = vi.fn(() => Promise.resolve({ data: junctionRows, error: null }))
  junctionChain.upsert = vi.fn(() => Promise.resolve({ error: null }))
  junctionChain.delete = vi.fn(() => junctionChain)
  junctionChain.not = vi.fn(() => Promise.resolve({ error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'knowledge_entries') return entriesChain
      if (table === 'knowledge_versions') return versionsChain
      if (table === 'knowledge_entry_entities') return junctionChain
      return {}
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn((path: string) => { cap.uploads.push(path); return Promise.resolve({ error: null }) }),
        remove: vi.fn((paths: string[]) => { cap.removes.push(...paths); return Promise.resolve({ error: null }) }),
      })),
    },
  }

  return { supabase, cap }
}

beforeEach(() => { vi.clearAllMocks() })

describe('updateKnowledgeEntryFromFile', () => {
  it('snapshots prior content and bumps version when the body changes', async () => {
    const { supabase, cap } = makeSupabase({ current: CURRENT })
    const result = await updateKnowledgeEntryFromFile({
      supabase, user_id: USER, org_id: ORG, entry_id: 'e1',
      file: makeFile('brand new content'),
    })

    expect(cap.versionInserts).toHaveLength(1)
    expect(cap.versionInserts[0]).toMatchObject({
      entry_id: 'e1',
      version: 3,            // snapshotted PRIOR version number
      title: 'doc.txt',
      body: 'old content',   // PRIOR body
      created_by: USER,
    })
    expect(cap.entryUpdates).toHaveLength(1)
    expect(cap.entryUpdates[0].version).toBe(4)
    expect(cap.entryUpdates[0].body).toBe('brand new content')
    expect(result.versioned).toBe(true)
    expect(result.version).toBe(4)
  })

  it('is an idempotent no-op when content is unchanged', async () => {
    const { supabase, cap } = makeSupabase({ current: CURRENT })
    const result = await updateKnowledgeEntryFromFile({
      supabase, user_id: USER, org_id: ORG, entry_id: 'e1',
      file: makeFile('old content'),   // identical body + same filename/kind/entity/tags
    })

    expect(cap.versionInserts).toHaveLength(0)
    expect(cap.entryUpdates).toHaveLength(0)
    expect(cap.uploads).toHaveLength(0)
    expect(result.versioned).toBe(false)
    expect(result.version).toBe(3)
  })

  it('uploads a new blob and removes the superseded one on a real change', async () => {
    const { supabase, cap } = makeSupabase({ current: CURRENT })
    await updateKnowledgeEntryFromFile({
      supabase, user_id: USER, org_id: ORG, entry_id: 'e1',
      file: makeFile('changed'),
    })
    expect(cap.uploads).toHaveLength(1)
    expect(cap.removes).toContain('org-1/user-1/old-doc.txt') // old blob cleaned up
  })

  it('applies metadata overrides (tags) and counts that as a change', async () => {
    const { supabase, cap } = makeSupabase({ current: CURRENT })
    await updateKnowledgeEntryFromFile({
      supabase, user_id: USER, org_id: ORG, entry_id: 'e1',
      file: makeFile('old content'),   // body unchanged...
      tags: ['alpha', 'beta'],         // ...but tags differ → version
    })
    expect(cap.versionInserts).toHaveLength(1)
    expect(cap.entryUpdates[0].tags).toEqual(['alpha', 'beta'])
  })

  it('throws IngestNotFoundError when the entry is missing or not owned', async () => {
    const { supabase } = makeSupabase({ current: null })
    await expect(updateKnowledgeEntryFromFile({
      supabase, user_id: USER, org_id: ORG, entry_id: 'nope',
      file: makeFile('x'),
    })).rejects.toBeInstanceOf(IngestNotFoundError)
  })

  it('rejects an invalid entity override before touching the DB', async () => {
    const { supabase, cap } = makeSupabase({ current: CURRENT })
    await expect(updateKnowledgeEntryFromFile({
      supabase, user_id: USER, org_id: ORG, entry_id: 'e1',
      file: makeFile('x'), entity: 'BOGUS',
    })).rejects.toBeInstanceOf(IngestValidationError)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
