import type { Result } from '../cli/run'
import type { ProjectConfig } from '../notes/model'
import type { Snapshot } from '../notes/snapshot'
import type { TransactionHooks } from '../workflow/transaction'
import type { Bundle } from './bundle'
import type { Asset, Installation, Target } from './manifest'
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { diagnostic, NotesError } from '../notes/model'
import { readConfig, readIndex } from '../notes/reader'
import { rewriteLinks } from '../notes/rewrite'
import { findRoot, Repository, safePath, sha256 } from '../notes/snapshot'
import { currentDiagnostics } from '../notes/validation'
import { assertNoTransaction, commitTransaction, recoverTransaction, verifyObservations } from '../workflow/transaction'
import { bundleHash, loadBundle, managerVersion } from './bundle'
import { ancestors, planGitRules } from './git-rules'
import { assetBytes, block, entryText, installPath, integrity, managedPath, readInstallation, replaceBlock, skillNames, versionPattern, wrapBlock } from './manifest'

export interface ManageOptions {
  command: 'init' | 'upgrade' | 'status'
  root?: string
  targets: Target[]
  notesDir?: string
  language?: 'zh-CN' | 'en'
  dryRun: boolean
  recover: boolean
}

export function installationRoot(explicit: string | undefined, cwd: string, init = false): string {
  try {
    return findRoot(explicit, cwd)
  }
  catch (error) {
    if (!init || !(error instanceof NotesError) || error.code !== 'ROOT_NOT_FOUND')
      throw error
    const repository = new Repository(realpathSync(cwd))
    return repository.available ? realpathSync(execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()) : realpathSync(cwd)
  }
}

function route(path: string, source: Snapshot, agents: boolean): string {
  const runtime = relative(dirname(path), '.agent-notes/runtime/assets/references/writing.md').split('\\').join('/')
  const inherited = path === '.claude/CLAUDE.md' && ((!source.read(path) && (agents || source.exists('AGENTS.md'))) || block(entryText(source.read(path), path), path)?.text.includes('@../AGENTS.md')) ? '@../AGENTS.md\n\n' : ''
  return wrapBlock(path, `${inherited}## Engineering decision Notes\n\nBefore planning related changes or first editing code, run \`node .agent-notes/runtime/cli.mjs context --paths <project-relative-paths> --topic <topic>\` from the project root. Include new, deleted and renamed paths; query again when scope or approach changes. Read only relevant returned Notes with \`show <id>\` or their paths.\n\nUse \`agent-note\` when durable rationale or discarded alternatives cannot live in code, tests or existing docs: suggest recording, then proceed on user acceptance or an explicit request; retain existing authorization. Ordinary Plan may finish with zero Notes. Ship required Notes with code in the same PR. Use \`agent-note-maintenance\` for lifecycle changes and cleanup; run \`check\` before delivery. [Command inputs and lifecycle rules](${runtime}) are available when writing or maintaining a Note.`)
}

function claudeRoute(path: string, source: Snapshot, agents: boolean): string | undefined {
  if (!agents)
    return route(path, source, false)
  const original = entryText(source.read(path), path)
  const unmanaged = block(original, path) ? replaceBlock(original, path, '') : original
  const importPath = path === 'CLAUDE.md' ? 'AGENTS.md' : '../AGENTS.md'
  // Only literal, standalone local imports count. Prose mentions and code
  // examples must not silently suppress a required route.
  let fence: string | undefined
  for (const line of unmanaged.split(/\r?\n/)) {
    const delimiter = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (delimiter) {
      if (!fence)
        fence = delimiter
      else if (delimiter[0] === fence[0] && delimiter.length >= fence.length)
        fence = undefined
    }
    else if (!fence && /^ {0,3}@\S+\s*$/.test(line) && [`@${importPath}`, `@./${importPath}`].includes(line.trim())) {
      return undefined
    }
  }
  return wrapBlock(path, `@${importPath}`)
}

function configFor(source: Snapshot, options: ManageOptions): ProjectConfig {
  const existing = source.read('.agent-notes/config.json')
  if (existing) {
    const config = readConfig(source)
    if ((options.notesDir && options.notesDir !== config.notes_dir) || (options.language && options.language !== config.language))
      throw new NotesError('CONFIG_CONFLICT', 'Existing project configuration is preserved. Requested initialization options disagree with it.', '.agent-notes/config.json', 2)
    return config
  }
  const config: ProjectConfig = { format: 'agent-notes-config/1', notes_dir: options.notesDir ?? '.agents/notes', language: options.language ?? 'zh-CN' }
  return readConfig(source.overlay(new Map([['.agent-notes/config.json', Buffer.from(JSON.stringify(config))]])))
}

