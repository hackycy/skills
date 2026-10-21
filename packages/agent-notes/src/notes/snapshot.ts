import type { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { NotesError } from './model'

interface Entry { mode: string, oid?: string }
export type SnapshotKind = 'worktree' | 'index' | 'commit'

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function safePath(path: string): boolean {
  return Boolean(path) && !isAbsolute(path) && !/^[A-Z]:/i.test(path)
    && !path.includes('\\') && [...path].every(character => character.charCodeAt(0) >= 32)
    && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function git(root: string, args: string[], encoding: 'utf8'): string
function git(root: string, args: string[]): Buffer
function git(root: string, args: string[], encoding?: 'utf8'): string | Buffer {
  return execFileSync('git', ['-C', root, ...args], {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
}

export function findRoot(explicit: string | undefined, cwd: string): string {
  if (explicit)
    return realpathSync(resolve(cwd, explicit))
  let directory = realpathSync(cwd)
  while (true) {
    try {
      const files = ['.agent-notes/config.json', '.agent-notes/install.json', '.agent-notes/local/write-lock']
      if (files.some((path) => {
        try {
          lstatSync(join(directory, path))
          return true
        }
        catch (error) {
          if (!missing(error))
            throw error
          return false
        }
      })) {
        return directory
      }
    }
    catch (error) {
      if (!missing(error))
        throw error
    }
    const parent = dirname(directory)
    if (parent === directory)
      throw new NotesError('ROOT_NOT_FOUND', 'No installation found. Run init with --target, or pass --root <project>.', undefined, 2)
    directory = parent
  }
}

export class Repository {
  readonly prefix: string
  readonly available: boolean

  constructor(readonly root: string) {
    try {
      this.prefix = git(root, ['rev-parse', '--show-prefix'], 'utf8').trimEnd()
      this.available = true
    }
    catch {
      this.prefix = ''
      // Distinguish a plain directory from a broken or inaccessible Git repository.
      let directory = root
      while (true) {
        try {
          lstatSync(join(directory, '.git'))
          throw new NotesError('GIT_ERROR', 'Cannot read the Git repository.', directory)
        }
        catch (error) {
          if (!missing(error))
            throw error
        }
        const parent = dirname(directory)
        if (directory === parent)
          break
        directory = parent
      }
      this.available = false
    }
  }

  revision(ref: string, required = true): string | undefined {
    if (this.available) {
      try {
        return git(this.root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], 'utf8').trim()
      }
      catch {
        // An unborn HEAD is the only implicit missing baseline we accept.
        if (!required && ref === 'HEAD') {
          try {
            const branch = git(this.root, ['symbolic-ref', '-q', 'HEAD'], 'utf8').trim()
            const refs = git(this.root, ['for-each-ref', '--format=%(refname)', branch], 'utf8').trim()
            if (!refs)
              return undefined
          }
          catch {}
        }
      }
    }
    else if (!required) {
      return undefined
    }
    throw new NotesError('BASE_NOT_FOUND', `Cannot resolve commit: ${ref}`, undefined, 2)
  }

  snapshot(kind: SnapshotKind, revision?: string): Snapshot {
    if (kind !== 'worktree' && !this.available)
      throw new NotesError('GIT_REQUIRED', `${kind} requires a Git repository.`, undefined, 2)
    const entries = new Map<string, Entry>()
    if (kind === 'commit') {
      if (!revision)
        throw new NotesError('INVALID_INPUT', 'A commit snapshot requires a resolved revision.', undefined, 2)
      const records = git(this.root, ['ls-tree', '-rz', '--full-tree', revision], 'utf8').split('\0').filter(Boolean)
      for (const record of records) {
        const tab = record.indexOf('\t')
        const [mode, , oid] = record.slice(0, tab).split(' ')
        const path = record.slice(tab + 1)
        if (path.startsWith(this.prefix))
          entries.set(path.slice(this.prefix.length), { mode, oid })
      }
    }
    else if (this.available) {
      const staged = git(this.root, ['ls-files', '--stage', '-z'], 'utf8').split('\0').filter(Boolean)
      for (const record of staged) {
        const tab = record.indexOf('\t')
        const [mode, oid, stage] = record.slice(0, tab).split(' ')
        const path = record.slice(tab + 1)
        if (stage !== '0')
          throw new NotesError('UNMERGED_INDEX', 'Resolve Git conflicts before checking Notes.', path)
        entries.set(path, { mode, oid: kind === 'index' ? oid : undefined })
      }
      if (kind === 'worktree') {
        const untracked = git(this.root, ['ls-files', '--others', '--exclude-standard', '-z'], 'utf8').split('\0').filter(Boolean)
        for (const path of untracked)
          entries.set(path, { mode: '100644' })
      }
    }
    const snapshot = new Snapshot(this, kind, entries, revision)
    if (kind === 'worktree' && !this.available)
      snapshot.includeDirectory('')
    return snapshot
  }

  blob(oid: string): Buffer {
    return git(this.root, ['cat-file', 'blob', oid])
  }

  changedPaths(kind: SnapshotKind, base: string, head?: string): string[] {
    const selection = kind === 'index' ? ['--cached', base] : kind === 'commit' ? [base, head!] : [base]
    return git(this.root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--relative', '--name-only', '-z', ...selection, '--', '.'], 'utf8').split('\0').filter(Boolean)
  }
}

export class Snapshot {
  private readonly cache = new Map<string, Buffer | undefined>()

  constructor(
    readonly repository: Repository,
    readonly kind: SnapshotKind,
    readonly entries: Map<string, Entry>,
    readonly revision?: string,
  ) {}

  private localPath(path: string): string | undefined {
    if (!safePath(path))
      throw new NotesError('UNSAFE_PATH', 'Expected a project-relative path without traversal.', path)
    let absolute = this.repository.root
    for (const segment of path.split('/')) {
      absolute = join(absolute, segment)
      try {
        if (lstatSync(absolute).isSymbolicLink())
          throw new NotesError('SYMLINK_NOT_ALLOWED', 'Governed files and reference targets must not traverse symlinks.', path)
      }
      catch (error) {
        if (missing(error))
          return undefined
        throw error
      }
    }
    return absolute
  }

  includeDirectory(path: string): void {
    if (this.kind !== 'worktree')
      return
    const absolute = path ? this.localPath(path) : this.repository.root
    if (!absolute)
      return
    const walk = (directory: string): void => {
      for (const child of readdirSync(directory, { withFileTypes: true })) {
        if (child.name === '.git' || child.name === 'node_modules')
          continue
        const full = join(directory, child.name)
        const local = relative(this.repository.root, full).split('\u005C').join('/')
        if (local === '.agent-notes/runtime' || local === '.agent-notes/local')
          continue
        if (child.isDirectory())
          walk(full)
        else
          this.entries.set(local, { mode: child.isSymbolicLink() ? '120000' : '100644' })
      }
    }
    walk(absolute)
  }

  read(path: string): Buffer | undefined {
    if (!safePath(path))
      throw new NotesError('UNSAFE_PATH', 'Path escapes the project or uses unsupported separators.', path)
    if (this.cache.has(path))
      return this.cache.get(path)
    let bytes: Buffer | undefined
    if (this.kind === 'worktree') {
      const absolute = this.localPath(path)
      if (absolute) {
        if (!lstatSync(absolute).isFile())
          throw new NotesError('NOT_REGULAR_FILE', 'Expected a regular file.', path)
        bytes = readFileSync(absolute)
      }
    }
    else {
      const entry = this.entries.get(path)
      if (entry) {
        if (!['100644', '100755'].includes(entry.mode))
          throw new NotesError('SYMLINK_NOT_ALLOWED', 'Snapshot entry is not a regular file.', path)
        bytes = this.repository.blob(entry.oid!)
      }
    }
    this.cache.set(path, bytes)
    return bytes
  }

  exists(path: string): boolean {
    if (path === '.')
      return true
    if (!safePath(path))
      throw new NotesError('UNSAFE_PATH', 'Reference escapes the project.', path)
    if (this.kind === 'worktree')
      return this.localPath(path) !== undefined
    if (this.entries.has(path)) {
      const entry = this.entries.get(path)!
      if (entry.mode === '120000')
        throw new NotesError('SYMLINK_NOT_ALLOWED', 'Reference target is a symlink.', path)
      return true
    }
    return [...this.entries.keys()].some(candidate => candidate.startsWith(`${path}/`))
  }

  paths(): string[] {
    return [...this.entries.keys()].sort()
  }

  observations(): Map<string, string | null> {
    return new Map([...this.cache].map(([path, bytes]) => [path, bytes ? sha256(bytes) : null]))
  }

  overlay(changes: Map<string, Buffer | null>): Snapshot {
    return new OverlaySnapshot(this, changes)
  }
}

class OverlaySnapshot extends Snapshot {
  constructor(private readonly source: Snapshot, private readonly changes: Map<string, Buffer | null>) {
    super(source.repository, source.kind, new Map(source.entries), source.revision)
    for (const [path, bytes] of changes) {
      if (bytes === null)
        this.entries.delete(path)
      else
        this.entries.set(path, { mode: '100644' })
    }
  }

  override includeDirectory(): void {}

  override read(path: string): Buffer | undefined {
    return this.changes.has(path) ? this.changes.get(path) ?? undefined : this.source.read(path)
  }

  override exists(path: string): boolean {
    if (this.changes.has(path))
      return this.changes.get(path) !== null
    return [...this.changes].some(([candidate, bytes]) => bytes !== null && candidate.startsWith(`${path}/`)) || this.source.exists(path)
  }
}
