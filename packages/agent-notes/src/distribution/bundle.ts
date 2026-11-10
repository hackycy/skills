import type { Snapshot } from '../notes/snapshot'
import { Buffer } from 'node:buffer'
import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import packageJson from '../../package.json' with { type: 'json' }
import { NotesError } from '../notes/model'
import { sha256 } from '../notes/snapshot'
import { integrations } from './integrations'
import { layoutFromSnapshot, notesLayout } from './layout'
import { entryText } from './manifest'
import { assertPath, boundedRead, budget, byteOrder, canonical, hashPattern, json, keys, limits, skillNames, versionPattern } from './protocol'
import { distributionSource, repairCommand } from './source'

export interface Integration { id: string, label: string, default: boolean, skillRoot: string }
export interface SourceIndex {
  format: 'agent-notes-source/1'
  version: string
  notes_dir: string | null
  integrations: Integration[]
  files: { path: string, sha256: string }[]
}
export interface Bundle { index: Buffer, files: Map<string, Buffer> }
export const managerVersion = packageJson.version

export function sourceIndex(version: string, files: Map<string, Buffer>, catalog: readonly Integration[] = integrations, notesDir: string | null = null): Buffer {
  return canonical({ format: 'agent-notes-source/1', version, notes_dir: notesDir, integrations: [...catalog].sort((a, b) => byteOrder(a.id, b.id)), files: [...files].sort(([a], [b]) => byteOrder(a, b)).map(([path, bytes]) => ({ path, sha256: sha256(bytes) })) })
}

export function parseSource(bytes: Uint8Array): SourceIndex {
  const value = json(bytes, limits.index) as SourceIndex
  if (value?.format !== 'agent-notes-source/1')
    throw new NotesError('UNSUPPORTED_FORMAT', 'Expected agent-notes-source/1; use a matching complete package.', undefined, 2)
  keys(value, ['format', 'version', 'notes_dir', 'integrations', 'files'])
  if (typeof value.version !== 'string' || !versionPattern.test(value.version) || (value.notes_dir !== null && typeof value.notes_dir !== 'string') || !Array.isArray(value.integrations) || !value.integrations.length || !Array.isArray(value.files))
    throw new NotesError('INVALID_BUNDLE', 'Invalid source index.')
  if (value.notes_dir !== null)
    assertPath(value.notes_dir)
  budget('Integrations', value.integrations.length, limits.integrations)
  budget('Source files', value.files.length, limits.sources)
  let previous = ''
  for (const integration of value.integrations) {
    keys(integration, ['id', 'label', 'default', 'skillRoot'])
    if (typeof integration.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(integration.id) || typeof integration.label !== 'string' || !integration.label.trim() || typeof integration.default !== 'boolean' || typeof integration.skillRoot !== 'string'
      || !/^\.[a-z][a-z0-9-]*\/skills$/.test(integration.skillRoot) || integration.skillRoot.split('/')[0] === '.git' || byteOrder(previous, integration.id) >= 0) {
      throw new NotesError('INVALID_BUNDLE', 'Invalid, duplicate or unordered integration.')
    }
    assertPath(integration.skillRoot)
    previous = integration.id
  }
  if (value.integrations.filter(item => item.default).length !== 1)
    throw new NotesError('INVALID_BUNDLE', 'Source must have exactly one default integration.')
  previous = ''
  for (const file of value.files) {
    keys(file, ['path', 'sha256'])
    if (typeof file.path !== 'string' || (file.path !== 'cli.mjs' && !file.path.startsWith('assets/')) || typeof file.sha256 !== 'string' || !hashPattern.test(file.sha256) || byteOrder(previous, file.path) >= 0)
      throw new NotesError('INVALID_BUNDLE', 'Invalid, duplicate or unordered source file.')
    assertPath(file.path)
    previous = file.path
  }
  if (!value.files.some(file => file.path === 'cli.mjs') || skillNames.some(name => !value.files.some(file => file.path === `assets/skills/${name}/SKILL.md`)))
    throw new NotesError('INVALID_BUNDLE', 'Missing CLI or required skills.')
  // Fix field order as well as whitespace and array ordering.
  if (!canonical({ format: value.format, version: value.version, notes_dir: value.notes_dir, integrations: value.integrations.map(item => ({ id: item.id, label: item.label, default: item.default, skillRoot: item.skillRoot })), files: value.files.map(item => ({ path: item.path, sha256: item.sha256 })) }).equals(Buffer.from(bytes)))
    throw new NotesError('INVALID_BUNDLE', 'Noncanonical source field order.')
  return value
}