function protectLayout(config: ProjectConfig): void {
  const roots = ['.agent-notes', '.agents/skills', '.claude/skills', 'AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.gitignore', '.gitattributes']
  if (roots.some(root => config.notes_dir.toLowerCase() === root.toLowerCase() || root.toLowerCase().startsWith(`${config.notes_dir.toLowerCase()}/`) || config.notes_dir.toLowerCase().startsWith(`${root.toLowerCase()}/`)))
    throw new NotesError('CONFIG_CONFLICT', 'Notes must have their own directory, disjoint from installation assets and rule files.', config.notes_dir, 2)
}

function noteInventory(source: Snapshot, notesDir: string): string[] {
  source.includeDirectory(notesDir)
  return source.paths().filter(path => path.startsWith(`${notesDir}/`) && source.exists(path)).sort()
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

function backup(source: Snapshot, modified: Asset[], changes: Map<string, Buffer | null>): string | undefined {
  const originals = modified.filter(asset => source.read(asset.path))
  if (!originals.length)
    return undefined
  const directory = `.agent-notes/local/backups/${randomUUID()}`
  // Snapshot.exists checks every ancestor, including ignored local paths.
  if (source.exists(directory))
    throw new NotesError('BACKUP_FAILED', 'Backup destination already exists.', directory)
  const full = join(source.repository.root, directory)
  mkdirSync(full, { recursive: true, mode: 0o700 })
  const patches: string[] = []
  const save = (path: string, bytes: Uint8Array | string): void => {
    const destination = join(full, path)
    mkdirSync(dirname(destination), { recursive: true })
    const descriptor = openSync(destination, 'wx', 0o600)
    try {
      writeFileSync(descriptor, bytes)
      fsyncSync(descriptor)
    }
    finally { closeSync(descriptor) }
  }
  try {
    for (const asset of originals) {
      const original = source.read(asset.path)!
      const before = `original/${asset.path}`
      const after = `replacement/${asset.path}`
      save(before, original)
      save(after, changes.get(asset.path) ?? Buffer.alloc(0))
      const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', before, after], { cwd: full, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
      if (diff.status !== 0 && diff.status !== 1)
        throw new Error(diff.error?.message ?? diff.stderr)
      patches.push(diff.stdout)
      if (!readFileSync(join(full, before)).equals(original))
        throw new Error(`Backup bytes do not match ${asset.path}`)
    }
    save('changes.patch', patches.join('\n'))
    save('README.txt', 'Managed assets saved before replacement. original/ contains exact files; changes.patch compares them to replacement/. This backup is inactive and can be retained or removed by the project owner.\n')
  }
  catch (error) { throw new NotesError('BACKUP_FAILED', `Cannot save managed edits: ${String(error)}. No project assets were replaced.`, directory) }
  return directory
}

export function manage(options: ManageOptions, cwd: string, suppliedBundle?: Bundle, hooks: TransactionHooks = {}): Result {
  const output: Result = { command: options.command, result: 'ok', scope: {}, data: {}, diagnostics: [], review: [] }
  let scratch: string | undefined
  try {
    const [major, minor] = process.versions.node.split('.').map(Number)
    if (major < 22 || (major === 22 && minor < 12))
      throw new NotesError('NODE_VERSION', 'agent-notes requires Node >=22.12.0.', undefined, 2)
    const root = installationRoot(options.root, cwd, options.command === 'init')
    output.scope = { root, snapshot: 'worktree' }
    const recovered = options.recover ? recoverTransaction(root) : false
    assertNoTransaction(root)
    const repository = new Repository(root)
    const source = repository.snapshot('worktree')
    const installation = readInstallation(source)
    if (!installation && options.command !== 'init')
      throw new NotesError('NOT_INSTALLED', 'Initialize this project with an explicit --target first.', installPath, 2)
    if (installation && !source.read('.agent-notes/config.json'))
      throw new NotesError('CONFIG_CONFLICT', 'Installed configuration is missing; restore it explicitly.', '.agent-notes/config.json')
    const config = configFor(source, options)
    protectLayout(config)
    if (options.command === 'status') {
      const problems = integrity(source, installation!)
      output.data = { manager_version: managerVersion, runtime_version: installation!.version, bundle_sha256: installation!.bundle_sha256, targets: installation!.targets, notes_dir: config.notes_dir, assets: installation!.assets.length, integrity: problems.length ? 'damaged' : 'intact', problems }
      if (problems.length) {
        output.result = 'failed'
        output.diagnostics = problems.map(item => ({ code: 'ASSET_INTEGRITY', path: item.path, message: `Managed asset ${item.state}; run upgrade to repair it.` }))
      }
      return output
    }
    const bundle = suppliedBundle ?? loadBundle()
    if (!versionPattern.test(bundle.version) || !bundle.files.has('cli.mjs') || skillNames.some(name => !bundle.skills.has(`${name}/SKILL.md`)))
      throw new NotesError('INVALID_BUNDLE', 'Bundle version, runtime or required skills are missing.', undefined, 2)
    if (installation && options.command === 'init') {
      if (bundle.version !== installation.version)
        throw new NotesError('UPGRADE_REQUIRED', 'Use upgrade to change the installed tool version.', installPath, 2)
      if (JSON.stringify([...options.targets].sort()) !== JSON.stringify([...installation.targets].sort()))
        throw new NotesError('TARGET_CONFLICT', 'Repeat init with the installed targets. Changing installation targets is not supported by v1.', installPath, 2)
      const problems = integrity(source, installation)
      if (problems.length)
        throw new NotesError('UPGRADE_REQUIRED', 'Managed assets need repair; use upgrade.', problems[0].path)
      output.data = { version: bundle.version, targets: installation.targets, notes_dir: config.notes_dir, changes: [], recovered }
      return output
    }
    const targets = installation?.targets ?? options.targets
    const notes = noteInventory(source, config.notes_dir)
    for (const path of notes)
      source.read(path)
    if (!installation) {
      if (notes.length || source.exists('.agent-notes/runtime'))
        throw new NotesError('UNOWNED_ASSET', 'Existing Notes or runtime have no install manifest; init does not adopt them.', notes[0] ?? '.agent-notes/runtime')
      for (const target of targets) {
        for (const name of skillNames) {
          if (source.exists(`.${target}/skills/${name}`))
            throw new NotesError('UNOWNED_ASSET', 'A same-name skill already exists without installation ownership.', `.${target}/skills/${name}`)
        }
      }
    }
    const changes = new Map<string, Buffer | null>()
    const desired = new Map<string, { kind: Asset['kind'], bytes: Buffer }>()
    const entries = new Set<string>()
    const add = (path: string, kind: Asset['kind'], bytes: Buffer): void => {
      if (!managedPath(path, kind, targets) || desired.has(path))
        throw new NotesError('INVALID_BUNDLE', 'Bundle contains an invalid or duplicate asset path.', path)
      desired.set(path, { kind, bytes })
    }
    for (const [path, bytes] of bundle.files) {
      if (!safePath(path))
        throw new NotesError('INVALID_BUNDLE', 'Unsafe bundle path.', path)
      add(`.agent-notes/runtime/${path}`, 'file', bytes)
    }
    for (const target of targets) {
      const destinations = new Map<string, { path: string }>()
      for (const path of bundle.files.keys()) {
        for (const source of [...ancestors(path), path])
          destinations.set(source, { path: `.agent-notes/runtime/${source}` })
      }
      for (const path of bundle.skills.keys()) {
        for (const source of [...ancestors(path), path])
          destinations.set(`assets/skills/${source}`, { path: `.${target}/skills/${source}` })
      }
      for (const [path, bytes] of bundle.skills) {
        const destination = `.${target}/skills/${path}`
        const content = /\.md$/i.test(path) ? Buffer.from(rewriteLinks(bytes.toString('utf8'), `assets/skills/${path}`, destination, destinations)) : bytes
        add(destination, 'file', content)
      }
      const ownedEntry = installation?.assets.find(asset => asset.kind === 'block' && (target === 'agents' ? asset.path === 'AGENTS.md' : ['CLAUDE.md', '.claude/CLAUDE.md'].includes(asset.path)))?.path
      const entry = ownedEntry ?? (target === 'agents' ? 'AGENTS.md' : source.exists('CLAUDE.md') ? 'CLAUDE.md' : '.claude/CLAUDE.md')
      entries.add(entry)
      const text = target === 'claude' ? claudeRoute(entry, source, targets.includes('agents')) : route(entry, source, true)
      if (text !== undefined)
        add(entry, 'block', Buffer.from(text))
    }
    const priorBlocks = new Set(installation?.assets.filter(asset => asset.kind === 'block').map(asset => asset.path))
    for (const [path, text] of planGitRules(source, config.notes_dir, [...new Set([...desired.keys(), ...entries])], priorBlocks, [...desired].filter(([, asset]) => asset.kind === 'file').map(([path]) => path)))
      add(path, 'block', Buffer.from(text))
    const oldAssets = new Map(installation?.assets.map(asset => [asset.path, asset]))
    const nextAssets: Asset[] = []
    for (const [path, asset] of desired) {
      const previous = oldAssets.get(path)
      const before = source.read(path)
      if (previous && previous.kind !== asset.kind)
        throw new NotesError('INVALID_INSTALLATION', 'Asset ownership kind changed.', path)
      if (!previous && (asset.kind === 'file' ? before : before && block(entryText(before, path), path)))
        throw new NotesError('UNOWNED_ASSET', 'A new managed asset would overwrite an unknown file or block.', path)
      const currentBlock = asset.kind === 'block' ? block(entryText(before, path), path) : undefined
      const after = asset.kind === 'block'
        ? currentBlock?.text.replace(/\r\n/g, '\n') === entryText(asset.bytes, path)
          ? before!
          : Buffer.from(replaceBlock(entryText(before, path), path, entryText(asset.bytes, path)))
        : asset.bytes
      if (!before?.equals(after))
        changes.set(path, after)
      nextAssets.push({ path, kind: asset.kind, sha256: sha256(asset.bytes) })
    }
    for (const asset of installation?.assets ?? []) {
      if (desired.has(asset.path))
        continue
      const bytes = source.read(asset.path)
      if (!bytes)
        continue
      if (asset.kind === 'block') {
        const current = block(entryText(bytes, asset.path), asset.path)
        if (current)
          changes.set(asset.path, Buffer.from(replaceBlock(entryText(bytes, asset.path), asset.path, '')))
      }
      else { changes.set(asset.path, null) }
    }
    if (!source.read('.agent-notes/config.json'))
      changes.set('.agent-notes/config.json', Buffer.from(`${JSON.stringify(config, null, 2)}\n`))
    const next: Installation = { format: 'agent-notes-install/1', version: bundle.version, bundle_sha256: bundleHash(bundle), targets, assets: nextAssets.sort((a, b) => a.path.localeCompare(b.path)) }
    const manifest = Buffer.from(`${JSON.stringify(next, null, 2)}\n`)
    if (!source.read(installPath)?.equals(manifest))
      changes.set(installPath, manifest) // The install manifest always switches last.
    const index = readIndex(source.overlay(changes))
    const diagnostics = currentDiagnostics(index)
    if (diagnostics.length) {
      output.diagnostics.push(...diagnostics)
      output.result = diagnostics.some(item => item.code === 'UNSUPPORTED_FORMAT') ? 'invalid-input' : 'failed'
      return output
    }
    const modified = (installation?.assets ?? []).filter((asset) => {
      const bytes = assetBytes(source, asset)
      return changes.has(asset.path) && bytes !== undefined && sha256(bytes) !== asset.sha256
    })
    output.data = { manager_version: bundle.version, previous_version: installation?.version ?? null, runtime_version: bundle.version, targets, notes_dir: config.notes_dir, recovered, modified_assets: modified.map(asset => asset.path), changes: [...changes].map(([path, bytes]) => ({ path, action: !bytes ? 'delete' : source.read(path) ? 'update' : 'create', before_hash: source.read(path) ? sha256(source.read(path)!) : null, after_hash: bytes ? sha256(bytes) : null })) }
    if (!changes.size)
      return output
    scratch = mkdtempSync(join(tmpdir(), 'agent-notes-install-'))
    const candidate = join(scratch, 'candidate.mjs')
    writeFileSync(candidate, bundle.files.get('cli.mjs')!)
    const smokeRoot = join(scratch, 'project')
    writeScratch(smokeRoot, '.agent-notes/config.json', changes.get('.agent-notes/config.json') ?? source.read('.agent-notes/config.json')!)
    for (const path of notes)
      writeScratch(smokeRoot, path, source.read(path)!)
    smoke(candidate, smokeRoot)
    if (options.dryRun)
      return output
    commitTransaction(source, changes, (applied) => {
      const fresh = repository.snapshot('worktree')
      if (JSON.stringify(noteInventory(fresh, config.notes_dir)) !== JSON.stringify(notes))
        throw new NotesError('CONCURRENT_CHANGE', 'Note inventory changed during installation; retry with the current project.')
      verifyObservations(source, fresh, applied ? changes : undefined)
      if (applied) {
        smoke(join(root, '.agent-notes/runtime/cli.mjs'), smokeRoot)
        const completed = repository.snapshot('worktree')
        if (JSON.stringify(noteInventory(completed, config.notes_dir)) !== JSON.stringify(notes))
          throw new NotesError('CONCURRENT_CHANGE', 'Note inventory changed during runtime validation; retry.')
        verifyObservations(source, completed, changes)
      }
    }, {
      ...hooks,
      beforeCommit: () => {
        hooks.beforeCommit?.()
        verifyObservations(source, repository.snapshot('worktree'))
        const saved = backup(source, modified, changes)
        if (saved)
          output.data.backup = saved
      },
    }, 'distribution')
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
