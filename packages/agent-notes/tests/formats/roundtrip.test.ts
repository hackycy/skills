import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { parseNote } from '../../src/notes/reader'
import { body, document, ids, metadata } from '../fixtures'
import { experimentalFormats as formats } from './experimental'
import { notesRoot, v2 } from './fixtures'

const seed = 0x2C49E10C
const path = `${notesRoot}/implemented/architecture/2026-10-21-roundtrip.md`

it(`round-trips canonical content and preserves untouched source ranges with seed ${seed}`, () => {
  let state = seed
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state >>> 16
  }
  for (let index = 0; index < 64; index++) {
    const style = next() % 4
    const token = next().toString(36)
    const marker = `case-${index}, style-${style}, token-${token}`
    const values = [`Order ${token}`, `订单 ${token}`] as const
    const contents = `${body().replace('Event ownership', values[next() % 2])}\n[Contract][reference]\n\n[reference]: https://example.com/${token}\n`
    const before = `Old ${token}`
    const after = `新条件 ${token}`
    const field = style % 2 === 0 ? `readWhen:   "${before}"` : `'readWhen': '${before}'`
    const expectedField = field.replace(/["']Old [^"']+["']$/, JSON.stringify(after))
    const opaque = `extensions: {vendor: [true, {text: "嵌套 ${token}"}, null]}`
    const scope = style < 2 ? 'scope: {global: true}' : 'scope:\n  global: true'
    const original = `---\n# ${marker}\nformat: agent-note/2\nid: ${ids[0]}\nstatus:   implemented\n${scope}\n${field} # retain\n${opaque}\n# trailing comment\n---\n${contents}`
    const note = parseNote(Buffer.from(original), path, notesRoot, formats)
    expect(formats.patchNote(note.source, {}), marker).toEqual(Buffer.from(original))
    const patched = formats.patchNote(note.source, { metadata: { read_when: after } })
    expect(patched.toString(), marker).toBe(original.replace(field, expectedField))
    const reread = parseNote(patched, path, notesRoot, formats)
    expect(reread.value.metadata, marker).toEqual({ ...note.value.metadata, read_when: after })
    expect(() => formats.convertNote(note, 'agent-note/1'), marker).toThrow(expect.objectContaining({ code: 'LOSSY_FORMAT_CONVERSION' }))

    const clean = metadata({ read_when: after, scope: { global: true }, relations: { related: [ids[2], ids[1]] } })
    const encodings = [document(clean, contents), v2(clean, contents)]
    for (const encoded of encodings) {
      const parsed = parseNote(Buffer.from(encoded), path, notesRoot, formats)
      const target = parsed.source.format === 'agent-note/1' ? 'agent-note/2' : 'agent-note/1'
      const converted = parseNote(formats.convertNote(parsed, target), path, notesRoot, formats)
      expect(converted.value, marker).toEqual(parsed.value)
      expect(parseNote(formats.convertNote(converted, parsed.source.format), path, notesRoot, formats).value, marker).toEqual(parsed.value)
    }
  }
})
