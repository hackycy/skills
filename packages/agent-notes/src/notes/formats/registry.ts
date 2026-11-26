import type { Buffer } from 'node:buffer'
import type { ArchiveEntry, Manifest, Note, NoteContent, Parsed, ProjectConfig, Source } from '../model'
import type { Kind, NoteChanges, NoteContext, NoteDraft, Registration } from './ports'
import { isDeepStrictEqual } from 'node:util'
import { NotesError } from '../model'
import { parseJson, readMarkdown, readonlyBytes } from './carrier'

type Defaults = Readonly<Record<Kind, string>>

export interface FormatRegistry {
  readonly migrationEnabled: boolean
  readNote: (input: Buffer, context: NoteContext) => Parsed<NoteContent>
  readManifest: (input: Buffer, path: string) => Parsed<Manifest>
  readConfig: (input: Buffer, path: string) => Parsed<ProjectConfig>
  renderInitialConfig: (config: ProjectConfig) => Buffer
  appendSeal: (manifest: Manifest, id: string, entry: ArchiveEntry, path: string, source?: Source) => Buffer
  checkCreateBody: (body: string, status: NoteContent['metadata']['status'], path: string) => string
  createNote: (note: NoteContent, draft: NoteDraft) => Buffer
  patchNote: (original: Source, changes: NoteChanges) => Buffer
  editNote: (original: Note, draft: NoteDraft, status: NoteContent['metadata']['status'], path: string) => Buffer
  convertNote: (note: Note, format: string) => Buffer
  preservesArchiveSource: (origin: Source, archive: NonNullable<NoteContent['metadata']['archive']>, sealed: Source) => boolean
}

