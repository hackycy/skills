import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { NotesError } from '../notes/model'

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
  read: (path: string) => Uint8Array | undefined
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
  catch { return undefined }
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

export function layoutFromSnapshot(snapshot: LayoutSnapshot): NotesLayout | undefined {
  const paths = new Set(snapshot.paths())
  const candidates = new Set<string>()
  const defaults = notesLayout()
  for (const path of [defaults.configPath, defaults.installPath]) {
    if (snapshot.read(path))
      candidates.add(defaultNotesRoot)
  }
  for (const path of paths) {
    if ((path.endsWith('/config.json') || path.endsWith('/install.json')) && isNotesFile(snapshot.read(path)))
      candidates.add(dirname(path))
    if (path.endsWith('/config.json') && snapshot.read(path) && snapshot.read(`${dirname(path)}/install.json`) && snapshot.read(`${dirname(path)}/runtime/cli.mjs`))
      candidates.add(dirname(path))
  }
  const found = choose(candidates)
  // Worktree configuration may be ignored by Git. Historical snapshots use only their own entries.
  return snapshot.kind === 'worktree' && snapshot.repository
    ? choose([...(found ? [found.notesRoot] : []), ...diskRoots(snapshot.repository.root)])
    : found
}

function fileObject(directory: string, name: string): Record<string, unknown> | undefined {
  try {
    const full = join(directory, name)
    if (!lstatSync(full).isFile())
      return undefined
    return object(readFileSync(full))
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
  const candidates: string[] = []
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
    const local = relative(root, directory).split('\\').join('/')
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
      candidates.push(local)
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules'
        || (recognized && ['runtime', 'local'].includes(entry.name))) {
        continue
      }
      walk(join(directory, entry.name))
    }
  }
  walk(resolve(root))
  return candidates
}

export function layoutFromDisk(root: string): NotesLayout | undefined {
  return choose(diskRoots(root))
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

/** A plain project has an installed route even when its tool files need repair. */
export function hasProjectRoute(root: string): boolean {
  for (const path of ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md']) {
    try {
      if (lstatSync(join(root, path)).isFile() && readFileSync(join(root, path), 'utf8').includes('<!-- agent-notes:begin -->'))
        return true
    }
    catch (error) {
      if (!missing(error))
        throw error
    }
  }
  return false
}
