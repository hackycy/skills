import type { NoteAdapter, Registration } from '../../../src/notes/formats/ports'
import type { Metadata } from '../../../src/notes/model'
import { Buffer } from 'node:buffer'
import { stringify } from 'yaml'
import v1Schema from '../../../assets/formats/agent-note-1.schema.json'
import { ajv } from '../../../src/notes/formats/adapters/validation'
import { hasComments, readonlyBytes, source } from '../../../src/notes/formats/carrier'
import { checkBody } from '../../../src/notes/markdown'
import { NotesError } from '../../../src/notes/model'
import { patchLocally } from './local-patch'

const format = 'agent-note/2'
const { read_when: readWhen, ...properties } = v1Schema.properties
const supersedes = properties.relations.properties.supersedes
const schema = {
  ...v1Schema,
  title: 'Experimental Agent Note v2 frontmatter',
  required: v1Schema.required.map(key => key === 'read_when' ? 'readWhen' : key),
  properties: {
    ...properties,
    format: { const: format },
    readWhen,
    extensions: { type: 'object' },
    relations: {
      ...properties.relations,
      properties: {
        ...properties.relations.properties,
        supersedes: {
          ...supersedes,
          items: {
            ...supersedes.items,
            properties: { ...supersedes.items.properties, activation: { const: 'on-proposal' } },
          },
        },
      },
    },
  },
}

const validate = ajv.compile<Omit<Metadata, 'read_when'> & { format: string, readWhen: string, extensions?: Record<string, unknown> }>(schema)

const adapter: NoteAdapter = {
  format,
  capabilities: { patchFidelity: 'local' },
  validate(value, path) {
    if (!validate(value))
      throw new NotesError('INVALID_NOTE_V2', ajv.errorsText(validate.errors, { separator: '; ' }), path, 1, { phase: 'metadata' })
    const { format: _format, extensions: _extensions, readWhen, ...metadata } = value
    return { ...metadata, read_when: readWhen }
  },
  checkBody(body, status, path) {
    try {
      return checkBody(body, status, path)
    }
    catch (error) {
      if (error instanceof NotesError)
        throw new NotesError('INVALID_NOTE_V2', error.message, path, 1, { phase: 'body' })
      throw error
    }
  },
  parse(bytes, { path, assertPlacement }, carrier) {
    const metadata = adapter.validate(carrier.metadata, path)
    assertPlacement(metadata)
    const title = adapter.checkBody(carrier.body, metadata.status, path)
    return {
      value: { metadata, title, body: carrier.body },
      source: source(format, path, bytes, hasComments(carrier.document), Object.hasOwn(carrier.metadata as object, 'extensions')),
    }
  },
  render(note, request) {
    const { read_when: readWhen, ...metadata } = note.metadata
    const encoded = { format, ...metadata, readWhen }
    if (!validate(encoded))
      throw new NotesError('LOSSY_FORMAT_CONVERSION', `Cannot represent Note metadata in ${format}.`, request.purpose === 'conversion' ? request.origin.path : undefined)
    return readonlyBytes(Buffer.from(`---\n${stringify(encoded)}---\n${note.body}`))
  },
  patch(original, changes) {
    const { read_when: readWhen, ...metadata } = changes.metadata ?? {}
    return patchLocally(original, { ...metadata, ...(readWhen === undefined ? {} : { readWhen }) }, changes.body)
  },
}

export const v2NoteRegistration: Registration<'note'> = {
  kind: 'note',
  format,
  adapter,
  schema,
  read: true,
  write: true,
  migrate: { from: true, to: true },
  introducedIn: null,
  deprecatedIn: null,
  removedIn: null,
}
