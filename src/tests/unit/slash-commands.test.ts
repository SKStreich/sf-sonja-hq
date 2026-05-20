import { describe, it, expect } from 'vitest'
import {
  detectSlashToken,
  filterSlashCommands,
  SLASH_COMMANDS,
} from '@/lib/knowledge/slash-commands'

describe('detectSlashToken', () => {
  it('opens when `/` is typed at the very start of the value', () => {
    const r = detectSlashToken('/', 1)
    expect(r).toEqual({ open: true, start: 0, query: '' })
  })

  it('opens with a query when text follows the `/`', () => {
    const r = detectSlashToken('/tas', 4)
    expect(r).toEqual({ open: true, start: 0, query: 'tas' })
  })

  it('opens after `/` at the start of a non-first line', () => {
    const value = 'hello\n/task'
    const r = detectSlashToken(value, value.length)
    expect(r).toEqual({ open: true, start: 6, query: 'task' })
  })

  it('opens after `/` preceded by a space', () => {
    const value = 'note /ta'
    const r = detectSlashToken(value, value.length)
    expect(r).toEqual({ open: true, start: 5, query: 'ta' })
  })

  it('does not open mid-word', () => {
    expect(detectSlashToken('and/or', 6)).toEqual({ open: false })
  })

  it('does not open inside a URL', () => {
    expect(detectSlashToken('https://example.com/foo', 23)).toEqual({ open: false })
  })

  it('does not open for `//` (the leading `/` is preceded by another `/`)', () => {
    expect(detectSlashToken('//', 2)).toEqual({ open: false })
  })

  it('closes when a space appears after the `/`', () => {
    expect(detectSlashToken('/task ', 6)).toEqual({ open: false })
  })

  it('closes when a newline appears after the `/`', () => {
    expect(detectSlashToken('/task\n', 6)).toEqual({ open: false })
  })

  it('returns the latest open token when the caret moves past it', () => {
    const value = 'first /foo bar /baz'
    const r = detectSlashToken(value, value.length)
    expect(r).toEqual({ open: true, start: 15, query: 'baz' })
  })
})

describe('filterSlashCommands', () => {
  it('returns all commands when query is empty', () => {
    expect(filterSlashCommands('')).toEqual(SLASH_COMMANDS)
  })

  it('matches by command name prefix', () => {
    const r = filterSlashCommands('ta')
    expect(r.some(c => c.name === '/task')).toBe(true)
  })

  it('matches both embed commands by the shared "embed" prefix', () => {
    const r = filterSlashCommands('embed')
    const names = r.map(c => c.name)
    expect(names).toContain('/embed-entry')
    expect(names).toContain('/embed-project')
  })

  it('narrows to /embed-entry on the label substring "entry"', () => {
    const r = filterSlashCommands('entry')
    expect(r.map(c => c.name)).toEqual(['/embed-entry'])
  })

  it('narrows to /embed-project on the label substring "project"', () => {
    const r = filterSlashCommands('project')
    expect(r.map(c => c.name)).toEqual(['/embed-project'])
  })

  it('returns empty for unknown queries', () => {
    expect(filterSlashCommands('zzz-no-such-command')).toEqual([])
  })
})

describe('/task insert', () => {
  const task = SLASH_COMMANDS.find(c => c.name === '/task')!

  it('replaces `/task` on an empty line with `- [ ] `', () => {
    const value = '/task'
    const { next, cursor } = task.insert({ value, tokenStart: 0, caret: 5 })
    expect(next).toBe('- [ ] ')
    expect(cursor).toBe(6)
  })

  it('keeps surrounding content intact and replaces the token only', () => {
    const value = 'before\n/task\nafter'
    const tokenStart = value.indexOf('/task')
    const caret = tokenStart + '/task'.length
    const { next, cursor } = task.insert({ value, tokenStart, caret })
    expect(next).toBe('before\n- [ ] \nafter')
    expect(next.slice(0, cursor)).toBe('before\n- [ ] ')
  })

  it('pushes the checkbox to a new line when the line has prior content', () => {
    // The trigger requires whitespace before `/`, but be defensive: if the
    // line already has non-whitespace content, the checkbox goes on its own
    // new line below.
    const value = 'note /task'
    const tokenStart = value.indexOf('/task')
    const caret = tokenStart + '/task'.length
    const { next } = task.insert({ value, tokenStart, caret })
    expect(next).toBe('note \n- [ ] ')
  })
})

describe('/embed-entry insert', () => {
  const embed = SLASH_COMMANDS.find(c => c.name === '/embed-entry')!

  it('replaces the slash token with `[[Entry: ` and parks the caret after the space', () => {
    const value = '/embed-entry'
    const { next, cursor, openMention } = embed.insert({
      value, tokenStart: 0, caret: value.length,
    })
    expect(next).toBe('[[Entry: ')
    expect(cursor).toBe('[[Entry: '.length)
    expect(next.slice(0, cursor)).toBe('[[Entry: ')
    expect(openMention).toBe('entry')
  })

  it('keeps surrounding content intact, inserting only the partial token', () => {
    const value = 'see also: /embed-entry for context'
    const tokenStart = value.indexOf('/embed-entry')
    const caret = tokenStart + '/embed-entry'.length
    const { next, cursor } = embed.insert({ value, tokenStart, caret })
    expect(next).toBe('see also: [[Entry:  for context')
    expect(next.slice(0, cursor)).toBe('see also: [[Entry: ')
  })

  it('works mid-paragraph after a newline', () => {
    const value = 'intro\n/embed-entry'
    const tokenStart = value.indexOf('/embed-entry')
    const caret = value.length
    const { next, cursor } = embed.insert({ value, tokenStart, caret })
    expect(next).toBe('intro\n[[Entry: ')
    expect(cursor).toBe(next.length)
  })
})

describe('/embed-project insert', () => {
  const embed = SLASH_COMMANDS.find(c => c.name === '/embed-project')!

  it('replaces the slash token with `[[Project: ` and parks the caret after the space', () => {
    const value = '/embed-project'
    const { next, cursor, openMention } = embed.insert({
      value, tokenStart: 0, caret: value.length,
    })
    expect(next).toBe('[[Project: ')
    expect(cursor).toBe('[[Project: '.length)
    expect(openMention).toBe('project')
  })

  it('keeps surrounding content intact', () => {
    const value = 'tracking via /embed-project right now'
    const tokenStart = value.indexOf('/embed-project')
    const caret = tokenStart + '/embed-project'.length
    const { next } = embed.insert({ value, tokenStart, caret })
    expect(next).toBe('tracking via [[Project:  right now')
  })
})
