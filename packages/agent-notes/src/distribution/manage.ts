import type { Result } from '../cli/run'
import type { ProjectConfig } from '../notes/model'
import type { Snapshot } from '../notes/snapshot'
import type { TransactionHooks } from '../workflow/transaction'
import type { Bundle } from './bundle'
import type { NotesLayout } from './layout'
import type { Asset } from './manifest'
import type { Operation } from './transition'
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { diagnostic, NotesError } from '../notes/model'
import { readConfig, readIndex } from '../notes/reader'
import { findRoot, Repository, sha256 } from '../notes/snapshot'
import { currentDiagnostics } from '../notes/validation'
import { recoverTransaction, recoveryView } from '../workflow/recovery'
import { assertNoTransaction, commitTransaction, preflightTransaction, verifyObservations } from '../workflow/transaction'
import { installedBundle, loadBundle, managerVersion, parseSource } from './bundle'
import { checkGitRules } from './git-rules'
import { defaultNotesRoot, layoutFromSnapshot, notesLayout } from './layout'
import { integrity, readInstallation } from './manifest'
import { project, validate } from './projection'
import { assertPath, budget, limits, skillNames } from './protocol'
import { assertPackageCommand, repairCommand } from './source'
import { planFiles, transitionContext, validateJournal } from './transition'

export interface ManageOptions {
  command: Operation | 'status'
  root?: string
  hosts: string[]
  notesDir?: string
  language?: 'zh-CN' | 'en'
  dryRun: boolean
  recover: boolean
}

export function installationRoot(explicit: string | undefined, cwd: string, install = false): string {
  try {
    return findRoot(explicit, cwd)
  }
  catch (error) {
    if (!install || !(error instanceof NotesError) || error.code !== 'ROOT_NOT_FOUND')
      throw error
    const repository = new Repository(realpathSync(cwd))
    return repository.available ? realpathSync(execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()) : realpathSync(cwd)
  }
}
function configFor(source: Snapshot, options: ManageOptions, discovered?: NotesLayout): ProjectConfig {
  const layout = discovered ?? notesLayout(options.notesDir ?? defaultNotesRoot)
  const existing = source.read(layout.configPath)
  if (existing) {
    const config = readConfig(source, layout)
    if ((options.notesDir && options.notesDir !== config.notes_dir) || (options.language && options.language !== config.language))
      throw new NotesError('CONFIG_CONFLICT', 'Existing project configuration is preserved. Requested initialization options disagree with it.', layout.configPath, 2)
    return config
  }
  const config: ProjectConfig = { format: 'agent-notes-config/1', notes_dir: layout.notesRoot, language: options.language ?? 'zh-CN' }
  return readConfig(source.overlay(new Map([[layout.configPath, Buffer.from(JSON.stringify(config))]])), layout)
}

function noteInventory(source: Snapshot, notesDir: string): string[] {
  const layout = notesLayout(notesDir)
  source.includeDirectory(notesDir)
  return source.paths().filter(path => path.startsWith(`${notesDir}/`) && !path.startsWith(`${layout.runtimeRoot}/`) && !path.startsWith(`${layout.localRoot}/`) && path !== layout.configPath && path !== layout.installPath && source.exists(path)).sort()
}

function smoke(cli: string, root: string): void {
  const result = spawnSync(process.execPath, [cli, 'context', '--root', root, '--json'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
  let parsed: Result | undefined
  try {
    parsed = JSON.parse(result.stdout)
  }
  catch {}
  if (result.status !== 0 || parsed?.command !== 'context' || parsed.result !== 'ok' || !Array.isArray(parsed.data.notes))
    throw new NotesError('BUNDLE_SMOKE_FAILED', `Target runtime cannot read the existing project contracts: ${result.error?.message ?? result.stderr ?? ''} ${parsed ? JSON.stringify(parsed.diagnostics) : result.stdout}`.trim())
}

function writeScratch(root: string, path: string, bytes: Uint8Array): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), bytes)
}

export function backupPlan(directory: string, endpoints: { path: string, before: Buffer, after: Buffer }[]): [string, Buffer][] {
  const copies: [string, Buffer][] = []
  let total = 0
  for (const { path, before, after } of endpoints) {
    budget('Original backup endpoint', before.length, limits.endpoint)
    budget('Replacement backup endpoint', after.length, limits.endpoint)
    const original = `${directory}/original/${path}`
    const replacement = `${directory}/replacement/${path}`
    const summary = Buffer.from(`${path}\nOriginal: ${before.length} bytes, sha256 ${sha256(before)}\nReplacement: ${after.length} bytes, sha256 ${sha256(after)}\nComplete copies: ${original} and ${replacement}\nThe managed asset differed from the locked projection. This is a bounded summary, not a unified diff.\n`)
    budget('Backup summary', summary.length, limits.summary)
    copies.push([original, before], [replacement, after], [`${directory}/summaries/${path}.txt`, summary])
  }
  for (const [path, bytes] of copies) {
    assertPath(path)
    total += bytes.length
    budget('Necessary backups', total, limits.backup)
  }
  return copies
}

