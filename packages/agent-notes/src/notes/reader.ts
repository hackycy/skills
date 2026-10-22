import type { Manifest, Metadata, Note, NoteIndex, ProjectConfig } from './model'
import type { Snapshot } from './snapshot'
import { Buffer } from 'node:buffer'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { isAlias, isMap, isScalar, parseDocument, visit } from 'yaml'
import noteSchema from '../../assets/formats/agent-note-1.schema.json'
import archiveSchema from '../../assets/formats/agent-note-archive-1.schema.json'
import { validPattern } from '../discovery/scope'
import { checkBody } from './markdown'
import { diagnostic, NotesError } from './model'
import { safePath, sha256 } from './snapshot'

const ajv = new Ajv({ allErrors: true, strictRequired: false, strictTypes: false })
addFormats(ajv)
export const validateMetadata = ajv.compile<Metadata>(noteSchema)
export const validateManifest = ajv.compile<Manifest>(archiveSchema)

export function decode(bytes: Buffer, path: string): string {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])))
    throw new NotesError('INVALID_ENCODING', 'Use UTF-8 without BOM.', path)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    throw new NotesError('INVALID_ENCODING', 'Invalid UTF-8 bytes.', path)
  }
  if (text.includes('\r') || text.includes('\0'))
    throw new NotesError('INVALID_ENCODING', 'Use LF newlines without NUL bytes.', path)
  return text
}

function format(value: unknown, expected: string, path: string): void {
  if (typeof value === 'object' && value !== null && 'format' in value && value.format !== expected)
    throw new NotesError('UNSUPPORTED_FORMAT', `Supported format: ${expected}; found ${String(value.format)}.`, path, 2)
}

export function parseJson(bytes: Buffer, path: string): unknown {
  // JSON is a YAML 1.2 subset; this pass also rejects duplicate JSON keys.
  const text = decode(bytes, path)
  try {
    JSON.parse(text)
    return jsonYaml(text, path)
  }
  catch (error) {
    if (error instanceof NotesError)
      throw error
    throw new NotesError('INVALID_JSON', 'Expected valid JSON with unique keys.', path)
  }
}

export function jsonYaml(text: string, path: string): unknown {
  const document = parseDocument(text, { schema: 'core', uniqueKeys: true, strict: true })
  if (document.errors.length || document.warnings.length)
    throw new NotesError('INVALID_YAML', [...document.errors, ...document.warnings].map(error => error.message).join('; '), path)
  visit(document, (key, node) => {
    if (isAlias(node) || (node && typeof node === 'object' && 'tag' in node && node.tag))
      throw new NotesError('INVALID_YAML', 'Aliases and explicit YAML tags are not supported.', path)
    if (isMap(node) && node.items.some(pair => !isScalar(pair.key) || typeof pair.key.value !== 'string'))
      throw new NotesError('INVALID_YAML', 'JSON-compatible mappings require string keys.', path)
    if (isScalar(node) && ((key === 'key' && node.value === '<<') || (typeof node.value === 'number' && !Number.isFinite(node.value))))
      throw new NotesError('INVALID_YAML', 'Merge keys and non-JSON numbers are not supported.', path)
  })
  return document.toJS({ maxAliasCount: 0, mapAsMap: false })
}

export function readConfig(snapshot: Snapshot): ProjectConfig {
  const path = '.agent-notes/config.json'
  const bytes = snapshot.read(path)
  if (!bytes)
    return { format: 'agent-notes-config/1', notes_dir: '.agents/notes', language: 'zh-CN' }
  const value = parseJson(bytes, path)
  format(value, 'agent-notes-config/1', path)
  if (!value || typeof value !== 'object' || !('format' in value) || !('notes_dir' in value)
    || !('language' in value) || typeof value.notes_dir !== 'string' || !safePath(value.notes_dir)
    || !['zh-CN', 'en'].includes(String(value.language))
    || Object.keys(value).some(key => !['format', 'notes_dir', 'language'].includes(key))
    || /(?:^|\/)(?:\.git|node_modules)(?:\/|$)/i.test(value.notes_dir)
    || value.notes_dir.toLowerCase() === '.agent-notes' || value.notes_dir.toLowerCase().startsWith('.agent-notes/')) {
    throw new NotesError('INVALID_CONFIG', 'Expected v1 config with a safe notes_dir and language zh-CN or en.', path, 2)
  }
  return value as ProjectConfig
}

export function parseNote(bytes: Buffer, path: string, notesDir: string): Note {
  const text = decode(bytes, path)
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)
  if (!frontmatter)
    throw new NotesError('INVALID_FRONTMATTER', 'A Note must begin with YAML frontmatter delimited by --- lines.', path)
  const metadata = jsonYaml(frontmatter[1], path)
  format(metadata, 'agent-note/1', path)
  if (!validateMetadata(metadata))
    throw new NotesError('INVALID_METADATA', ajv.errorsText(validateMetadata.errors, { separator: '; ' }), path)
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
  const lifecycle = match[1]
  if (lifecycle === 'archived' ? !metadata.archive : (metadata.archive || metadata.status !== lifecycle))
    throw new NotesError('INVALID_LIFECYCLE', 'Directory, status and archive metadata disagree.', path)
  const body = text.slice(frontmatter[0].length)
  const title = checkBody(body, metadata.status, path)
  return { metadata, path, relativePath, lifecycle, identityPath: relativePath.slice(lifecycle.length + 1), title, text, body, hash: sha256(bytes) }
}

export function readIndex(snapshot: Snapshot): NoteIndex {
  const config = readConfig(snapshot)
  snapshot.includeDirectory(config.notes_dir)
  const result: NoteIndex = { config, notes: new Map(), manifest: { format: 'agent-note-archive/1', entries: {} }, diagnostics: [] }
  const manifestPath = `${config.notes_dir}/archived/manifest.json`
  try {
    const bytes = snapshot.read(manifestPath)
    if (bytes) {
      const value = parseJson(bytes, manifestPath)
      format(value, 'agent-note-archive/1', manifestPath)
      if (!validateManifest(value))
        throw new NotesError('INVALID_MANIFEST', ajv.errorsText(validateManifest.errors), manifestPath)
      result.manifest = value
    }
  }
  catch (error) {
    result.diagnostics.push(diagnostic(error))
  }
  for (const path of snapshot.paths()) {
    if (!path.startsWith(`${config.notes_dir}/`) || !/\.md$/i.test(path))
      continue
    // Only the root README is a routing document; lifecycle trees contain Notes.
    if (path === `${config.notes_dir}/README.md`)
      continue
    try {
      const bytes = snapshot.read(path)
      if (!bytes)
        continue
      const note = parseNote(bytes, path, config.notes_dir)
      if (result.notes.has(note.metadata.id))
        throw new NotesError('DUPLICATE_ID', `ID also appears in ${result.notes.get(note.metadata.id)!.path}.`, path)
      result.notes.set(note.metadata.id, note)
    }
    catch (error) {
      result.diagnostics.push(diagnostic(error))
    }
  }
  return result
}
