import { describe, it, expect } from 'vitest'
import { chatToMarkdown, defaultChatTitle } from '@/lib/agent/chat-to-markdown'

const FIXED = new Date('2026-05-19T21:36:00Z')

describe('chatToMarkdown', () => {
  it('emits a placeholder for an empty thread', () => {
    const md = chatToMarkdown([], { takenAt: FIXED })
    expect(md).toContain('Saved 2026-05-19 21:36 UTC from HQ Agent')
    expect(md).toContain('Empty conversation')
  })

  it('serializes a single user-assistant exchange', () => {
    const md = chatToMarkdown(
      [
        { role: 'user', content: 'what is overdue?' },
        { role: 'assistant', content: 'You have 3 overdue tasks.' },
      ],
      { takenAt: FIXED },
    )
    expect(md).toContain('**You**')
    expect(md).toContain('> what is overdue?')
    expect(md).toContain('**HQ Agent**')
    expect(md).toContain('> You have 3 overdue tasks.')
  })

  it('preserves multi-line content with per-line blockquote prefix', () => {
    const md = chatToMarkdown(
      [{ role: 'assistant', content: 'line 1\nline 2\nline 3' }],
      { takenAt: FIXED },
    )
    expect(md).toContain('> line 1\n> line 2\n> line 3')
  })

  it('keeps fenced code blocks inside the quote', () => {
    const code = '```ts\nfunction foo() {}\n```'
    const md = chatToMarkdown(
      [{ role: 'assistant', content: `Here is the fix:\n${code}` }],
      { takenAt: FIXED },
    )
    // Each fence line is quoted (they remain part of the message content).
    expect(md).toContain('> ```ts')
    expect(md).toContain('> function foo() {}')
    expect(md).toContain('> ```')
  })

  it('handles empty message content gracefully', () => {
    const md = chatToMarkdown(
      [{ role: 'user', content: '' }],
      { takenAt: FIXED },
    )
    expect(md).toContain('_(empty message)_')
  })

  it('respects custom labels', () => {
    const md = chatToMarkdown(
      [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      { takenAt: FIXED, userLabel: 'Sonja', agentLabel: 'Claude' },
    )
    expect(md).toContain('**Sonja**')
    expect(md).toContain('**Claude**')
    expect(md).not.toContain('**You**')
  })

  it('uses UTC stamp regardless of host timezone', () => {
    const d = new Date('2026-01-01T00:30:00Z')
    const md = chatToMarkdown([{ role: 'user', content: 'x' }], { takenAt: d })
    expect(md).toContain('2026-01-01 00:30 UTC')
  })
})

describe('defaultChatTitle', () => {
  it('returns a placeholder when no user message exists', () => {
    expect(defaultChatTitle([])).toBe('Chat with HQ Agent')
    expect(defaultChatTitle([{ role: 'assistant', content: 'hi' }])).toBe('Chat with HQ Agent')
  })

  it('uses the first user message verbatim when short', () => {
    expect(defaultChatTitle([
      { role: 'user', content: 'show me overdue tasks' },
    ])).toBe('show me overdue tasks')
  })

  it('strips multi-line content to the first line', () => {
    expect(defaultChatTitle([
      { role: 'user', content: 'first line\nsecond line\nthird line' },
    ])).toBe('first line')
  })

  it('truncates very long messages on a word boundary with ellipsis', () => {
    const long = 'word '.repeat(30).trim()
    const title = defaultChatTitle([{ role: 'user', content: long }])
    expect(title.length).toBeLessThanOrEqual(81)
    expect(title.endsWith('…')).toBe(true)
  })
})
