import type { ProjectConfig } from '../notes/model'
import type { Bundle } from './bundle'
import type { Asset, Installation } from './manifest'
import { Buffer } from 'node:buffer'
import { NotesError } from '../notes/model'
import { rewriteLinks } from '../notes/rewrite'
import { sha256 } from '../notes/snapshot'
import { localizeBundle, verifyBundle } from './bundle'
import { notesLayout } from './layout'
import { wrapBlock } from './manifest'
import { assertPath, budget, byteOrder, canonical, keys, limits, skillNames } from './protocol'

export { integrationChoices } from './integrations'
export interface Projection {
  config: ProjectConfig
  source: Bundle
  identity: { version: string, bundle_sha256: string }
  integrations: string[]
  assets: (Asset & { bytes: Buffer })[]
  skillRoots: string[]
  cleanupCandidates: string[]
  creationCandidates: string[]
  gitRequirements: { files: string[], notesRoot: string, localRoot: string }
}
export const ancestors = (path: string): string[] => path.split('/').slice(0, -1).map((_, i) => path.split('/').slice(0, i + 1).join('/'))

export function project(input: { source: Bundle, config: ProjectConfig, integrations: readonly string[] }): Projection {
  keys(input.config, ['format', 'notes_dir', 'language'], 'INVALID_CONFIG')
  if (input.config.format !== 'agent-notes-config/1' || !['zh-CN', 'en'].includes(input.config.language))
    throw new NotesError('INVALID_CONFIG', 'Invalid project configuration.', undefined, 2)
  const source = localizeBundle(input.source, input.config.notes_dir)
  const index = verifyBundle(source)
  const layout = notesLayout(input.config.notes_dir)
  const selected = [...input.integrations].sort(byteOrder)
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !index.integrations.some(item => item.id === id)))
    throw new NotesError('UNKNOWN_INTEGRATION', 'Choose a nonempty, distinct set recognized by the locked tool; use tool update before selecting a newer integration.', undefined, 2)
  assertPath(layout.notesRoot)
  if (/[\s*?[\]#!]/.test(layout.notesRoot) || [...index.integrations.map(item => item.skillRoot), '.gitignore', '.gitattributes'].some((path) => {
    const a = layout.notesRoot.toLowerCase()
    const b = path.toLowerCase()
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
  })) {
    throw new NotesError('CONFIG_CONFLICT', 'Notes root must be disjoint from skill and control paths.', layout.notesRoot, 2)
  }
  const assets = new Map<string, Asset & { bytes: Buffer }>()
  const add = (path: string, kind: Asset['kind'], bytes: Buffer): void => {
    assertPath(path)
    const previous = assets.get(path)
    if (previous) {
      if (previous.kind === kind && previous.bytes.equals(bytes))
        return
      throw new NotesError('PROJECTION_CONFLICT', 'Different assets project to the same path.', path)
    }
    const folded = path.normalize('NFC').toLowerCase()
    if ([...assets.keys()].some((other) => {
      const key = other.normalize('NFC').toLowerCase()
      return key === folded || key.startsWith(`${folded}/`) || folded.startsWith(`${key}/`)
    })) {
      throw new NotesError('PROJECTION_CONFLICT', 'Case/normalization or file/parent collision.', path)
    }
    assets.set(path, { path, kind, bytes, sha256: sha256(bytes) })
  }
  for (const [path, bytes] of source.files)
    add(`${layout.runtimeRoot}/${path}`, 'file', bytes)
  add(`${layout.runtimeRoot}/source-index.json`, 'file', source.index)
  const roots = [...new Set(selected.map(id => index.integrations.find(item => item.id === id)!.skillRoot))].sort(byteOrder)
  const skillRoots = roots.flatMap(root => skillNames.map(name => `${root}/${name}`))
  const skillFiles = [...source.files].filter(([path]) => skillNames.some(name => path.startsWith(`assets/skills/${name}/`)))
  for (const root of roots) {
    const destinations = new Map<string, { path: string }>()
    for (const path of source.files.keys()) {
      for (const parent of [...ancestors(path), path])
        destinations.set(parent, { path: `${layout.runtimeRoot}/${parent}` })
    }
    for (const [path] of skillFiles) {
      const local = path.slice('assets/skills/'.length)
      for (const parent of [...ancestors(local), local])
        destinations.set(`assets/skills/${parent}`, { path: `${root}/${parent}` })
    }
    for (const [path, bytes] of skillFiles) {
      const destination = `${root}/${path.slice('assets/skills/'.length)}`
      add(destination, 'file', /\.md$/i.test(path) ? Buffer.from(rewriteLinks(bytes.toString('utf8'), path, destination, destinations)) : bytes)
    }
  }
  const files = [...assets.keys(), layout.configPath, layout.installPath].sort(byteOrder)
  // Every directory pass-through is paired with a wildcard guard, then exact
  // children are reopened. Unknown siblings retain an ancestor ignore intent.
  const ignore = new Set<string>()
  const parents = [...new Set(files.flatMap(ancestors))].sort(byteOrder)
  for (const parent of parents) {
    ignore.add(`!/${parent}/`)
    ignore.add(`/${parent}/*`)
  }
  for (const path of files)
    ignore.add(`!/${path}`)
  ignore.add(`!/${layout.notesRoot}/**`)
  ignore.add(`/${layout.localRoot}/`)
  add('.gitignore', 'block', Buffer.from(wrapBlock('.gitignore', [...ignore].join('\n'))))
  add('.gitattributes', 'block', Buffer.from(wrapBlock('.gitattributes', [`/${layout.notesRoot}/** text eol=lf`, ...files.map(path => `/${path} text eol=lf`)].join('\n'))))
  const cleanupCandidates = [...new Set(skillFiles.flatMap(([path]) => roots.flatMap((root) => {
    const destination = `${root}/${path.slice('assets/skills/'.length)}`
    return ancestors(destination).filter(parent => skillRoots.some(skill => parent === skill || parent.startsWith(`${skill}/`)))
  })))].sort(byteOrder)
  budget('Projected assets', assets.size, limits.assets)
  const creationCandidates = [...new Set([...cleanupCandidates, ...[...assets.keys()].flatMap(ancestors).filter(path => path === layout.runtimeRoot || path.startsWith(`${layout.runtimeRoot}/`))])].sort(byteOrder)
  return { config: { ...input.config }, source, identity: { version: index.version, bundle_sha256: sha256(source.index) }, integrations: selected, assets: [...assets.values()].sort((a, b) => byteOrder(a.path, b.path)), skillRoots, cleanupCandidates, creationCandidates, gitRequirements: { files, notesRoot: layout.notesRoot, localRoot: layout.localRoot } }
}

