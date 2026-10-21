import type { Snapshot } from '../notes/snapshot'
import { NotesError } from '../notes/model'
import { parseJson } from '../notes/reader'
import { safePath, sha256 } from '../notes/snapshot'

export type Target = 'agents' | 'claude'
export interface Asset { path: string, kind: 'file' | 'block', sha256: string }
export interface Installation {
  format: 'agent-notes-install/1'
  version: string
  bundle_sha256: string
  targets: Target[]
  assets: Asset[]
}
export const installPath = '.agent-notes/install.json'
export const blockPaths = ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.gitignore', '.gitattributes']
export const skillNames = ['agent-note', 'agent-note-maintenance'] as const
export const versionPattern = /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i

export function entryText(bytes: Uint8Array | undefined, path: string): string {
  if (!bytes)
    return ''
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  }
  catch { throw new NotesError('INVALID_ENCODING', 'Entry files must be UTF-8; refusing a lossy rewrite.', path) }
}

export function managedPath(path: string, kind: Asset['kind'], targets: Target[]): boolean {
  if (!safePath(path) || path.split('/').some(part => part.toLowerCase() === '.git'))
    return false
  if (kind === 'block')
    return ['.gitignore', '.gitattributes', ...(targets.includes('agents') ? ['AGENTS.md'] : []), ...(targets.includes('claude') ? ['CLAUDE.md', '.claude/CLAUDE.md'] : [])].includes(path)
  return path.startsWith('.agent-notes/runtime/') || targets.some(target => skillNames.some(name => path.startsWith(`.${target}/skills/${name}/`)))
}

export function readInstallation(source: Snapshot): Installation | undefined {
  const bytes = source.read(installPath)
  if (!bytes)
    return undefined
  const value = parseJson(bytes, installPath) as Installation
  if (value?.format !== 'agent-notes-install/1')
    throw new NotesError('UNSUPPORTED_FORMAT', 'Expected agent-notes-install/1; this tool cannot manage this installation.', installPath, 2)
  if (!versionPattern.test(value.version) || !/^[\da-f]{64}$/.test(value.bundle_sha256) || Object.keys(value).some(key => !['format', 'version', 'bundle_sha256', 'targets', 'assets'].includes(key))
    || !Array.isArray(value.targets) || !value.targets.length || value.targets.some(target => !['agents', 'claude'].includes(target))
    || new Set(value.targets).size !== value.targets.length || !Array.isArray(value.assets) || !value.assets.length) {
    throw new NotesError('INVALID_INSTALLATION', 'Invalid version, targets or asset inventory.', installPath, 2)
  }
  const seen = new Set<string>()
  for (const asset of value.assets) {
    if (!asset || typeof asset.path !== 'string' || !['file', 'block'].includes(asset.kind)
      || !managedPath(asset.path, asset.kind, value.targets) || !/^[\da-f]{64}$/.test(asset.sha256)
      || Object.keys(asset).some(key => !['path', 'kind', 'sha256'].includes(key)) || seen.has(asset.path)) {
      throw new NotesError('INVALID_INSTALLATION', 'Asset inventory contains an invalid, duplicate or unowned path.', asset?.path, 2)
    }
    seen.add(asset.path)
  }
  if (!value.assets.some(asset => asset.path === '.agent-notes/runtime/cli.mjs' && asset.kind === 'file'))
    throw new NotesError('INVALID_INSTALLATION', 'Runtime is missing from the asset inventory.', installPath, 2)
  return value
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
  const bytes = source.read(asset.path)
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
