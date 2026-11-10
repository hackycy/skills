import type { Buffer } from 'node:buffer'
import type { NotesLayout } from '../distribution/layout'
import type { Snapshot } from '../notes/snapshot'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { layoutFromDisk, layoutFromPaths, notesLayout } from '../distribution/layout'
import { assertPath, base64, boundedRead, budget, canonical, json, keys, limits } from '../distribution/protocol'
import { NotesError } from '../notes/model'
import { safePath, sha256 } from '../notes/snapshot'

interface Owner { pid: number, host: string, token: string }
export interface JournalEntry { path: string, before: string | null, after: string | null, mode: number }
export interface Journal { format: 'agent-notes-transaction/2', state: 'prepared' | 'committed', purpose: 'content' | 'distribution', directories: string[], cleanup: string[], entries: JournalEntry[], context: unknown }
export type JournalValidator = (journal: Journal, read: (path: string) => Buffer | undefined) => void
export interface DistributionTransaction { context: unknown, cleanup: string[], creationCandidates?: string[], validate: JournalValidator }

const recoveryReads = new WeakMap<Journal, Map<string, string | null>>()
function verifyRecoveryReads(root: string, journal: Journal): void {
  for (const [path, expected] of recoveryReads.get(journal) ?? []) {
    const bytes = bytesAt(root, path)
    if ((bytes ? sha256(bytes) : null) !== expected)
      throw new NotesError('RECOVERY_CONFLICT', 'Unchanged source or control file changed during recovery.', path)
  }
}

export interface TransactionHooks {
  beforeCommit?: () => void
  afterStep?: (index: number) => void
  afterCommit?: () => void
}

// Recovery never trusts a manifest to authorize arbitrary project paths.
function transactionLayout(root: string): NotesLayout {
  return layoutFromDisk(root) ?? notesLayout()
}

function absent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function local(root: string, path: string): string {
  if (!safePath(path) || path.split('/').some(part => part.toLowerCase() === '.git'))
    throw new NotesError('UNSAFE_PATH', 'Transaction paths must remain inside the project and outside Git metadata.', path)
  assertPath(path)
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
    return boundedRead(full, path.endsWith('/journal.json') ? limits.journal : limits.endpoint)
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
  finally {
    closeSync(fd)
  }
}

function writeDurable(path: string, contents: Uint8Array | string, mode = 0o600): void {
  const fd = openSync(path, 'wx', mode)
  try {
    writeFileSync(fd, contents)
    fsyncSync(fd)
  }
  finally {
    closeSync(fd)
  }
}

function same(a: Buffer | null, b: Buffer | null): boolean {
  return a === null ? b === null : b !== null && a.equals(b)
}

function decode(value: string | null): Buffer | null {
  return value === null ? null : base64(value)
}

function saveJournal(root: string, journal: Journal, layout: NotesLayout): void {
  const temporary = local(root, `${layout.lockPath}/journal.next`)
  rmSync(temporary, { force: true })
  const bytes = canonical(journal)
  budget('Journal encoding', bytes.length, limits.journal)
  writeDurable(temporary, bytes)
  renameSync(temporary, local(root, `${layout.lockPath}/journal.json`))
  syncDirectory(local(root, layout.lockPath))
}

function replace(root: string, path: string, bytes: Buffer | null, mode: number, layout: NotesLayout): void {
  const full = local(root, path)
  if (bytes === null) {
    rmSync(full)
    syncDirectory(dirname(full))
    return
  }
  mkdirSync(dirname(full), { recursive: true })
  // Staging belongs to the journal; interrupted staging never becomes project content.
  const staged = local(root, `${layout.lockPath}/replacement`)
  rmSync(staged, { force: true })
  writeDurable(staged, bytes, mode)
  local(root, path)
  renameSync(staged, full)
  syncDirectory(dirname(full))
}

