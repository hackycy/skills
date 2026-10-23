import type { Snapshot } from '../notes/snapshot'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { NotesError } from '../notes/model'
import { safePath, sha256 } from '../notes/snapshot'

const lockPath = '.agent-notes/local/write-lock'
interface Owner { pid: number, host: string, token: string }
interface JournalEntry { path: string, before: string | null, after: string | null, mode: number }
interface Journal { format: 'agent-notes-transaction/1', state: 'prepared' | 'committed', purpose?: 'distribution', directories?: string[], entries: JournalEntry[] }

export interface TransactionHooks {
  beforeCommit?: () => void
  afterStep?: (index: number) => void
}

// Recovery never trusts a manifest to authorize arbitrary project paths.
export function distributionPath(path: string): boolean {
  return safePath(path) && !path.split('/').some(part => part.toLowerCase() === '.git') && (
    ['.agent-notes/install.json', '.agent-notes/config.json', 'AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.gitignore', '.gitattributes'].includes(path)
    || path.startsWith('.agent-notes/runtime/')
    || /^(?:\.agents|\.claude)\/skills\/(?:agent-note|agent-note-maintenance)\//.test(path)
  )
}

function absent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function local(root: string, path: string): string {
  if (!safePath(path) || path.split('/').some(part => part.toLowerCase() === '.git'))
    throw new NotesError('UNSAFE_PATH', 'Transaction paths must remain inside the project and outside Git metadata.', path)
  let current = root
  for (const part of path.split('/')) {
    current = join(current, part)
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new NotesError('SYMLINK_NOT_ALLOWED', 'Transaction paths must not traverse symlinks.', path)
    }
    catch (error) {
      if (!absent(error))
        throw error
    }
  }
  return current
}

function bytesAt(root: string, path: string): Buffer | null {
  const full = local(root, path)
  try {
    if (!lstatSync(full).isFile())
      throw new NotesError('NOT_REGULAR_FILE', 'Expected a regular transaction file.', path)
    return readFileSync(full)
  }
  catch (error) {
    if (absent(error))
      return null
    throw error
  }
}

function syncDirectory(path: string): void {
  // Windows does not expose portable directory fsync through Node.
  if (process.platform === 'win32')
    return
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  }
  finally { closeSync(fd) }
}

function writeDurable(path: string, contents: Uint8Array | string, mode = 0o600): void {
  const fd = openSync(path, 'wx', mode)
  try {
    writeFileSync(fd, contents)
    fsyncSync(fd)
  }
  finally { closeSync(fd) }
}

function same(a: Buffer | null, b: Buffer | null): boolean {
  return a === null ? b === null : b !== null && a.equals(b)
}

function decode(value: string | null): Buffer | null {
  return value === null ? null : Buffer.from(value, 'base64')
}

function saveJournal(root: string, journal: Journal): void {
  const temporary = local(root, `${lockPath}/journal.next`)
  rmSync(temporary, { force: true })
  writeDurable(temporary, JSON.stringify(journal))
  renameSync(temporary, local(root, `${lockPath}/journal.json`))
  syncDirectory(local(root, lockPath))
}

function replace(root: string, path: string, bytes: Buffer | null, mode: number): void {
  const full = local(root, path)
  if (bytes === null) {
    rmSync(full)
    syncDirectory(dirname(full))
    return
  }
  mkdirSync(dirname(full), { recursive: true })
  // Staging belongs to the journal; interrupted staging never becomes project content.
  const staged = local(root, `${lockPath}/replacement`)
  rmSync(staged, { force: true })
  writeDurable(staged, bytes, mode)
  local(root, path)
  renameSync(staged, full)
  syncDirectory(dirname(full))
}

function rollback(root: string, journal: Journal): void {
  for (const entry of [...journal.entries].reverse()) {
    const current = bytesAt(root, entry.path)
    const before = decode(entry.before)
    const after = decode(entry.after)
    if (!same(current, before) && !same(current, after))
      throw new NotesError('RECOVERY_CONFLICT', `File changed outside this transaction. Preserve the edit and reconcile it with ${lockPath}/journal.json before retrying --recover.`, entry.path)
    if (!same(current, before))
      replace(root, entry.path, before, entry.mode)
  }
  for (const path of [...(journal.directories ?? [])].sort((a, b) => b.length - a.length)) {
    try {
      rmdirSync(local(root, path))
    }
    catch (error) {
      if (!absent(error) && !(error instanceof Error && 'code' in error && ['ENOTEMPTY', 'EEXIST'].includes(String(error.code))))
        throw error
    }
  }
}

function ownerAt(root: string): Owner | undefined {
  const bytes = bytesAt(root, `${lockPath}/owner.json`)
  if (!bytes)
    return undefined
  try {
    const owner = JSON.parse(bytes.toString('utf8')) as Owner
    if (!Number.isInteger(owner.pid) || owner.pid < 1 || typeof owner.host !== 'string' || typeof owner.token !== 'string')
      return undefined
    return owner
  }
  catch { return undefined }
}

