import { lstatSync, readdirSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { NotesError } from '../notes/model'
import { boundedRead, limits } from './protocol'

export const defaultNotesRoot = '.agents/notes'

export interface NotesLayout {
  notesRoot: string
  configPath: string
  installPath: string
  runtimeRoot: string
  runtimeCli: string
  runtimeAssets: string
  localRoot: string
  lockPath: string
}

interface LayoutSnapshot {
  kind?: string
  repository?: { root: string }
  paths: () => string[]
  read: (path: string, maximum?: number) => Uint8Array | undefined
}

export function notesLayout(notesRoot = defaultNotesRoot): NotesLayout {
  return {
    notesRoot,
    configPath: `${notesRoot}/config.json`,
    installPath: `${notesRoot}/install.json`,
    runtimeRoot: `${notesRoot}/runtime`,
    runtimeCli: `${notesRoot}/runtime/cli.mjs`,
    runtimeAssets: `${notesRoot}/runtime/assets`,
    localRoot: `${notesRoot}/local`,
    lockPath: `${notesRoot}/local/write-lock`,
  }
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function object(bytes: Uint8Array | undefined): Record<string, unknown> | undefined {
  try {
    const value: unknown = bytes && JSON.parse(new TextDecoder().decode(bytes))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  }
  catch {
    return undefined
  }
}

function isNotesFile(bytes: Uint8Array | undefined): boolean {
  const format = object(bytes)?.format
  return typeof format === 'string' && /^agent-notes-(?:config|install)\//.test(format)
}

function choose(roots: Iterable<string>): NotesLayout | undefined {
  const candidates = [...new Set(roots)].sort((a, b) => a.length - b.length || a.localeCompare(b))
  const selected: string[] = []
  for (const candidate of candidates) {
    if (!selected.some(root => ['runtime', 'local'].some(directory => candidate === `${root}/${directory}` || candidate.startsWith(`${root}/${directory}/`))))
      selected.push(candidate)
  }
  if (selected.length > 1)
    throw new NotesError('ROOT_CONFLICT', `Multiple Agent Notes roots found: ${selected.sort().join(', ')}`, undefined, 2)
  return selected.length ? notesLayout(selected[0]) : undefined
}

/** Used before an installation has written any of its files. */
export function layoutFromPaths(paths: string[]): NotesLayout | undefined {
  return choose(paths.filter(path => path.endsWith('/config.json') && paths.includes(`${dirname(path)}/runtime/cli.mjs`)).map(path => dirname(path)))
}

export function layoutFromSnapshot(snapshot: LayoutSnapshot): NotesLayout | undefined
export function layoutFromSnapshot(snapshot: LayoutSnapshot, fallbackRoot: string): NotesLayout
export function layoutFromSnapshot(snapshot: LayoutSnapshot, fallbackRoot?: string): NotesLayout | undefined {
  const root = snapshot.kind === 'worktree' ? snapshot.repository?.root : undefined
  const checkoutMarkers = new Map<string, boolean>()
  const candidates = new Set<string>()
  const defaults = notesLayout()
  if (!root || !inNestedCheckout(root, defaultNotesRoot, checkoutMarkers)) {
    for (const path of [defaults.configPath, defaults.installPath]) {
      if (snapshot.read(path, limits.installation))
        candidates.add(defaultNotesRoot)
    }
  }
  for (const path of snapshot.paths()) {
    const isConfig = path.endsWith('/config.json')
    if (!isConfig && !path.endsWith('/install.json'))
      continue
    const directory = posix.dirname(path)
    if (root && inNestedCheckout(root, directory, checkoutMarkers))
      continue
    const bytes = snapshot.read(path, limits.installation)
    if (isNotesFile(bytes))
      candidates.add(directory)
    if (isConfig && bytes && snapshot.read(`${directory}/install.json`, limits.installation) && snapshot.read(`${directory}/runtime/cli.mjs`, limits.sourceFile))
      candidates.add(directory)
  }
  // The working tree can contain ignored configurations.
  if (root) {
    for (const candidate of diskRoots(root))
      candidates.add(candidate)
  }
  const layout = choose(candidates)
  if (layout || fallbackRoot === undefined)
    return layout
  if (root && inNestedCheckout(root, fallbackRoot, checkoutMarkers))
    throw new NotesError('ROOT_NOT_FOUND', 'The Notes directory belongs to a nested Git checkout.', fallbackRoot, 2)
  return notesLayout(fallbackRoot)
}

function isGitMarker(entry: { isFile: () => boolean, isDirectory: () => boolean }): boolean {
  return entry.isFile() || entry.isDirectory()
}

function inNestedCheckout(root: string, directory: string, cache: Map<string, boolean>): boolean {
  if (/^[a-z]:/i.test(directory))
    return false
  // Git can track files beneath directories the disk scan skips.
  let ancestor = root
  for (const segment of directory.split('/')) {
    if (!segment || segment === '.' || segment === '..' || segment.includes('\\'))
      return false // The snapshot reader diagnoses unsupported paths.
    ancestor = join(ancestor, segment)
    let marker = cache.get(ancestor)
    if (marker === undefined) {
      if (!lstatSync(ancestor, { throwIfNoEntry: false })?.isDirectory())
        return false
      const entry = lstatSync(join(ancestor, '.git'), { throwIfNoEntry: false })
      marker = entry !== undefined && isGitMarker(entry)
      cache.set(ancestor, marker)
    }
    if (marker)
      return true
  }
  return false
}

function fileObject(directory: string, name: string): Record<string, unknown> | undefined {
  try {
    const full = join(directory, name)
    if (!lstatSync(full).isFile())
      return undefined
    return object(boundedRead(full, limits.installation))
  }
  catch (error) {
    if (!missing(error))
      throw error
    return undefined
  }
}

function hasFile(directory: string, path: string): boolean {
  try {
    return lstatSync(join(directory, path)).isFile()
  }
  catch (error) {
    if (!missing(error))
      throw error
    return false
  }
}

function diskRoots(root: string): string[] {
  const roots: string[] = []
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
    const local = relative(root, directory).split('\\').join('/')
    if (local && entries.some(entry => entry.name === '.git' && isGitMarker(entry)))
      return
    const config = entries.find(entry => entry.name === 'config.json')
    const install = entries.find(entry => entry.name === 'install.json')
    const format = config?.isFile() ? fileObject(directory, 'config.json')?.format : undefined
    const installed = install?.isFile() ? fileObject(directory, 'install.json')?.format : undefined
    const lock = entries.some(entry => entry.name === 'local' && entry.isDirectory()) && (() => {
      try {
        return lstatSync(join(directory, 'local/write-lock')).isDirectory()
      }
      catch (error) {
        if (!missing(error))
          throw error
        return false
      }
    })()
    const complete = config?.isFile() && install?.isFile() && hasFile(directory, 'runtime/cli.mjs')
    const recognized = local && ((local === defaultNotesRoot && (config || install))
      || (typeof format === 'string' && format.startsWith('agent-notes-config/'))
      || (typeof installed === 'string' && installed.startsWith('agent-notes-install/')) || complete || lock)
    if (recognized)
      roots.push(local)
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules'
        || (recognized && ['runtime', 'local'].includes(entry.name))) {
        continue
      }
      walk(join(directory, entry.name))
    }
  }
  walk(resolve(root))
  return roots
}

