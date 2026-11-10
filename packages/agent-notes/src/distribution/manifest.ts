import type { Snapshot } from '../notes/snapshot'
import type { NotesLayout } from './layout'
import { NotesError } from '../notes/model'
import { sha256 } from '../notes/snapshot'
import { defaultNotesRoot, layoutFromSnapshot, notesLayout } from './layout'
import { assertPath, budget, byteOrder, hashPattern, json, keys, limits, versionPattern } from './protocol'

export interface Asset { path: string, kind: 'file' | 'block', sha256: string }
export interface Installation {
  format: 'agent-notes-install/2'
  version: string
  bundle_sha256: string
  integrations: string[]
  assets: Asset[]
}
export { skillNames, versionPattern } from './protocol'

export function entryText(bytes: Uint8Array | undefined, path: string): string {
  if (!bytes)
    return ''
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  }
  catch {
    throw new NotesError('INVALID_ENCODING', 'Entry files must be UTF-8; refusing a lossy rewrite.', path)
  }
}

export function parseInstallation(bytes: Uint8Array): Installation {
  const value = json(bytes, limits.installation, 'INVALID_INSTALLATION') as Installation
  if (value?.format !== 'agent-notes-install/2')
    throw new NotesError('UNSUPPORTED_FORMAT', 'Expected agent-notes-install/2; old installations are not migrated.', undefined, 2)
  keys(value, ['format', 'version', 'bundle_sha256', 'integrations', 'assets'], 'INVALID_INSTALLATION')
  if (typeof value.version !== 'string' || !versionPattern.test(value.version) || typeof value.bundle_sha256 !== 'string' || !hashPattern.test(value.bundle_sha256) || !Array.isArray(value.integrations) || !value.integrations.length || !Array.isArray(value.assets) || !value.assets.length)
    throw new NotesError('INVALID_INSTALLATION', 'Invalid identity or inventory.', undefined, 2)
  budget('Installation integrations', value.integrations.length, limits.integrations)
  budget('Asset receipts', value.assets.length, limits.assets)
  let previous = ''
  for (const id of value.integrations) {
    if (typeof id !== 'string' || byteOrder(previous, id) >= 0)
      throw new NotesError('INVALID_INSTALLATION', 'Integrations must be unique and sorted.', undefined, 2)
    previous = id
  }
  previous = ''
  for (const asset of value.assets) {
    keys(asset, ['path', 'kind', 'sha256'], 'INVALID_INSTALLATION')
    assertPath(asset.path)
    if (!['file', 'block'].includes(asset.kind) || typeof asset.sha256 !== 'string' || !hashPattern.test(asset.sha256) || byteOrder(previous, asset.path) >= 0)
      throw new NotesError('INVALID_INSTALLATION', 'Invalid or duplicate receipt.', asset.path, 2)
    previous = asset.path
  }
  return value
}

export function readInstallation(source: Snapshot, suppliedLayout?: NotesLayout): Installation | undefined {
  const layout = suppliedLayout ?? layoutFromSnapshot(source) ?? notesLayout(defaultNotesRoot)
  const bytes = source.read(layout.installPath, limits.installation)
  return bytes ? parseInstallation(bytes) : undefined
}

export function markers(path: string): [string, string] {
  return path.startsWith('.git')
    ? ['# agent-notes:begin', '# agent-notes:end']
    : ['<!-- agent-notes:begin -->', '<!-- agent-notes:end -->']
}

export function block(text: string, path: string): { start: number, end: number, text: string } | undefined {
  const [startMarker, endMarker] = markers(path)
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker)
  if (start === -1 && end === -1)
    return undefined
  if (start === -1 || end < start || text.includes(startMarker, start + 1) || text.includes(endMarker, end + 1)
    || (start > 0 && text[start - 1] !== '\n') || !['\r', '\n', undefined].includes(text[end + endMarker.length])) {
    throw new NotesError('BLOCK_CONFLICT', 'Managed block markers are incomplete, duplicated or not on their own lines.', path)
  }
  return { start, end: end + endMarker.length, text: text.slice(start, end + endMarker.length) }
}

export function wrapBlock(path: string, text: string): string {
  const [start, end] = markers(path)
  return `${start}\n${text.trimEnd()}\n${end}`
}

export function replaceBlock(text: string, path: string, replacement: string): string {
  const current = block(text, path)
  return current
    ? text.slice(0, current.start) + replacement + text.slice(current.end)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${replacement}\n`
}

export function assetBytes(source: Snapshot, asset: Pick<Asset, 'path' | 'kind'>): Uint8Array | undefined {
  const bytes = source.read(asset.path, limits.endpoint)
  if (!bytes || asset.kind === 'file')
    return bytes
  const current = block(entryText(bytes, asset.path), asset.path)
  // Entry files belong to the project and may use CRLF. Only managed block
  // comparisons normalize line endings; complete managed files hash raw bytes.
  return current ? new TextEncoder().encode(current.text.replace(/\r\n/g, '\n')) : undefined
}

export function integrity(source: Snapshot, installation: Installation): { path: string, state: 'missing' | 'modified' }[] {
  return installation.assets.flatMap<{ path: string, state: 'missing' | 'modified' }>((asset) => {
    const bytes = assetBytes(source, asset)
    return !bytes ? [{ path: asset.path, state: 'missing' as const }] : sha256(bytes) !== asset.sha256 ? [{ path: asset.path, state: 'modified' as const }] : []
  })
}