function alive(owner: Owner): boolean {
  if (owner.host !== hostname())
    return true
  try {
    process.kill(owner.pid, 0)
    return true
  }
  catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
  }
}

export function assertNoTransaction(root: string): void {
  const full = local(root, lockPath)
  if (!existsSync(full))
    return
  const owner = ownerAt(root)
  if (owner && alive(owner))
    throw new NotesError('WRITE_BUSY', `A writer owns the project lock (PID ${owner.pid}, host ${owner.host}).`, lockPath)
  throw new NotesError('RECOVERY_REQUIRED', 'An interrupted transaction exists. Run a write command with --recover to roll back before retrying; never discard its journal.', lockPath)
}

function recoveryOwner(root: string): Owner {
  const owner = ownerAt(root)
  if (!owner)
    throw new NotesError('RECOVERY_CONFLICT', 'Lock ownership is unreadable. Inspect the lock and journal before manual recovery; no files were changed.', lockPath)
  if (alive(owner))
    throw new NotesError('WRITE_BUSY', 'Cannot recover a live or remote writer’s transaction.', lockPath)
  return owner
}

function readJournal(root: string, bytes: Buffer): Journal {
  let journal: Journal
  try {
    journal = JSON.parse(bytes.toString('utf8')) as Journal
  }
  catch { throw new NotesError('RECOVERY_CONFLICT', 'Unreadable transaction journal; preserve it for manual recovery.', lockPath) }
  if (!journal || journal.format !== 'agent-notes-transaction/1' || !['prepared', 'committed'].includes(journal.state) || !Array.isArray(journal.entries)
    || (journal.purpose !== undefined && journal.purpose !== 'distribution')) {
    throw new NotesError('RECOVERY_CONFLICT', 'Unknown transaction journal; preserve it for manual recovery.', lockPath)
  }
  const seen = new Set<string>()
  for (const entry of journal.entries) {
    if (!entry || typeof entry.path !== 'string' || !safePath(entry.path) || seen.has(entry.path)
      || (journal.purpose === 'distribution'
        ? !distributionPath(entry.path)
        : entry.path.startsWith('.agent-notes/local/') || entry.path.startsWith('.agent-notes/runtime/')
          || (!/\.md$/i.test(entry.path) && !entry.path.endsWith('/archived/manifest.json')))
        || ![entry.before, entry.after].every(value => value === null || (typeof value === 'string' && Buffer.from(value, 'base64').toString('base64') === value))
        || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) {
      throw new NotesError('RECOVERY_CONFLICT', 'Invalid transaction entry; no automatic recovery is safe.', lockPath)
    }
    local(root, entry.path)
    seen.add(entry.path)
  }
  if (journal.directories !== undefined && (!Array.isArray(journal.directories)
    || journal.directories.some(path => typeof path !== 'string' || !safePath(path)
      || !journal.entries.some(entry => entry.path.startsWith(`${path}/`))))) {
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid created-directory inventory.', lockPath)
  }
  return journal
}

function recoveryEndpoints(root: string, journal: Journal): Map<string, Buffer | null> {
  const projected = new Map<string, Buffer | null>()
  for (const entry of journal.entries) {
    const current = bytesAt(root, entry.path)
    const before = decode(entry.before)
    const after = decode(entry.after)
    if (journal.state === 'prepared' ? !same(current, before) && !same(current, after) : !same(current, after))
      throw new NotesError('RECOVERY_CONFLICT', 'File changed outside this transaction. Preserve the edit and reconcile it with the journal before retrying --recover.', entry.path)
    projected.set(entry.path, journal.state === 'prepared' ? before : after)
  }
  return projected
}

/** Inspect recovery without acquiring a marker, modifying files or cleaning the lock. */
export function recoveryView(source: Snapshot): { source: Snapshot, verify: () => void } {
  const root = source.repository.root
  const full = local(root, lockPath)
  if (!existsSync(full)) {
    return { source, verify: () => {
      assertNoTransaction(root)
      verifyObservations(source, source.repository.snapshot('worktree'))
    } }
  }
  recoveryOwner(root)
  const marker = local(root, `${lockPath}/recovering`)
  if (existsSync(marker))
    throw new NotesError('RECOVERY_CONFLICT', 'Another recovery is active or was interrupted; inspect the recovery marker before retrying.', lockPath)
  // Observe raw owner/journal and every live endpoint, not only projected configuration.
  source.read(`${lockPath}/owner.json`)
  const bytes = source.read(`${lockPath}/journal.json`)
  const journal = bytes ? readJournal(root, bytes) : undefined
  const overlay = journal ? recoveryEndpoints(root, journal) : new Map<string, Buffer | null>()
  for (const path of overlay.keys())
    source.read(path)
  return { source: source.overlay(overlay), verify: () => {
    if (!existsSync(full) || existsSync(marker))
      throw new NotesError('CONCURRENT_CHANGE', 'Transaction changed while collecting initialization input; retry.', lockPath)
    verifyObservations(source, source.repository.snapshot('worktree'))
    recoveryOwner(root)
  } }
}