function rollback(root: string, journal: Journal, layout: NotesLayout, hooks: TransactionHooks = {}): void {
  for (const [index, entry] of [...journal.entries].reverse().entries()) {
    verifyRecoveryReads(root, journal)
    const current = bytesAt(root, entry.path)
    const before = decode(entry.before)
    const after = decode(entry.after)
    if (!same(current, before) && !same(current, after))
      throw new NotesError('RECOVERY_CONFLICT', `File changed outside this transaction. Preserve the edit and reconcile it with ${layout.lockPath}/journal.json before retrying --recover.`, entry.path)
    if (!same(current, before))
      replace(root, entry.path, before, entry.mode, layout)
    hooks.afterStep?.(index)
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

function cleanupDirectories(root: string, journal: Journal): void {
  for (const path of [...journal.cleanup].sort((a, b) => b.length - a.length)) {
    verifyRecoveryReads(root, journal)
    recoveryEndpoints(root, journal)
    try {
      rmdirSync(local(root, path))
    }
    catch (error) {
      if (!absent(error) && !(error instanceof Error && 'code' in error && ['ENOTEMPTY', 'EEXIST'].includes(String(error.code))))
        throw error
    }
  }
}

function ownerAt(root: string, layout: NotesLayout): Owner | undefined {
  const bytes = bytesAt(root, `${layout.lockPath}/owner.json`)
  if (!bytes)
    return undefined
  try {
    const owner = JSON.parse(bytes.toString('utf8')) as Owner
    if (!Number.isInteger(owner.pid) || owner.pid < 1 || typeof owner.host !== 'string' || typeof owner.token !== 'string')
      return undefined
    return owner
  }
  catch {
    return undefined
  }
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
  const layout = transactionLayout(root)
  const full = local(root, layout.lockPath)
  if (!existsSync(full))
    return
  const owner = ownerAt(root, layout)
  if (owner && alive(owner))
    throw new NotesError('WRITE_BUSY', `A writer owns the project lock (PID ${owner.pid}, host ${owner.host}).`, layout.lockPath)
  throw new NotesError('RECOVERY_REQUIRED', 'An interrupted transaction exists. Run a write command with --recover to roll back before retrying; never discard its journal.', layout.lockPath)
}

function recoveryOwner(root: string, layout: NotesLayout): Owner {
  const owner = ownerAt(root, layout)
  if (!owner)
    throw new NotesError('RECOVERY_CONFLICT', 'Lock ownership is unreadable. Inspect the lock and journal before manual recovery; no files were changed.', layout.lockPath)
  if (alive(owner))
    throw new NotesError('WRITE_BUSY', 'Cannot recover a live or remote writer’s transaction.', layout.lockPath)
  return owner
}

function readJournal(root: string, bytes: Buffer, layout: NotesLayout, validator?: JournalValidator): Journal {
  const journal = json(bytes, limits.journal, 'RECOVERY_CONFLICT') as Journal
  keys(journal, ['format', 'state', 'purpose', 'directories', 'cleanup', 'entries', 'context'], 'RECOVERY_CONFLICT')
  if (journal.format !== 'agent-notes-transaction/2' || !['prepared', 'committed'].includes(journal.state) || !['content', 'distribution'].includes(journal.purpose) || !Array.isArray(journal.entries) || !Array.isArray(journal.directories) || !Array.isArray(journal.cleanup))
    throw new NotesError('RECOVERY_CONFLICT', 'Unknown transaction protocol; preserve it for manual recovery.', layout.lockPath)
  budget('Journal entries', journal.entries.length, limits.entries)
  budget('Directory actions', journal.directories.length + journal.cleanup.length, limits.directories)
  let decoded = 0
  const seen = new Set<string>()
  for (const entry of journal.entries) {
    keys(entry, ['path', 'before', 'after', 'mode'], 'RECOVERY_CONFLICT')
    assertPath(entry.path)
    if (seen.has(entry.path) || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777)
      throw new NotesError('RECOVERY_CONFLICT', 'Duplicate or invalid transaction entry.')
    if (journal.purpose === 'content' && (entry.path.startsWith(`${layout.localRoot}/`) || entry.path.startsWith(`${layout.runtimeRoot}/`) || (!/\.md$/i.test(entry.path) && entry.path !== `${layout.notesRoot}/archived/manifest.json`)))
      throw new NotesError('RECOVERY_CONFLICT', 'Content transaction has an unauthorized endpoint.', entry.path)
    for (const value of [entry.before, entry.after]) {
      if (value !== null)
        decoded += base64(value, Math.min(limits.endpoint, limits.decoded - decoded)).length
      budget('Journal decoded endpoints', decoded, limits.decoded)
    }
    local(root, entry.path)
    seen.add(entry.path)
  }
  for (const paths of [journal.directories, journal.cleanup]) {
    if (new Set(paths).size !== paths.length)
      throw new NotesError('RECOVERY_CONFLICT', 'Duplicate directory action.')
    for (const path of paths) {
      assertPath(path)
      if (!journal.entries.some(entry => entry.path.startsWith(`${path}/`)))
        throw new NotesError('RECOVERY_CONFLICT', 'Unnecessary directory action.')
      local(root, path)
    }
  }
  if (journal.purpose === 'distribution') {
    if (!validator)
      throw new NotesError('RECOVERY_CONFLICT', 'Distribution recovery requires its trusted transition validator.')
    const observations = new Map<string, string | null>()
    validator(journal, (path) => {
      const bytes = bytesAt(root, path)
      observations.set(path, bytes ? sha256(bytes) : null)
      return bytes ?? undefined
    })
    recoveryReads.set(journal, observations)
  }
  else if (journal.context !== null || journal.cleanup.length) {
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid content transaction metadata.')
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
export function recoveryView(source: Snapshot, validator?: JournalValidator): { source: Snapshot, verify: () => void } {
  const root = source.repository.root
  const layout = transactionLayout(root)
  const full = local(root, layout.lockPath)
  if (!existsSync(full)) {
    return { source, verify: () => {
      assertNoTransaction(root)
      verifyObservations(source, source.repository.snapshot('worktree'))
    } }
  }
  recoveryOwner(root, layout)
  const marker = local(root, `${layout.lockPath}/recovering`)
  if (existsSync(marker))
    throw new NotesError('RECOVERY_CONFLICT', 'Another recovery is active or was interrupted; inspect the recovery marker before retrying.', layout.lockPath)
  // Observe raw owner/journal and every live endpoint, not only projected configuration.
  source.read(`${layout.lockPath}/owner.json`)
  const bytes = source.read(`${layout.lockPath}/journal.json`)
  const journal = bytes ? readJournal(root, bytes, layout, validator) : undefined
  const overlay = journal ? recoveryEndpoints(root, journal) : new Map<string, Buffer | null>()
  for (const path of overlay.keys())
    source.read(path)
  return { source: source.overlay(overlay), verify: () => {
    if (!existsSync(full) || existsSync(marker))
      throw new NotesError('CONCURRENT_CHANGE', 'Transaction changed while collecting initialization input; retry.', layout.lockPath)
    verifyObservations(source, source.repository.snapshot('worktree'))
    recoveryOwner(root, layout)
  } }
}

export function recoverTransaction(root: string, validator?: JournalValidator, hooks: TransactionHooks = {}): boolean {
  const layout = transactionLayout(root)
  const full = local(root, layout.lockPath)
  if (!existsSync(full))
    return false
  const owner = recoveryOwner(root, layout)
  const marker = local(root, `${layout.lockPath}/recovering`)
  try {
    mkdirSync(marker)
  }
  catch {
    throw new NotesError('RECOVERY_CONFLICT', 'Another recovery is active or was interrupted; inspect the recovery marker before retrying.', layout.lockPath)
  }
  try {
    if (ownerAt(root, layout)?.token !== owner.token)
      throw new NotesError('WRITE_BUSY', 'Lock ownership changed before recovery.', layout.lockPath)
    const bytes = bytesAt(root, `${layout.lockPath}/journal.json`)
    if (bytes) {
      const journal = readJournal(root, bytes, layout, validator)
      recoveryEndpoints(root, journal)
      if (journal.state === 'prepared') {
        rollback(root, journal, layout, hooks)
      }
      else {
        for (const entry of journal.entries) {
          if (!same(bytesAt(root, entry.path), decode(entry.after)))
            throw new NotesError('RECOVERY_CONFLICT', 'Committed transaction was subsequently edited. Preserve its journal and reconcile the named file.', entry.path)
        }
        cleanupDirectories(root, journal)
      }
      // Keep the original observations: reparsing here would silently accept a
      // source edit made during the final rollback step as a new baseline.
      verifyRecoveryReads(root, journal)
      for (const entry of journal.entries) {
        if (!same(bytesAt(root, entry.path), decode(entry[journal.state === 'prepared' ? 'before' : 'after'])))
          throw new NotesError('RECOVERY_CONFLICT', 'File changed during recovery; preserve the edit and journal.', entry.path)
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

/** Validate serialized recovery evidence before locks, backups or dry-run return. */
export function preflightTransaction(source: Snapshot, changes: Map<string, Buffer | null>, distribution: DistributionTransaction): void {
  const root = source.repository.root
  const layout = layoutFromDisk(root) ?? layoutFromPaths([...changes.keys()]) ?? notesLayout()
  budget('Journal entries', changes.size, limits.entries)
  let total = 0
  const entries: JournalEntry[] = [...changes].map(([path, after]) => {
    const before = source.read(path, limits.endpoint)
    if (after)
      budget('After endpoint', after.length, limits.endpoint)
    total += (before?.length ?? 0) + (after?.length ?? 0)
    budget('Journal decoded endpoints', total, limits.decoded)
    return { path, before: before?.toString('base64') ?? null, after: after?.toString('base64') ?? null, mode: 0o644 }
  })
  const parents = [...new Set(entries.flatMap(entry => entry.path.split('/').slice(0, -1).map((_, i) => entry.path.split('/').slice(0, i + 1).join('/'))))].filter(path => (!distribution.creationCandidates || distribution.creationCandidates.includes(path)) && !existsSync(local(root, path)))
  readJournal(root, canonical({ format: 'agent-notes-transaction/2', state: 'prepared', purpose: 'distribution', directories: parents, cleanup: distribution.cleanup, entries, context: distribution.context }), layout, distribution.validate)
}

/** The caller validates a complete overlay before requesting this filesystem commit. */
export function commitTransaction(source: Snapshot, changes: Map<string, Buffer | null>, verify: (applied: boolean) => void, hooks: TransactionHooks = {}, distribution?: DistributionTransaction): void {
  const root = source.repository.root
  const layout = layoutFromDisk(root) ?? layoutFromPaths([...changes.keys()]) ?? notesLayout()
  assertNoTransaction(root)
  if (distribution)
    preflightTransaction(source, changes, distribution)
  const full = local(root, layout.lockPath)
  mkdirSync(dirname(full), { recursive: true })
  try {
    mkdirSync(full)
  }
  catch {
    throw new NotesError('WRITE_BUSY', 'Another writer acquired the project lock.', layout.lockPath)
  }
  let journal: Journal | undefined
  let retain = false
  try {
    writeDurable(local(root, `${layout.lockPath}/owner.json`), JSON.stringify({ pid: process.pid, host: hostname(), token: randomUUID() } satisfies Owner))
    syncDirectory(full)
    hooks.beforeCommit?.()
    verify(false)
    budget('Journal entries', changes.size, limits.entries)
    let decoded = 0
    const entries: JournalEntry[] = [...changes].map(([path, after]) => {
      const before = source.read(path, limits.endpoint) ?? null
      if (after)
        budget('After endpoint', after.length, limits.endpoint)
      decoded += (before?.length ?? 0) + (after?.length ?? 0)
      budget('Journal decoded endpoints', decoded, limits.decoded)
      if (!same(bytesAt(root, path), before))
        throw new NotesError('CONCURRENT_CHANGE', 'File changed since preflight; rerun with fresh hashes.', path)
      return { path, before: before?.toString('base64') ?? null, after: after?.toString('base64') ?? null, mode: before ? lstatSync(local(root, path)).mode & 0o777 : 0o644 }
    })
    const directories = new Set<string>()
    for (const entry of entries) {
      const parts = entry.path.split('/')
      for (let count = 1; count < parts.length; count++) {
        const parent = parts.slice(0, count).join('/')
        if ((!distribution?.creationCandidates || distribution.creationCandidates.includes(parent)) && !existsSync(local(root, parent)))
          directories.add(parent)
      }
    }
    const proposed: Journal = { format: 'agent-notes-transaction/2', state: 'prepared', purpose: distribution ? 'distribution' : 'content', directories: [...directories], cleanup: distribution?.cleanup ?? [], entries, context: distribution?.context ?? null }
    readJournal(root, canonical(proposed), layout, distribution?.validate)
    saveJournal(root, proposed, layout)
    journal = proposed
    for (const [index, entry] of entries.entries()) {
      if (!same(bytesAt(root, entry.path), decode(entry.before)))
        throw new NotesError('CONCURRENT_CHANGE', 'File changed during commit; rollback will preserve conflicting edits.', entry.path)
      verifyRecoveryReads(root, journal)
      replace(root, entry.path, decode(entry.after), entry.mode, layout)
      hooks.afterStep?.(index)
    }
    for (const entry of entries) {
      if (!same(bytesAt(root, entry.path), decode(entry.after)))
        throw new NotesError('CONCURRENT_CHANGE', 'Committed bytes were changed by another editor.', entry.path)
    }
    verify(true)
    journal.state = 'committed'
    saveJournal(root, journal, layout)
    hooks.afterCommit?.()
    cleanupDirectories(root, journal)
  }
  catch (error) {
    if (journal?.state === 'committed') {
      retain = true
      throw error
    }
    if (journal) {
      try {
        rollback(root, journal, layout)
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
    const bytes = fresh.read(path, limits.endpoint)
    const replacement = applied.get(path)
    const actualExpected = applied.has(path) ? replacement ? sha256(replacement) : null : expected
    if ((bytes ? sha256(bytes) : null) !== actualExpected)
      throw new NotesError('CONCURRENT_CHANGE', 'Input, runtime or referenced file changed since preflight; rerun.', path)
  }
}
