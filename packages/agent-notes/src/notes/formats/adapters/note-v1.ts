import type { Metadata, ReadonlyBytes } from '../../model'
import type { NoteAdapter, Registration } from '../ports'
import { Buffer } from 'node:buffer'
import { parseDocument, stringify } from 'yaml'
import schema from '../../../../assets/formats/agent-note-1.schema.json'
import { checkBody } from '../../markdown'
import { NotesError } from '../../model'
import { frontmatter, hasComments, readonlyBytes, source } from '../carrier'
import { ajv } from './validation'

export const validateMetadata = ajv.compile<Metadata>(schema)
const format = schema.properties.format.const

function serialize(metadata: Record<string, unknown>, body: string): ReadonlyBytes {
  return readonlyBytes(Buffer.from(`---\n${stringify(metadata)}---\n${body}`))
}

const adapter: NoteAdapter = {
  format,
  capabilities: { patchFidelity: 'legacy' },
  validate(value, path) {
    if (!validateMetadata(value))
      throw new NotesError('INVALID_METADATA', ajv.errorsText(validateMetadata.errors, { separator: '; ' }), path)
    const { format: _format, ...metadata } = value as Metadata & { format: string }
    return metadata
  },
  checkBody,
  parse(bytes, { path, assertPlacement }, carrier) {
    const metadata = adapter.validate(carrier.metadata, path)
    assertPlacement(metadata)
    const title = adapter.checkBody(carrier.body, metadata.status, path)
    return { value: { metadata, title, body: carrier.body }, source: source(format, path, bytes, hasComments(carrier.document)) }
  },
  render(note, request) {
    if (request.purpose === 'create' && request.draft)
      return serialize({ ...request.draft.metadata, format, id: note.metadata.id, status: note.metadata.status }, note.body)
    const encoded = { format, ...note.metadata }
    if (!validateMetadata(encoded))
      throw new NotesError('LOSSY_FORMAT_CONVERSION', `Cannot represent Note metadata in ${format}.`, request.purpose === 'conversion' ? request.origin.path : undefined)
    return serialize(encoded, note.body)
  },
  patch(original, changes, draft) {
    if (draft)
      return serialize({ ...draft.metadata, status: changes.metadata?.status }, changes.body ?? draft.body)
    if (!changes.metadata && changes.body === undefined)
      return original.bytes
    const text = original.bytes.copy().toString('utf8')
    const parts = frontmatter.exec(text)!
    const body = changes.body ?? text.slice(parts[0].length)
    if (!changes.metadata)
      return readonlyBytes(Buffer.from(parts[0] + body))
    if (changes.metadata.archive)
      return readonlyBytes(Buffer.from(`---\n${parts[1]}\n${stringify({ archive: changes.metadata.archive })}---\n${body}`))
    const document = parseDocument(parts[1])
    for (const [key, value] of Object.entries(changes.metadata)) {
      if (value === undefined)
        continue
      if (value === null && (key === 'rejection_reason' || key === 'relations'))
        document.delete(key)
      else
        document.set(key, value)
    }
    return readonlyBytes(Buffer.from(`---\n${document.toString()}---\n${body}`))
  },
}

export const v1NoteRegistration: Registration<'note'> = {
  kind: 'note',
  format,
  adapter,
  schema,
  read: true,
  write: true,
  migrate: { from: false, to: false },
  introducedIn: '0.1.0',
  deprecatedIn: null,
  removedIn: null,
}
