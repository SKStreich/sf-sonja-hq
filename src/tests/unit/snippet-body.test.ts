import { describe, it, expect } from 'vitest'
import { snippetBody, defaultSnippetTitle } from '@/lib/knowledge/snippet-body'

describe('snippetBody', () => {
  it('wraps code in a triple-backtick fence with the language tag', () => {
    const md = snippetBody({ language: 'ts', code: 'const x = 1' })
    expect(md).toMatch(/^```ts\nconst x = 1\n```\n$/)
  })

  it('lowercases the language tag', () => {
    const md = snippetBody({ language: 'TypeScript', code: 'x' })
    expect(md.startsWith('```typescript\n')).toBe(true)
  })

  it('promotes to a 4-backtick fence when content contains ```', () => {
    const md = snippetBody({
      language: 'md',
      code: '```js\nfoo()\n```',
    })
    expect(md.startsWith('````md\n')).toBe(true)
    expect(md.endsWith('````\n')).toBe(true)
  })

  it('appends a Source line when sourceUrl is provided', () => {
    const md = snippetBody({
      language: 'ts',
      code: 'x',
      sourceUrl: 'https://github.com/owner/repo/commit/abc1234',
    })
    expect(md).toContain('**Source:** [https://github.com/owner/repo/commit/abc1234](https://github.com/owner/repo/commit/abc1234)')
  })

  it('uses a custom source label when provided', () => {
    const md = snippetBody({
      language: 'ts',
      code: 'x',
      sourceUrl: 'https://github.com/owner/repo/commit/abc1234',
      sourceLabel: 'abc1234 · Fix bug',
    })
    expect(md).toContain('**Source:** [abc1234 · Fix bug](https://github.com/owner/repo/commit/abc1234)')
  })

  it('escapes ] in source labels so Markdown links survive', () => {
    const md = snippetBody({
      language: 'ts',
      code: 'x',
      sourceUrl: 'https://example.com',
      sourceLabel: 'something [weird] here',
    })
    expect(md).toContain('something [weird\\] here')
  })

  it('appends a [[Project: …]] mention when projectName is provided', () => {
    const md = snippetBody({
      language: 'ts',
      code: 'x',
      projectName: 'Cost Dashboard',
    })
    expect(md).toContain('**Project:** [[Project: Cost Dashboard]]')
  })

  it('omits optional sections when their inputs are absent', () => {
    const md = snippetBody({ language: 'sh', code: 'ls -la' })
    expect(md).not.toContain('**Source:**')
    expect(md).not.toContain('**Project:**')
  })

  it('treats empty/whitespace optional fields as absent', () => {
    const md = snippetBody({
      language: 'sh',
      code: 'ls',
      sourceUrl: '   ',
      projectName: '',
    })
    expect(md).not.toContain('**Source:**')
    expect(md).not.toContain('**Project:**')
  })
})

describe('defaultSnippetTitle', () => {
  it('uses the first non-empty trimmed line', () => {
    expect(defaultSnippetTitle('\n\n  const x = 1\nmore code\n')).toBe('const x = 1')
  })

  it('falls back to "Code snippet" for empty/whitespace input', () => {
    expect(defaultSnippetTitle('')).toBe('Code snippet')
    expect(defaultSnippetTitle('   \n\n  ')).toBe('Code snippet')
  })

  it('truncates very long first lines with an ellipsis', () => {
    const long = 'x'.repeat(120)
    const title = defaultSnippetTitle(long)
    expect(title.length).toBeLessThanOrEqual(81)
    expect(title.endsWith('…')).toBe(true)
  })
})
