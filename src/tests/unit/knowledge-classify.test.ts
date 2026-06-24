/**
 * Shared classifier (Sprint 13 T2). Pure parsing only — the Anthropic call in
 * classifyEntry isn't exercised here (fallback path is covered by it returning
 * fallbackClassification when no apiKey).
 */
import { describe, it, expect } from 'vitest'
import { parseClassification, fallbackClassification } from '@/lib/knowledge/classify'

describe('parseClassification', () => {
  it('parses a well-formed reply and keeps a valid entity guess', () => {
    const c = parseClassification(JSON.stringify({
      title: 'Quarterly plan', type_hint: 'strategy', tags: ['Q3', 'PLAN'],
      confidence: 0.9, summary: 'A plan.', suggested_entity: 'tm',
    }), 'body')
    expect(c.title).toBe('Quarterly plan')
    expect(c.type_hint).toBe('strategy')
    expect(c.tags).toEqual(['q3', 'plan']) // lowercased
    expect(c.confidence).toBe(0.9)
    expect(c.suggested_entity).toBe('tm')
  })

  it('drops an unknown entity guess to null and coerces a bad type_hint', () => {
    const c = parseClassification(JSON.stringify({
      title: 'X', type_hint: 'nonsense', suggested_entity: 'acme',
    }), 'body')
    expect(c.suggested_entity).toBeNull()
    expect(c.type_hint).toBe('strategy')
  })

  it('handles a ```json fenced reply', () => {
    const c = parseClassification('```json\n{"title":"Fenced","suggested_entity":"sfe"}\n```', 'body')
    expect(c.title).toBe('Fenced')
    expect(c.suggested_entity).toBe('sfe')
  })

  it('falls back to the first body line on invalid JSON', () => {
    const c = parseClassification('not json', 'First line\nsecond')
    expect(c).toEqual(fallbackClassification('First line\nsecond'))
    expect(c.title).toBe('First line')
    expect(c.suggested_entity).toBeNull()
  })
})