export function layoutFromDisk(root: string): NotesLayout | undefined {
  return choose(diskRoots(root))
}

export function localNotesLayout(root: string): NotesLayout | undefined {
  return layoutFromDisk(root) ?? (inNestedCheckout(root, defaultNotesRoot, new Map()) ? undefined : notesLayout())
}

/** Infer the project boundary from the installed executable, including custom-depth Notes roots. */
export function projectFromRuntime(executable: string): { root: string, layout: NotesLayout } | undefined {
  if (!executable.replaceAll('\\', '/').endsWith('/runtime/cli.mjs'))
    return undefined
  const notesDirectory = dirname(dirname(resolve(executable)))
  const config = fileObject(notesDirectory, 'config.json')
  const installation = fileObject(notesDirectory, 'install.json')
  const assets = Array.isArray(installation?.assets) ? installation.assets : []
  const runtimeAsset = assets.find((asset): asset is { path: string } => Boolean(asset && typeof asset === 'object' && 'path' in asset && typeof asset.path === 'string' && asset.path.endsWith('/runtime/cli.mjs')))
  const candidates = [config?.notes_dir, runtimeAsset?.path.slice(0, -'/runtime/cli.mjs'.length)]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate || candidate.includes('\\') || candidate.startsWith('/')
      || candidate.split('/').some(part => !part || part === '.' || part === '..')) {
      continue
    }
    const root = resolve(notesDirectory, ...candidate.split('/').map(() => '..'))
    if (resolve(root, candidate) === notesDirectory)
      return { root, layout: notesLayout(candidate) }
  }
  return undefined
}
