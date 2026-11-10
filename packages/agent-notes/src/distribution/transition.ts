import type { ProjectConfig } from '../notes/model'
import type { Journal, JournalValidator } from '../workflow/transaction'
import type { Bundle } from './bundle'
import type { Installation } from './manifest'
import type { Projection } from './projection'
import { Buffer } from 'node:buffer'
import { NotesError } from '../notes/model'
import { sha256 } from '../notes/snapshot'
import { parseSource } from './bundle'
import { notesLayout } from './layout'
import { block, entryText, parseInstallation, replaceBlock } from './manifest'
import { receipt, validate } from './projection'
import { base64, budget, byteOrder, canonical, hashPattern, keys, limits } from './protocol'

export type Operation = 'install' | 'hosts set' | 'tool update' | 'repair'
export interface TransitionContext {
  operation: Operation
  config: ProjectConfig
  before: Installation | null
  after: Installation
  beforeIndex: string | null
  afterIndex: string
  supplemental: Record<string, string>
}
export type ReadEndpoint = (path: string) => Buffer | undefined
const equal = (a: Buffer | null | undefined, b: Buffer | null | undefined): boolean => a == null ? b == null : b != null && a.equals(b)

/** Complete plan, including controls; used again independently during recovery. */
export function planFiles(before: Projection | undefined, after: Projection, config: ProjectConfig, read: ReadEndpoint): Map<string, Buffer | null> {
  const layout = notesLayout(config.notes_dir)
  const changes = new Map<string, Buffer | null>()
  const old = new Map(before?.assets.map(asset => [asset.path, asset]))
  const desired = new Set(after.assets.map(asset => asset.path))
  for (const asset of after.assets) {
    const bytes = read(asset.path)
    if (!old.has(asset.path) && (asset.kind === 'file' ? bytes !== undefined : block(entryText(bytes, asset.path), asset.path)))
      throw new NotesError('UNOWNED_ASSET', 'Refusing to take ownership of an existing file or block.', asset.path)
    let replacement = asset.bytes
    if (asset.kind === 'block') {
      const text = entryText(bytes, asset.path)
      replacement = block(text, asset.path)?.text.replace(/\r\n/g, '\n') === asset.bytes.toString('utf8') ? bytes! : Buffer.from(replaceBlock(text, asset.path, asset.bytes.toString('utf8')))
    }
    if (!equal(bytes, replacement))
      changes.set(asset.path, replacement)
  }
  for (const asset of before?.assets ?? []) {
    if (!desired.has(asset.path) && read(asset.path)) {
      if (asset.kind !== 'file')
        throw new NotesError('INVALID_INSTALLATION', 'Git blocks cannot be removed.')
      changes.set(asset.path, null)
    }
  }
  if (!read(layout.configPath))
    changes.set(layout.configPath, canonical(config))
  const manifest = canonical(receipt(after))
  if (!equal(read(layout.installPath), manifest))
    changes.set(layout.installPath, manifest)
  return changes
}

export function transitionContext(operation: Operation, config: ProjectConfig, before: Projection | undefined, after: Projection, changes: Map<string, Buffer | null>, read: ReadEndpoint): TransitionContext {
  const supplemental: Record<string, string> = {}
  for (const projection of [before, after]) {
    if (!projection)
      continue
    const index = parseSource(projection.source.index)
    const layout = notesLayout(config.notes_dir)
    for (const file of index.files) {
      const path = `${layout.runtimeRoot}/${file.path}`
      const endpoint = projection === after ? changes.has(path) ? changes.get(path) : read(path) : read(path)
      if (!endpoint || sha256(endpoint) !== file.sha256)
        supplemental[file.sha256] = projection.source.files.get(file.path)!.toString('base64')
    }
  }
  return { operation, config, before: before ? receipt(before) : null, after: receipt(after), beforeIndex: before?.source.index.toString('base64') ?? null, afterIndex: after.source.index.toString('base64'), supplemental }
}

