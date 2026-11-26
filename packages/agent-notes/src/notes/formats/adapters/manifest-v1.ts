import type { Manifest, ReadonlyBytes } from '../../model'
import type { ManifestAdapter, Registration } from '../ports'
import { Buffer } from 'node:buffer'
import schema from '../../../../assets/formats/agent-note-archive-1.schema.json'
import { NotesError } from '../../model'
import { readonlyBytes, source } from '../carrier'
import { ajv } from './validation'

export const validateManifest = ajv.compile<Manifest>(schema)
const format = schema.properties.format.const
function render(manifest: Manifest): ReadonlyBytes {
  return readonlyBytes(Buffer.from(`${JSON.stringify({ format, entries: manifest.entries }, null, 2)}\n`))
}

const adapter: ManifestAdapter = {
  format,
  validate(value, path) {
    if (!validateManifest(value))
      throw new NotesError('INVALID_MANIFEST', ajv.errorsText(validateManifest.errors), path)
    return { entries: value.entries }
  },
  parse(bytes, path, value) {
    return { value: adapter.validate(value, path), source: source(format, path, bytes) }
  },
  renderEmpty: () => render({ entries: {} }),
  appendEntry: (original, id, entry, origin) => {
    // Retain legacy top-level key order as well as the entry order.
    const value = origin ? JSON.parse(origin.bytes.copy().toString('utf8')) : { format, entries: {} }
    value.entries = { ...original.entries, [id]: entry }
    return readonlyBytes(Buffer.from(`${JSON.stringify(value, null, 2)}\n`))
  },
}

export const v1ManifestRegistration: Registration<'manifest'> = {
  kind: 'manifest',
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