export function createRegistry(entries: Record<string, Registration>, defaults: Defaults): FormatRegistry {
  const registrations = new Map<string, Registration>()
  const key = (kind: Kind, format: string): string => `${kind}:${format}`
  for (const entry of Object.values(entries)) {
    const id = key(entry.kind, entry.format)
    if (registrations.has(id) || entry.adapter.format !== entry.format)
      throw new Error(`Invalid document format registration: ${id}.`)
    const versions = [entry.introducedIn, entry.deprecatedIn, entry.removedIn].filter(version => version !== null)
    const compare = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true })
    if (versions.some((version, i) => !/^\d+\.\d+\.\d+$/.test(version) || (i > 0 && compare(versions[i - 1], version) > 0)))
      throw new Error(`Invalid document format support window: ${id}.`)
    if (entry.kind === 'note')
      Object.freeze(entry.adapter.capabilities)
    Object.freeze(entry.adapter)
    registrations.set(id, Object.freeze({ ...entry, migrate: Object.freeze({ ...entry.migrate }) }))
  }
  const selected = Object.freeze({ ...defaults })
  function lookup<K extends Kind>(kind: K, format: string): Registration<K> | undefined {
    return registrations.get(key(kind, format)) as Registration<K> | undefined
  }
  for (const kind of ['note', 'manifest', 'config'] as const) {
    const entry = lookup(kind, selected[kind])
    if (!entry?.read || !entry.write)
      throw new Error(`Default format for ${kind} must be readable and writable.`)
  }

  function dispatch<K extends Kind>(kind: K, value: unknown, path: string): Registration<K> {
    // Missing tags use the default adapter only to keep its required-field diagnostic.
    if (!value || typeof value !== 'object' || !('format' in value))
      return lookup(kind, selected[kind])!
    const format = value.format
    const entry = typeof format === 'string' ? lookup(kind, format) : undefined
    if (entry?.read)
      return entry
    const supported = [...registrations.values()].filter(entry => entry.kind === kind && entry.read).map(entry => entry.format).sort()
    throw new NotesError('UNSUPPORTED_FORMAT', `Supported format: ${supported.join(', ')}; found ${String(format)}.`, path, 2, typeof format === 'string' ? { format, supported_formats: supported } : undefined)
  }

  function writable<K extends Kind>(kind: K, format: string, path?: string): Registration<K> {
    const entry = lookup(kind, format)
    if (!entry?.write)
      throw new NotesError('READ_ONLY_FORMAT', `Format ${format} is not writable.`, path, 2)
    return entry
  }

  const notes = [...registrations.values()].filter(entry => entry.kind === 'note')
  const migrationEnabled = notes.some(from => from.read && from.migrate.from
    && notes.some(to => to !== from && to.read && to.write && to.migrate.to))
  function readManifest(input: Buffer, path: string): Parsed<Manifest> {
    const value = parseJson(input, path)
    return dispatch('manifest', value, path).adapter.parse(readonlyBytes(input), path, value)
  }

  return Object.freeze<FormatRegistry>({
    migrationEnabled,
    readManifest,
    readNote(input: Buffer, context: NoteContext) {
      const bytes = readonlyBytes(input)
      const carrier = readMarkdown(bytes, context.path)
      return dispatch('note', carrier.metadata, context.path).adapter.parse(bytes, context, carrier)
    },
    readConfig(input: Buffer, path: string) {
      const value = parseJson(input, path)
      return dispatch('config', value, path).adapter.parse(readonlyBytes(input), path, value)
    },
    renderInitialConfig(config: ProjectConfig) {
      return writable('config', selected.config).adapter.renderInitial(config).copy()
    },
    appendSeal(manifest: Manifest, id: string, entry: ArchiveEntry, path: string, source?: Source) {
      if (Object.hasOwn(manifest.entries, id))
        throw new NotesError('INVALID_MANIFEST', 'An existing archive seal cannot be replaced.', path)
      const adapter = writable('manifest', source?.format ?? selected.manifest, path).adapter
      const before = source ? manifest : readManifest(adapter.renderEmpty().copy(), path).value
      const bytes = adapter.appendEntry(before, id, entry, source).copy()
      const parsed = readManifest(bytes, path)
      if (parsed.source.format !== adapter.format || !isDeepStrictEqual(parsed.value.entries, { ...manifest.entries, [id]: entry }))
        throw new NotesError('INVALID_MANIFEST', 'Appending an archive seal must preserve all existing entries.', path)
      return bytes
    },
    checkCreateBody(body: string, status: NoteContent['metadata']['status'], path: string) {
      return writable('note', selected.note).adapter.checkBody(body, status, path)
    },
    createNote(note: NoteContent, draft: NoteDraft) {
      return writable('note', selected.note).adapter.render(note, { purpose: 'create', draft }).copy()
    },
    patchNote(original: Source, changes: NoteChanges) {
      return writable('note', original.format, original.path).adapter.patch(original, changes).copy()
    },
    editNote(original: Note, draft: NoteDraft, status: NoteContent['metadata']['status'], path: string) {
      const { source, value } = original
      const adapter = writable('note', source.format, source.path).adapter
      const metadata = adapter.capabilities.patchFidelity === 'legacy'
        ? { status }
        : adapter.validate({ ...draft.metadata, status }, path)
      const changes: NoteChanges['metadata'] = { status }
      if ('scope' in metadata) {
        for (const field of ['scope', 'read_when', 'relations'] as const) {
          if (!isDeepStrictEqual(metadata[field], value.metadata[field]))
            Object.assign(changes, { [field]: metadata[field] ?? null })
        }
      }
      return adapter.patch(source, { metadata: changes, body: draft.body }, draft).copy()
    },
    convertNote(note: Note, format: string) {
      const { source, value } = note
      const from = lookup('note', source.format)
      const to = lookup('note', format)
      if (source.format === format || !from?.migrate.from || !to?.read || !to.write || !to.migrate.to)
        throw new NotesError('INVALID_INPUT', `Cannot migrate from ${source.format} to ${format}.`, source.path, 2)
      if (source.residue.hasComments || source.residue.hasOpaque)
        throw new NotesError('LOSSY_FORMAT_CONVERSION', 'Conversion would discard comments or opaque metadata.', source.path)
      return to.adapter.render(value, { purpose: 'conversion', origin: source }).copy()
    },
    preservesArchiveSource(origin, archive, sealed) {
      const adapter = lookup('note', origin.format)!.adapter
      if (adapter.capabilities.patchFidelity === 'legacy')
        return true
      try {
        return adapter.patch(origin, { metadata: { archive } }).copy().equals(sealed.bytes.copy())
      }
      catch (error) {
        if (error instanceof NotesError)
          return false
        throw error
      }
    },
  })
}