export const validateJournal: JournalValidator = (journal: Journal, readLive: ReadEndpoint): void => {
  const context = journal.context as TransitionContext
  keys(context, ['operation', 'config', 'before', 'after', 'beforeIndex', 'afterIndex', 'supplemental'], 'RECOVERY_CONFLICT')
  if (!['install', 'hosts set', 'tool update', 'repair'].includes(context.operation))
    throw new NotesError('RECOVERY_CONFLICT', 'Unknown management intention.')
  keys(context.config, ['format', 'notes_dir', 'language'], 'RECOVERY_CONFLICT')
  if (context.config.format !== 'agent-notes-config/1' || !['zh-CN', 'en'].includes(context.config.language))
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid project configuration.')
  const layout = notesLayout(context.config.notes_dir)
  const entries = new Map(journal.entries.map(entry => [entry.path, entry]))
  const endpoint = (side: 'before' | 'after'): ReadEndpoint => path => entries.has(path) ? entries.get(path)![side] === null ? undefined : base64(entries.get(path)![side]) : readLive(path)
  const beforeView = endpoint('before')
  const afterView = endpoint('after')
  let decoded = journal.entries.reduce((sum, entry) => sum + (entry.before === null ? 0 : base64(entry.before).length) + (entry.after === null ? 0 : base64(entry.after).length), 0) + canonical({ operation: context.operation, config: context.config, before: context.before, after: context.after }).length
  const count = (bytes: Buffer): Buffer => {
    decoded += bytes.length
    budget('Journal logical evidence', decoded, limits.decoded)
    return bytes
  }
  if (!context.supplemental || typeof context.supplemental !== 'object' || Array.isArray(context.supplemental))
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid supplemental sources.')
  const evidence = new Map<string, Buffer>()
  let evidenceBytes = decoded
  budget('Supplemental files', Object.keys(context.supplemental).length, limits.sources * 2)
  for (const [hash, encoded] of Object.entries(context.supplemental)) {
    if (!hashPattern.test(hash))
      throw new NotesError('RECOVERY_CONFLICT', 'Invalid supplemental hash.')
    const bytes = base64(encoded, Math.min(limits.sourceFile, limits.decoded - evidenceBytes))
    evidenceBytes += bytes.length
    if (sha256(bytes) !== hash)
      throw new NotesError('RECOVERY_CONFLICT', 'Supplemental source hash mismatch.')
    evidence.set(hash, bytes)
  }
  const used = new Set<string>()
  const rebuild = (encoded: string, read: ReadEndpoint): Bundle => {
    const indexBytes = count(base64(encoded, Math.min(limits.index, limits.decoded - decoded)))
    budget('Source index', indexBytes.length, limits.index)
    const index = parseSource(indexBytes)
    if (index.notes_dir !== layout.notesRoot)
      throw new NotesError('RECOVERY_CONFLICT', 'Journal source must be materialized for this root.')
    const files = new Map<string, Buffer>()
    let sourceTotal = 0
    for (const file of index.files) {
      let bytes = read(`${layout.runtimeRoot}/${file.path}`)
      if (!bytes || sha256(bytes) !== file.sha256) {
        bytes = evidence.get(file.sha256)
        used.add(file.sha256)
      }
      if (!bytes || sha256(bytes) !== file.sha256)
        throw new NotesError('RECOVERY_CONFLICT', 'Cannot independently reconstruct both source endpoints.', file.path)
      budget('Source file', bytes.length, limits.sourceFile)
      sourceTotal += bytes.length
      budget('Source total', sourceTotal, limits.sourceTotal)
      count(bytes)
      files.set(file.path, bytes)
    }
    return { index: indexBytes, files }
  }
  let before: Projection | undefined
  if (context.before !== null) {
    const installation = parseInstallation(canonical(context.before))
    if (context.beforeIndex === null)
      throw new NotesError('RECOVERY_CONFLICT', 'Missing old source evidence.')
    before = validate({ kind: 'installation', source: rebuild(context.beforeIndex, beforeView), config: context.config, installation })
    const bytes = beforeView(layout.installPath)
    if (!bytes || !canonical(parseInstallation(bytes)).equals(canonical(installation)))
      throw new NotesError('RECOVERY_CONFLICT', 'Before manifest does not match the journal intention.')
  }
  else if (context.beforeIndex !== null || beforeView(layout.installPath)) {
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid initial installation state.')
  }
  const after = validate({ kind: 'installation', source: rebuild(context.afterIndex, afterView), config: context.config, installation: parseInstallation(canonical(context.after)) })
  validate({ kind: 'transition', before, after, operation: context.operation })
  if (used.size !== evidence.size || [...evidence.keys()].some(hash => !used.has(hash)))
    throw new NotesError('RECOVERY_CONFLICT', 'Unnecessary supplemental source evidence.')
  const configBefore = beforeView(layout.configPath)
  if (configBefore && !equal(configBefore, afterView(layout.configPath)))
    throw new NotesError('RECOVERY_CONFLICT', 'Existing configuration cannot be rewritten.')
  if (configBefore) {
    let value: unknown
    try {
      value = JSON.parse(configBefore.toString('utf8'))
    }
    catch {
      throw new NotesError('RECOVERY_CONFLICT', 'Invalid configuration endpoint.')
    }
    if (!canonical(value).equals(canonical(context.config)))
      throw new NotesError('RECOVERY_CONFLICT', 'Configuration disagrees with the projection.')
  }
  if (before && context.operation !== 'repair') {
    for (const asset of before.assets) {
      const bytes = beforeView(asset.path)
      const content = asset.kind === 'block' ? block(entryText(bytes, asset.path), asset.path)?.text.replace(/\r\n/g, '\n') : bytes
      if (content === undefined || sha256(typeof content === 'string' ? Buffer.from(content) : content) !== asset.sha256)
        throw new NotesError('RECOVERY_CONFLICT', 'Ordinary management cannot consume damaged assets.', asset.path)
    }
  }
  const expected = planFiles(before, after, context.config, beforeView)
  if (expected.size !== journal.entries.length || journal.entries.some(entry => !expected.has(entry.path) || !equal(expected.get(entry.path), entry.after === null ? null : base64(entry.after))))
    throw new NotesError('RECOVERY_CONFLICT', 'Journal entries do not equal the complete legal transition.')
  for (const asset of after.assets) {
    const bytes = afterView(asset.path)
    const content = asset.kind === 'block' ? block(entryText(bytes, asset.path), asset.path)?.text.replace(/\r\n/g, '\n') : bytes
    if (content === undefined || sha256(typeof content === 'string' ? Buffer.from(content) : content) !== asset.sha256)
      throw new NotesError('RECOVERY_CONFLICT', 'After assets do not match the exact projection.', asset.path)
  }
  if (journal.directories.some(path => !after.creationCandidates.includes(path)))
    throw new NotesError('RECOVERY_CONFLICT', 'Unnecessary created directory.')
  const cleanup = (before?.cleanupCandidates ?? []).filter(path => !after.cleanupCandidates.includes(path)).sort(byteOrder)
  if (JSON.stringify(journal.cleanup) !== JSON.stringify(cleanup))
    throw new NotesError('RECOVERY_CONFLICT', 'Cleanup actions do not match the old skill projection.')
}