export function recoverTransaction(root: string): boolean {
  const full = local(root, lockPath)
  if (!existsSync(full))
    return false
  const owner = recoveryOwner(root)
  const marker = local(root, `${lockPath}/recovering`)
  try {
    mkdirSync(marker)
  }
  catch { throw new NotesError('RECOVERY_CONFLICT', 'Another recovery is active or was interrupted; inspect the recovery marker before retrying.', lockPath) }
  try {
    if (ownerAt(root)?.token !== owner.token)
      throw new NotesError('WRITE_BUSY', 'Lock ownership changed before recovery.', lockPath)
    const bytes = bytesAt(root, `${lockPath}/journal.json`)
    if (bytes) {
      const journal = readJournal(root, bytes)
      recoveryEndpoints(root, journal)
      if (journal.state === 'prepared') {
        rollback(root, journal)
      }
      else {
        for (const entry of journal.entries) {
          if (!same(bytesAt(root, entry.path), decode(entry.after)))
            throw new NotesError('RECOVERY_CONFLICT', 'Committed transaction was subsequently edited. Preserve its journal and reconcile the named file.', entry.path)
        }
      }
    }
    rmSync(full, { recursive: true })
    return true
  }
  finally {
    if (existsSync(marker))
      rmSync(marker, { recursive: true })
  }
}

/** The caller validates a complete overlay before requesting this filesystem commit. */
export function commitTransaction(source: Snapshot, changes: Map<string, Buffer | null>, verify: (applied: boolean) => void, hooks: TransactionHooks = {}, purpose?: 'distribution'): void {
  const root = source.repository.root
  assertNoTransaction(root)
  const full = local(root, lockPath)
  mkdirSync(dirname(full), { recursive: true })
  try {
    mkdirSync(full)
  }
  catch { throw new NotesError('WRITE_BUSY', 'Another writer acquired the project lock.', lockPath) }
  let journal: Journal | undefined
  let retain = false
  try {
    writeDurable(local(root, `${lockPath}/owner.json`), JSON.stringify({ pid: process.pid, host: hostname(), token: randomUUID() } satisfies Owner))
    syncDirectory(full)
    hooks.beforeCommit?.()
    verify(false)
    const entries: JournalEntry[] = [...changes].map(([path, after]) => {
      const before = source.read(path) ?? null
      if (!same(bytesAt(root, path), before))
        throw new NotesError('CONCURRENT_CHANGE', 'File changed since preflight; rerun with fresh hashes.', path)
      return { path, before: before?.toString('base64') ?? null, after: after?.toString('base64') ?? null, mode: before ? lstatSync(local(root, path)).mode & 0o777 : 0o644 }
    })
    if (purpose === 'distribution' && entries.some(entry => !distributionPath(entry.path)))
      throw new NotesError('UNSAFE_PATH', 'Installation transaction contains an unowned path.')
    const directories = new Set<string>()
    for (const entry of entries) {
      const parts = entry.path.split('/')
      for (let count = 1; count < parts.length; count++) {
        const parent = parts.slice(0, count).join('/')
        if (!existsSync(local(root, parent)))
          directories.add(parent)
      }
    }
    journal = { format: 'agent-notes-transaction/1', state: 'prepared', ...(purpose ? { purpose } : {}), directories: [...directories], entries }
    saveJournal(root, journal)
    for (const [index, entry] of entries.entries()) {
      if (!same(bytesAt(root, entry.path), decode(entry.before)))
        throw new NotesError('CONCURRENT_CHANGE', 'File changed during commit; rollback will preserve conflicting edits.', entry.path)
      replace(root, entry.path, decode(entry.after), entry.mode)
      hooks.afterStep?.(index)
    }
    for (const entry of entries) {
      if (!same(bytesAt(root, entry.path), decode(entry.after)))
        throw new NotesError('CONCURRENT_CHANGE', 'Committed bytes were changed by another editor.', entry.path)
    }
    verify(true)
    journal.state = 'committed'
    saveJournal(root, journal)
  }
  catch (error) {
    if (journal) {
      try {
        rollback(root, journal)
      }
      catch (recoveryError) {
        retain = true
        throw recoveryError
      }
    }
    throw error
  }
  finally {
    if (!retain)
      rmSync(full, { recursive: true })
  }
}

export function verifyObservations(source: Snapshot, fresh: Snapshot, applied = new Map<string, Buffer | null>()): void {
  for (const [path, expected] of source.observations()) {
    const bytes = fresh.read(path)
    const replacement = applied.get(path)
    const actualExpected = applied.has(path) ? replacement ? sha256(replacement) : null : expected
    if ((bytes ? sha256(bytes) : null) !== actualExpected)
      throw new NotesError('CONCURRENT_CHANGE', 'Input, runtime or referenced file changed since preflight; rerun.', path)
  }
}