export function verifyBundle(bundle: Bundle): SourceIndex {
  const index = parseSource(bundle.index)
  let total = 0
  if (bundle.files.size !== index.files.length)
    throw new NotesError('INVALID_BUNDLE', 'Source material must equal the indexed inventory.')
  for (const file of index.files) {
    const bytes = bundle.files.get(file.path)
    if (!bytes || sha256(bytes) !== file.sha256)
      throw new NotesError('INVALID_BUNDLE', 'Required source is missing or modified; use the matching complete npm package.', file.path)
    budget(file.path, bytes.length, limits.sourceFile)
    total += bytes.length
    budget('Source total', total, limits.sourceTotal)
  }
  return index
}

export function localizeBundle(bundle: Bundle, notesRoot: string): Bundle {
  const index = verifyBundle(bundle)
  if (index.notes_dir === notesRoot)
    return bundle
  if (index.notes_dir !== null)
    throw new NotesError('INVALID_BUNDLE', 'Materialized source belongs to a different Notes root.')
  assertPath(notesRoot)
  const files = new Map([...bundle.files].map(([path, bytes]) => [path, path.startsWith('assets/') && /\.(?:md|json|mjs|txt)$/i.test(path) ? Buffer.from(entryText(bytes, path).replaceAll('.agents/notes', () => notesRoot)) : bytes]))
  const result = { index: sourceIndex(index.version, files, index.integrations, notesRoot), files }
  verifyBundle(result)
  return result
}

export function bundleHash(bundle: Bundle): string {
  verifyBundle(bundle)
  return sha256(bundle.index)
}

export function readBundle(read: (path: string, maximum: number) => Buffer | undefined, indexPath: string, filePath: (path: string) => string): Bundle {
  const bytes = read(indexPath, limits.index)
  if (!bytes)
    throw new NotesError('INVALID_BUNDLE', 'Missing source-index.json; use a matching complete npm package.', indexPath)
  const index = parseSource(bytes)
  const files = new Map<string, Buffer>()
  let total = 0
  for (const file of index.files) {
    const bytes = read(filePath(file.path), limits.sourceFile)
    if (!bytes)
      throw new NotesError('INVALID_BUNDLE', 'Required indexed source is missing.', file.path)
    total += bytes.length
    budget('Source total', total, limits.sourceTotal)
    files.set(file.path, bytes)
  }
  const result = { index: bytes, files }
  verifyBundle(result)
  return result
}

export function installedBundle(source: Snapshot, runtimeRoot: string): Bundle {
  return readBundle((path, max) => source.read(path, max), `${runtimeRoot}/source-index.json`, path => `${runtimeRoot}/${path}`)
}

export function loadBundle(): Bundle {
  const { kind, root } = distributionSource()
  const read = (path: string, max: number): Buffer => {
    let current = root
    for (const part of path.split('/')) {
      current = join(current, part)
      if (lstatSync(current).isSymbolicLink())
        throw new NotesError('SYMLINK_NOT_ALLOWED', 'Source must not traverse symlinks.', path)
    }
    return boundedRead(current, max)
  }
  try {
    const bundle = readBundle(read, kind === 'runtime' ? 'source-index.json' : 'dist/source-index.json', path => kind === 'package' && path === 'cli.mjs' ? 'dist/cli.mjs' : path)
    const index = parseSource(bundle.index)
    if (index.version !== managerVersion || (kind === 'runtime') !== (index.notes_dir !== null) || JSON.stringify(index.integrations) !== JSON.stringify([...integrations].sort((a, b) => byteOrder(a.id, b.id))))
      throw new NotesError('INVALID_BUNDLE', 'Source index disagrees with the executing tool.')
    return bundle
  }
  catch (error) {
    throw new NotesError('INVALID_BUNDLE', `Cannot verify tool source: ${String(error)}. Build first or run ${repairCommand(managerVersion)} using the complete npm package.`)
  }
}

export function observeRuntime(source: Snapshot): void {
  const layout = layoutFromSnapshot(source) ?? notesLayout()
  source.read(layout.runtimeCli)
}
