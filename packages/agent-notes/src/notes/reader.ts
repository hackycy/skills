import type { Buffer } from 'node:buffer'
import type { NotesLayout } from '../distribution/layout'
import type { FormatRegistry } from './formats/registry'
import type { LocatedNote, Metadata, Note, NoteIndex, ProjectConfig, Source } from './model'
import type { Snapshot } from './snapshot'
import { validPattern } from '../discovery/scope'
import { defaultNotesRoot, layoutFromSnapshot } from '../distribution/layout'
import { diagnostic, NotesError } from './model'

export function readConfig(snapshot: Snapshot, formats: FormatRegistry, layout = layoutFromSnapshot(snapshot, defaultNotesRoot)): { value: ProjectConfig, source?: Source } {
  const path = layout.configPath
  const bytes = snapshot.read(path)
  if (!bytes)
    return { value: { notes_dir: layout.notesRoot, language: 'zh-CN' } }
  const parsed = formats.readConfig(bytes, path)
  if (parsed.value.notes_dir !== layout.notesRoot)
    throw new NotesError('INVALID_CONFIG', 'Expected v1 config with a safe notes_dir and language zh-CN or en.', path, 2)
  return parsed
}

function placement(path: string, notesDir: string, metadata: Metadata): Pick<LocatedNote, 'path' | 'relativePath' | 'identityPath' | 'lifecycle'> {
  for (const pattern of metadata.scope.paths ?? []) {
    if (!validPattern(pattern))
      throw new NotesError('INVALID_SCOPE', `Unsupported scope path: ${pattern}`, path)
  }
  const relativePath = path.slice(notesDir.length + 1)
  const match = /^(proposed|implemented|rejected|archived)\/(?:feature|bug-fix|simplification|architecture|process|testing)\/(\d{4}-\d{2}-\d{2})-([^/\\]+)\.md$/.exec(relativePath)
  if (!match || Number.isNaN(Date.parse(`${match[2]}T00:00:00Z`))
    || new Date(`${match[2]}T00:00:00Z`).toISOString().slice(0, 10) !== match[2]
    || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(match[3])) {
    throw new NotesError('INVALID_NOTE_PATH', 'Expected <lifecycle>/<class>/YYYY-MM-DD-safe-slug.md.', path)
  }
  const lifecycle = match[1] as LocatedNote['lifecycle']
  if (lifecycle === 'archived' ? !metadata.archive : (metadata.archive || metadata.status !== lifecycle))
    throw new NotesError('INVALID_LIFECYCLE', 'Directory, status and archive metadata disagree.', path)
  return { path, relativePath, lifecycle, identityPath: relativePath.slice(lifecycle.length + 1) }
}

export function parseNote(bytes: Buffer, path: string, notesDir: string, formats: FormatRegistry): Note {
  let location: ReturnType<typeof placement> | undefined
  const parsed = formats.readNote(bytes, {
    path,
    assertPlacement: (metadata) => {
      location = placement(path, notesDir, metadata)
    },
  })
  if (!location)
    throw new Error(`Format adapter omitted placement validation for ${path}.`)
  return { ...parsed, value: { ...parsed.value, ...location } }
}

export function readIndex(snapshot: Snapshot, formats: FormatRegistry, allowProposalActivation = false): NoteIndex {
  const layout: NotesLayout = layoutFromSnapshot(snapshot, defaultNotesRoot)
  const { value: config, source: configSource } = readConfig(snapshot, formats, layout)
  snapshot.includeDirectory(config.notes_dir)
  const result: NoteIndex = { config, configSource, notes: new Map(), manifest: { entries: {} }, diagnostics: [], allowProposalActivation }
  const manifestPath = `${config.notes_dir}/archived/manifest.json`
  try {
    const bytes = snapshot.read(manifestPath)
    if (bytes) {
      const parsed = formats.readManifest(bytes, manifestPath)
      result.manifest = parsed.value
      result.manifestSource = parsed.source
    }
  }
  catch (error) {
    result.diagnostics.push(diagnostic(error))
  }
  for (const path of snapshot.paths()) {
    if (!path.startsWith(`${config.notes_dir}/`) || path.startsWith(`${layout.runtimeRoot}/`) || path.startsWith(`${layout.localRoot}/`) || !/\.md$/i.test(path))
      continue
    if (path === `${config.notes_dir}/README.md`)
      continue
    try {
      const bytes = snapshot.read(path)
      if (!bytes)
        continue
      const note = parseNote(bytes, path, config.notes_dir, formats)
      const id = note.value.metadata.id
      if (result.notes.has(id))
        throw new NotesError('DUPLICATE_ID', `ID also appears in ${result.notes.get(id)!.value.path}.`, path)
      result.notes.set(id, note)
    }
    catch (error) {
      result.diagnostics.push(diagnostic(error))
    }
  }
  return result
}