function backup(source: Snapshot, modified: Asset[], changes: Map<string, Buffer | null>, layout: NotesLayout, preview = false): string | undefined {
  if (!modified.length)
    return undefined
  const directory = `${layout.localRoot}/backups/${randomUUID()}`
  const copies = backupPlan(directory, modified.map(asset => ({ path: asset.path, before: source.read(asset.path, limits.endpoint)!, after: changes.get(asset.path) ?? Buffer.alloc(0) })))
  if (preview)
    return undefined
  if (source.exists(directory))
    throw new NotesError('BACKUP_FAILED', 'Backup destination already exists.', directory)
  try {
    for (const [path, bytes] of copies) {
      const full = join(source.repository.root, path)
      mkdirSync(dirname(full), { recursive: true, mode: 0o700 })
      const fd = openSync(full, 'wx', 0o600)
      try {
        writeFileSync(fd, bytes)
        fsyncSync(fd)
      }
      finally {
        closeSync(fd)
      }
      if (!readFileSync(full).equals(bytes))
        throw new Error('Backup verification failed.')
    }
  }
  catch (error) {
    throw new NotesError('BACKUP_FAILED', `Necessary backup failed: ${String(error)}. Partial evidence may remain here; no managed assets were replaced.`, directory)
  }
  return directory
}

