import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { matchesPath, validPattern } from '../src/discovery/scope'
import { parseNote, validateManifest, validateMetadata } from '../src/notes/reader'
import examples from './contract-examples.json'
import { body, document, metadata } from './fixtures'

const path = '.agents/notes/implemented/architecture/2026-10-21-event-ownership.md'
const parse = (text: string, destination = path) => parseNote(Buffer.from(text), destination, '.agents/notes')

describe('frozen v1 compatibility examples', () => {
  it.each(examples.note_valid)('accepts $name', ({ value }) => {
    expect(validateMetadata(value)).toBe(true)
  })
  it.each(examples.note_invalid)('rejects $name', ({ value }) => {
    expect(validateMetadata(value)).toBe(false)
  })
  it.each(examples.manifest_valid)('accepts a valid archive manifest', (value) => {
    expect(validateManifest(value)).toBe(true)
  })
})

describe('document reader', () => {
  it('accepts Chinese headings without changing the public format', () => {
    const contents = body().replace('Problem', '问题').replace('Decision', '决策').replace('Alternatives considered', '考虑过的替代方案').replace('Consequences', '后果').replace('Verification', '验证')
    expect(parse(document(metadata(), contents)).title).toBe('Event ownership')
  })

  it.each([
    ['unknown format', document().replace('agent-note/1', 'agent-note/2')],
    ['unknown field', document().replace('format:', 'unknown: true\nformat:')],
    ['duplicate keys', document().replace('format:', 'format: agent-note/1\nformat:')],
    ['alias', document().replace('read_when: When changing event ownership.', 'read_when: &reason why\nrejection_reason: *reason')],
    ['merge', document().replace('scope:', '<<: { extra: true }\nscope:')],
    ['non-JSON mapping key', document().replace('scope:', '? [scope]\n:')],
    ['custom tag', document().replace('read_when:', 'read_when: !custom')],
    ['non-JSON number', document().replace('read_when: When changing event ownership.', 'read_when: .inf')],
    ['empty section', document().replace('The order aggregate owns publication.', '')],
    ['placeholder', document().replace('The order aggregate owns publication.', 'TODO')],
    ['plan heading', `${document()}\n## Plan\nImplement later.\n`],
    ['duplicate H1', `${document()}\n# Another decision\n`],
    ['duplicate H2', `${document()}\n## Decision\nSome other decision.\n`],
    ['wrong order', document().replace('## Problem', '## Decision').replace('## Decision\nThe order', '## Problem\nThe order')],
    ['BOM', `\uFEFF${document()}`],
    ['CRLF', document().replaceAll('\n', '\r\n')],
  ])('rejects %s', (_label, text) => {
    expect(() => parse(text)).toThrow()
  })

  it('rejects malformed UTF-8 and invalid dates/locations', () => {
    expect(() => parseNote(Buffer.from([0xFF]), path, '.agents/notes')).toThrow(/UTF-8/)
    expect(() => parse(document(), path.replace('2026-10-21', '2026-02-30'))).toThrow(/path|slug/i)
    expect(() => parse(document(), path.replace('/implemented/', '/proposed/'))).toThrow(/disagree/)
  })

  it('ignores headings inside code fences', () => {
    expect(parse(`${document()}\n## Example\n\n\`\`\`md\n# title\n## Plan\n\`\`\`\n`).title).toBe('Event ownership')
  })
})

describe('bounded scope patterns', () => {
  it.each(['../src/**', '/src/**', 'src/../other', '!src/**', 'src/{a,b}', 'src/+(a)', 'src/a**', 'C:/src', 'src\\orders', 'src//orders'])('rejects %s', pattern => expect(validPattern(pattern)).toBe(false))
  it('matches dotfiles, zero-segment globstars and exact case', () => {
    expect(matchesPath('src/**/file?.ts', 'src/file1.ts')).toBe(true)
    expect(matchesPath('src/**', 'src/.hidden/file.ts')).toBe(true)
    expect(matchesPath('src/*.ts', 'src/nested/file.ts')).toBe(false)
    expect(matchesPath('src/**', 'Src/file.ts')).toBe(false)
    expect(matchesPath('.config/?', '.config/x')).toBe(true)
  })
})
