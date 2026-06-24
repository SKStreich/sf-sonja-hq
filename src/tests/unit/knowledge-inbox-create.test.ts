/**
 * insertInboxEntry (Sprint 13 T2) — the shared write behind Siri / capture API /
 * agent. Asserts an item is born triage_status='inbox', carries the suggestion,
 * and writes NO entity junction (zero rows until filed — D2).
 */
import { describe, it, expect, vi } from 'vitest'
import { insertInboxEntry } from '@/lib/knowledge/inbox-create'

function mockClient(captured: { table?: string; inserted?: any }) {
  const chain: any = {
    insert: vi.fn((p: any) => { captured.inserted = p; return chain }),
    select: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
  }
  return {
    from: vi.fn((t: string) => { captured.table = t; return chain }),
  }
}

describe('insertInboxEntry', () => {
  it('creates an inbox knowledge_entry with the suggestion and no junction write', async () => {
    const cap: { table?: string; inserted?: any } = {}
    const supabase = mockClient(cap)
    const out = await insertInboxEntry(supabase, 'user-1', 'org-1', {
      body: 'dictated thought', kind: 'idea', title: 'A thought',
      suggestedEntity: 'tm', source: 'siri',
    })
    expect(out).toEqual({ id: 'new-id' })
    expect(cap.table).toBe('knowledge_entries') // never knowledge_entry_entities
    expect(cap.inserted).toMatchObject({
      org_id: 'org-1', user_id: 'user-1', kind: 'idea',
      triage_status: 'inbox', suggested_entity: 'tm',
      idea_status: 'raw', source: 'siri', access: 'standard',
    })
  })

  it('defaults kind to note (idea_status null) and tolerates no suggestion', async () => {
    const cap: { table?: string; inserted?: any } = {}
    const out = await insertInboxEntry(mockClient(cap), 'u', 'o', { body: 'note text', source: 'agent' })
    expect(out.id).toBe('new-id')
    expect(cap.inserted.kind).toBe('note')
    expect(cap.inserted.idea_status).toBeNull()
    expect(cap.inserted.suggested_entity).toBeNull()
    expect(cap.inserted.triage_status).toBe('inbox')
  })

  it('throws on empty body', async () => {
    await expect(insertInboxEntry(mockClient({}), 'u', 'o', { body: '   ', source: 'siri' }))
      .rejects.toThrow('Body is required')
  })
})