export function manage(options: ManageOptions, cwd: string, suppliedBundle?: Bundle, hooks: TransactionHooks = {}): Result {
  const output: Result = { command: options.command, result: 'ok', scope: {}, data: {}, diagnostics: [], review: [] }
  let scratch: string | undefined
  try {
    assertPackageCommand(options.command)
    if (options.dryRun && options.recover)
      throw new NotesError('INVALID_INPUT', '--dry-run excludes --recover.', undefined, 2)
    if (options.command === 'hosts set' && !options.hosts.length)
      throw new NotesError('INVALID_INPUT', 'hosts set requires a complete nonempty --host set.', undefined, 2)
    const [major, minor] = process.versions.node.split('.').map(Number)
    if (major < 22 || (major === 22 && minor < 12))
      throw new NotesError('NODE_VERSION', 'agent-notes requires Node >=22.12.0.', undefined, 2)
    const root = installationRoot(options.root, cwd, options.command === 'install')
    output.scope = { root, snapshot: 'worktree' }
    const repository = new Repository(root)
    const view = options.recover ? recoveryView(repository.snapshot('worktree')) : undefined
    if (!view)
      assertNoTransaction(root)
    const source = view?.source ?? repository.snapshot('worktree')
    const config = configFor(source, options, layoutFromSnapshot(source))
    const layout = notesLayout(config.notes_dir)
    const installation = readInstallation(source, layout)
    if (!installation && options.command !== 'install')
      throw new NotesError('NOT_INSTALLED', 'Run install from a complete npm package first.', layout.installPath, 2)
    if (installation && !source.read(layout.configPath))
      throw new NotesError('CONFIG_CONFLICT', 'Installed configuration is missing; restore it explicitly.', layout.configPath)
    let selectedSource = options.command === 'status' || options.command === 'hosts set' ? undefined : suppliedBundle ?? loadBundle()
    let before
    if (installation) {
      let oldSource
      try {
        oldSource = installedBundle(source, layout.runtimeRoot)
      }
      catch (error) {
        if (options.command !== 'repair' || !selectedSource)
          throw error
        oldSource = selectedSource
      }
      before = validate({ kind: 'installation', source: oldSource, config, installation })
    }
    if (options.command === 'hosts set' && before)
      selectedSource = before.source
    const problems = installation ? integrity(source, installation) : []
    if (options.command === 'status') {
      output.data = { manager_version: managerVersion, runtime_version: installation!.version, bundle_sha256: installation!.bundle_sha256, integrations: installation!.integrations, notes_dir: config.notes_dir, assets: installation!.assets.length, integrity: problems.length ? 'damaged' : 'intact', problems }
      if (problems.length)
        throw new NotesError('ASSET_INTEGRITY', `Tool assets need repair; use ${repairCommand(installation!.version)}.`, problems[0].path)
      return output
    }
    const catalog = parseSource(selectedSource!.index)
    const hosts = options.hosts.length ? options.hosts : installation?.integrations ?? catalog.integrations.filter(item => item.default).map(item => item.id)
    const after = project({ source: selectedSource!, config, integrations: hosts })
    validate({ kind: 'transition', before, after, operation: options.command })
    if (problems.length && options.command !== 'repair')
      throw new NotesError('REPAIR_REQUIRED', `Repair damaged assets first, including assets being removed. Run ${repairCommand(installation!.version)}.`, problems[0].path)
    if (!installation && source.exists(layout.runtimeRoot))
      throw new NotesError('INVALID_INSTALLATION', 'Runtime exists without a valid receipt. Restore ownership or recover a valid journal.', layout.installPath)
    const ownedRoots = new Set(before?.skillRoots)
    for (const path of after.skillRoots) {
      if (!ownedRoots.has(path) && source.exists(path))
        throw new NotesError('UNOWNED_ASSET', 'A same-name unknown skill directory cannot be adopted, even with identical bytes.', path)
    }
    if (!installation) {
      for (const item of catalog.integrations) {
        for (const name of skillNames) {
          const path = `${item.skillRoot}/${name}`
          if (source.exists(path))
            throw new NotesError('UNOWNED_ASSET', 'Skill installation traces exist without a valid receipt.', path)
        }
      }
    }
    for (const asset of after.assets) {
      source.read(asset.path, limits.endpoint)
      const folded = asset.path.normalize('NFC').toLowerCase()
      const collision = source.paths().find(path => path !== asset.path && path.normalize('NFC').toLowerCase() === folded)
      if (collision)
        throw new NotesError('PROJECTION_CONFLICT', 'Existing case/normalization collision.', collision)
    }
    const changes = planFiles(before, after, config, path => source.read(path, limits.endpoint))
    const notes = noteInventory(source, config.notes_dir)
    for (const path of notes) source.read(path)
    const diagnostics = currentDiagnostics(readIndex(source.overlay(changes)))
    if (diagnostics.length) {
      output.diagnostics = diagnostics
      output.result = diagnostics.some(item => item.code === 'UNSUPPORTED_FORMAT') ? 'invalid-input' : 'failed'
      return output
    }
    const verifyGit = checkGitRules(source, after, before?.assets.map(asset => asset.path))
    const modified = (installation?.assets ?? []).filter(asset => problems.some(problem => problem.path === asset.path && problem.state === 'modified') && changes.has(asset.path))
    const cleanup = (before?.cleanupCandidates ?? []).filter(path => !after.cleanupCandidates.includes(path))
    const context = transitionContext(options.command, config, before, after, changes, path => source.read(path, limits.endpoint))
    output.data = { manager_version: after.identity.version, previous_version: installation?.version ?? null, runtime_version: after.identity.version, integrations: after.integrations, notes_dir: config.notes_dir, recovered: false, modified_assets: modified.map(asset => asset.path), changes: [...changes].map(([path, bytes]) => ({ path, action: bytes === null ? 'delete' : source.read(path) ? 'update' : 'create', before_hash: source.read(path) ? sha256(source.read(path)!) : null, after_hash: bytes ? sha256(bytes) : null })), cleanup }
    if (options.recover) {
      // All input, source, ownership and target semantics pass before recovery writes.
      view!.verify()
      const recovered = recoverTransaction(root)
      const result = manage({ ...options, root, recover: false }, cwd, suppliedBundle, hooks)
      result.data.recovered = recovered
      return result
    }
    if (!changes.size) {
      verifyGit()
      return output
    }
    scratch = mkdtempSync(join(tmpdir(), 'agent-notes-install-'))
    const candidate = join(scratch, 'candidate.mjs')
    writeFileSync(candidate, after.source.files.get('cli.mjs')!)
    const smokeRoot = join(scratch, 'project')
    writeScratch(smokeRoot, layout.configPath, changes.get(layout.configPath) ?? source.read(layout.configPath)!)
    for (const path of notes) writeScratch(smokeRoot, path, source.read(path)!)
    smoke(candidate, smokeRoot)
    preflightTransaction(source, changes, { context, cleanup, creationCandidates: after.creationCandidates, validate: validateJournal })
    backup(source, modified, changes, layout, true)
    if (options.dryRun)
      return output
    commitTransaction(source, changes, (applied) => {
      verifyGit()
      const fresh = repository.snapshot('worktree')
      if (JSON.stringify(noteInventory(fresh, config.notes_dir)) !== JSON.stringify(notes))
        throw new NotesError('CONCURRENT_CHANGE', 'Note inventory changed during management.')
      verifyObservations(source, fresh, applied ? changes : undefined)
      if (applied) {
        smoke(join(root, layout.runtimeCli), smokeRoot)
        verifyObservations(source, repository.snapshot('worktree'), changes)
      }
    }, { ...hooks, beforeCommit: () => {
      hooks.beforeCommit?.()
      verifyObservations(source, repository.snapshot('worktree'))
      const saved = backup(source, modified, changes, layout)
      if (saved)
        output.data.backup = saved
    } }, { context, cleanup, creationCandidates: after.creationCandidates, validate: validateJournal })
  }
  catch (error) {
    output.diagnostics.push(diagnostic(error))
    output.result = error instanceof NotesError && error.exitCode === 2 ? 'invalid-input' : 'failed'
  }
  finally {
    if (scratch)
      rmSync(scratch, { recursive: true, force: true })
  }
  return output
}