export function receipt(projection: Projection): Installation {
  return { format: 'agent-notes-install/2', ...projection.identity, integrations: projection.integrations, assets: projection.assets.map(({ path, kind, sha256 }) => ({ path, kind, sha256 })) }
}

export function validate(request: { kind: 'installation', source: Bundle, config: ProjectConfig, installation: Installation } | { kind: 'transition', before?: Projection, after: Projection, operation: 'install' | 'hosts set' | 'tool update' | 'repair' }): Projection {
  if (request.kind === 'installation') {
    const expected = project({ source: request.source, config: request.config, integrations: request.installation.integrations })
    if (!canonical(receipt(expected)).equals(canonical(request.installation)))
      throw new NotesError('INVALID_INSTALLATION', 'Receipt must exactly equal the corresponding source projection; ownership cannot be reconstructed by scanning.', undefined, 2)
    return expected
  }
  const { before, after, operation } = request
  // Recompute from raw material; a caller-built Projection is not authority.
  for (const endpoint of [before, after]) {
    if (!endpoint)
      continue
    const expected = project({ source: endpoint.source, config: endpoint.config, integrations: endpoint.integrations })
    if (!canonical(receipt(expected)).equals(canonical(receipt(endpoint))) || expected.assets.some((asset, i) => !asset.bytes.equals(endpoint.assets[i]?.bytes)))
      throw new NotesError('INVALID_INSTALLATION', 'Transition endpoint disagrees with its source projection.')
  }
  if (before && !canonical(before.config).equals(canonical(after.config)))
    throw new NotesError('CONFIG_CONFLICT', 'Management cannot rewrite project configuration.')
  if (!before && operation !== 'install')
    throw new NotesError('NOT_INSTALLED', 'Run install first.', undefined, 2)
  if (before) {
    const sameVersion = before.identity.version === after.identity.version
    const sameBundle = before.identity.bundle_sha256 === after.identity.bundle_sha256
    const sameSet = JSON.stringify(before.integrations) === JSON.stringify(after.integrations)
    if (sameVersion && !sameBundle)
      throw new NotesError('BUNDLE_MISMATCH', 'Same version with different bundle is not the same installation.', undefined, 2)
    if (operation !== 'tool update' && (!sameVersion || !sameBundle))
      throw new NotesError('TOOL_UPDATE_REQUIRED', 'Use tool update to change the locked version.', undefined, 2)
    if (operation !== 'hosts set' && !sameSet)
      throw new NotesError('HOSTS_SET_REQUIRED', 'Use hosts set to replace the full integration set.', undefined, 2)
  }
  return after
}
