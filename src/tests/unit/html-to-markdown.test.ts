import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/lib/knowledge/html-to-markdown'

describe('htmlToMarkdown', () => {
  it('returns empty for empty/blank input', () => {
    expect(htmlToMarkdown('')).toBe('')
    expect(htmlToMarkdown(null)).toBe('')
    expect(htmlToMarkdown('   ')).toBe('')
  })

  it('converts headings and paragraphs', () => {
    const md = htmlToMarkdown('<h1>Title</h1><p>Hello <strong>world</strong>.</p>')
    expect(md).toContain('# Title')
    expect(md).toContain('**world**')
  })

  it('converts tables to GFM pipe tables', () => {
    const md = htmlToMarkdown(
      '<table><thead><tr><th>Metric</th><th>Formula</th></tr></thead>' +
        '<tbody><tr><td>ARR</td><td>MRR × 12</td></tr></tbody></table>',
    )
    expect(md).toContain('| Metric | Formula |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| ARR | MRR × 12 |')
  })

  it('strips an injected <style> preamble (does not leak CSS as text)', () => {
    const md = htmlToMarkdown('<style>table{border:1px}</style><h2>Heading</h2>')
    expect(md).not.toContain('border')
    expect(md).toContain('## Heading')
  })

  it('collapses runs of blank lines', () => {
    const md = htmlToMarkdown('<p>a</p><p>b</p>')
    expect(md).not.toMatch(/\n{3,}/)
  })

  it('keeps a <br>-containing table cell on one row (no broken GFM table)', () => {
    const md = htmlToMarkdown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
        '<tbody><tr><td>Main page<br>Access via:<br>LNM</td><td>x</td></tr></tbody></table>',
    )
    // Exactly 3 table lines: header, divider, one data row (no split row).
    const tableLines = md.split('\n').filter((l) => l.trim().startsWith('|'))
    expect(tableLines).toHaveLength(3)
    expect(md).toContain('Main page Access via: LNM')
  })
})
