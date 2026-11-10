import type { ManageOptions } from '../src/distribution/manage'
import type { Installation } from '../src/distribution/manifest'
import type { TransactionHooks } from '../src/workflow/transaction'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { manage } from '../src/distribution/manage'
import { canonical } from '../src/distribution/protocol'
import { validateJournal } from '../src/distribution/transition'
import { recoverTransaction } from '../src/workflow/recovery'
import { recoverTransaction as recoverWithHooks } from '../src/workflow/transaction'
import { testBundle } from './distribution-fixtures'
import { archive, git, note, project, write } from './fixtures'

vi.setConfig({ testTimeout: 120_000 })
const roots: string[] = []
const installPath = '.agents/notes/install.json'
const sets = Array.from({ length: 7 }, (_, n) => ['generic', 'codex', 'claude-code'].filter((_, i) => (n + 1) & (1 << i)))
function setup(): string {
  const root = project()
  roots.push(root)
  return root
}
function command(root: string, name: ManageOptions['command'] = 'install', source = testBundle(), extra: Partial<ManageOptions> = {}, hooks: TransactionHooks = {}) {
  return manage({ command: name, root, hosts: [], dryRun: false, recover: false, ...extra }, root, source, hooks)
}
function read(root: string, path: string): Buffer {
  return readFileSync(join(root, path))
}
function manifest(root: string): Installation {
  return JSON.parse(read(root, installPath).toString('utf8'))
}
function ok(result: ReturnType<typeof command>): void {
  expect(result.result, JSON.stringify(result)).toBe('ok')
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('project integrations', () => {
  it.each(sets)('installs %j and preserves every permanent rule file', (...hosts) => {
    const root = setup()
    const rules = ['AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.override.md', '.claude/CLAUDE.local.md']
    write(root, '.gitignore', '.agents/\n.claude/\n')
    for (const path of rules) write(root, path, `Rules: ${path}\r\n@arbitrary\r\n`)
    ok(command(root, 'install', testBundle(), { hosts }))
    expect(manifest(root).integrations).toEqual([...hosts].sort())
    expect(manifest(root).format).toBe('agent-notes-install/2')
    for (const path of rules) expect(read(root, path).toString()).toBe(`Rules: ${path}\r\n@arbitrary\r\n`)
    expect(existsSync(join(root, '.agents/skills/agent-note/SKILL.md'))).toBe(hosts.includes('generic') || hosts.includes('codex'))
    expect(existsSync(join(root, '.claude/skills/agent-note/SKILL.md'))).toBe(hosts.includes('claude-code'))
    ok(command(root, 'status'))
    expect(command(root).data.changes).toEqual([])
  })

  it('handles all 49 complete set transitions with exact fresh receipts', () => {
    for (const from of sets) {
      for (const to of sets) {
        const root = setup()
        const fresh = setup()
        ok(command(root, 'install', testBundle(), { hosts: from }))
        ok(command(root, 'hosts set', testBundle(), { hosts: to }))
        ok(command(fresh, 'install', testBundle(), { hosts: to }))
        expect(read(root, installPath)).toEqual(read(fresh, installPath))
        for (const asset of manifest(root).assets) expect(read(root, asset.path)).toEqual(read(fresh, asset.path))
      }
    }
  })

  it('keeps unknown contents and refuses to readopt a residual skill directory', () => {
    const root = setup()
    ok(command(root))
    write(root, '.agents/skills/agent-note/private.txt', 'Project content\n')
    ok(command(root, 'hosts set', testBundle(), { hosts: ['claude-code'] }))
    expect(read(root, '.agents/skills/agent-note/private.txt').toString()).toBe('Project content\n')
    expect(existsSync(join(root, '.agents/skills/agent-note-maintenance'))).toBe(false)
    expect(existsSync(join(root, '.agents/skills'))).toBe(true)
    expect(command(root, 'hosts set', testBundle(), { hosts: ['generic'] }).diagnostics[0].code).toBe('UNOWNED_ASSET')
  })

  it('does not adopt identical unknown skill directories', () => {
    const root = setup()
    write(root, '.agents/skills/agent-note/SKILL.md', 'same')
    expect(command(root).diagnostics[0].code).toBe('UNOWNED_ASSET')
    expect(existsSync(join(root, installPath))).toBe(false)
  })

  it('requires repair before removing damaged assets and backs up full originals', () => {
    const root = setup()
    ok(command(root))
    const path = '.agents/skills/agent-note/SKILL.md'
    write(root, path, 'Local edit\r\n')
    expect(command(root, 'hosts set', testBundle(), { hosts: ['claude-code'] }).diagnostics[0].code).toBe('REPAIR_REQUIRED')
    expect(command(root, 'tool update', testBundle('0.2.0')).diagnostics[0].code).toBe('REPAIR_REQUIRED')
    const preview = command(root, 'repair', testBundle(), { dryRun: true })
    ok(preview)
    expect(existsSync(join(root, '.agents/notes/local/backups'))).toBe(false)
    const repaired = command(root, 'repair')
    ok(repaired)
    expect(read(root, `${repaired.data.backup}/original/${path}`).toString()).toBe('Local edit\r\n')
    ok(command(root, 'hosts set', testBundle(), { hosts: ['claude-code'] }))
  })

  it('repairs missing/corrupt local sources only with the matching complete source', () => {
    const root = setup()
    ok(command(root))
    write(root, '.agents/notes/runtime/assets/references/writing.md', 'Corrupt source')
    expect(command(root, 'tool update', testBundle('0.2.0')).diagnostics[0].code).toBe('INVALID_BUNDLE')
    ok(command(root, 'repair'))
    rmSync(join(root, '.agents/notes/runtime/source-index.json'))
    ok(command(root, 'repair'))
    ok(command(root, 'status'))
  })

  it.each(['omit', 'extra', 'hash', 'duplicate', 'unknown', 'legacy'])('refuses invalid ownership: %s', (kind) => {
    const root = setup()
    ok(command(root))
    const state = manifest(root)
    if (kind === 'omit')
      state.assets.pop()
    if (kind === 'extra')
      state.assets.push({ path: 'README.md', kind: 'file', sha256: '0'.repeat(64) })
    if (kind === 'hash')
      state.assets[0].sha256 = '0'.repeat(64)
    if (kind === 'duplicate')
      state.assets.push(state.assets[0])
    const changed = kind === 'unknown' ? { ...state, arbitrary: true } : kind === 'legacy' ? { ...state, format: 'agent-notes-install/1' } : state
    write(root, installPath, canonical(changed))
    expect(command(root, 'repair').result).not.toBe('ok')
    expect(read(root, installPath)).toEqual(canonical(changed))
  })

  it('does not reconstruct missing ownership from source files', () => {
    const root = setup()
    ok(command(root))
    rmSync(join(root, installPath))
    expect(command(root).diagnostics[0].code).toBe('INVALID_INSTALLATION')
    expect(command(root, 'repair').diagnostics[0].code).toBe('NOT_INSTALLED')
  })

  it('switches both ways with real resource additions/removals and preserves project documents', () => {
    const root = setup()
    const a = testBundle()
    const b = testBundle('0.2.0', { 'assets/new.md': '# New resource\n' })
    ok(command(root, 'install', a))
    const path = note(root)
    const archived = archive(root, path)
    const seal = read(root, '.agents/notes/archived/manifest.json')
    const body = read(root, archived)
    const config = read(root, '.agents/notes/config.json')
    write(root, '.agents/notes/runtime/unknown.txt', 'Unknown neighbor')
    for (const target of [b, a]) {
      ok(command(root, 'tool update', target))
      expect(read(root, archived)).toEqual(body)
      expect(read(root, '.agents/notes/archived/manifest.json')).toEqual(seal)
      expect(read(root, '.agents/notes/config.json')).toEqual(config)
      expect(read(root, '.agents/notes/runtime/unknown.txt').toString()).toBe('Unknown neighbor')
    }
    expect(existsSync(join(root, '.agents/notes/runtime/assets/new.md'))).toBe(false)
    const changed = testBundle('0.1.0', { 'assets/changed.md': 'Different' })
    expect(command(root, 'tool update', changed).diagnostics[0].code).toBe('BUNDLE_MISMATCH')
  })

  it('uses exact Git exceptions and preserves ignored unknown siblings', () => {
    const root = setup()
    write(root, '.gitignore', '.agents/\n.claude/\n')
    write(root, '.agents/skills/other/SKILL.md', 'Unknown')
    ok(command(root, 'install', testBundle(), { hosts: ['generic', 'claude-code'] }))
    expect(git(root, 'check-ignore', '--no-index', '.agents/skills/other/SKILL.md')).toBe('.agents/skills/other/SKILL.md')
    expect(git(root, 'check-attr', 'eol', '--', '.agents/skills/agent-note/SKILL.md')).toContain('lf')
    expect(git(root, 'ls-files', '--others', '--exclude-standard')).toContain('.agents/skills/agent-note/SKILL.md')
  })

  it('rejects nested Git conflicts and malformed rule blocks', () => {
    const root = setup()
    write(root, '.agents/skills/.gitignore', '*\n')
    expect(command(root).diagnostics[0].code).toBe('GIT_IGNORE_CONFLICT')
    rmSync(join(root, '.agents/skills/.gitignore'))
    ok(command(root))
    write(root, '.gitignore', '# agent-notes:begin\nBad markers\n')
    expect(command(root, 'repair').diagnostics[0].code).toBe('BLOCK_CONFLICT')
  })

  it('refuses deterministic rules that would newly ignore existing project content', () => {
    const root = setup()
    write(root, '.agents/skills/other/SKILL.md', 'Visible project skill')
    expect(git(root, 'ls-files', '--others', '--exclude-standard')).toContain('.agents/skills/other/SKILL.md')
    expect(command(root).diagnostics[0].code).toBe('GIT_IGNORE_CONFLICT')
    expect(existsSync(join(root, installPath))).toBe(false)
    expect(read(root, '.agents/skills/other/SKILL.md').toString()).toBe('Visible project skill')
  })

  it('rejects symlinks and concurrent changes before replacing anything', () => {
    const root = setup()
    ok(command(root))
    const original = read(root, installPath)
    const result = command(root, 'tool update', testBundle('0.2.0'), {}, { beforeCommit() {
      write(root, '.agents/notes/config.json', 'external edit')
    } })
    expect(result.diagnostics[0].code).toBe('CONCURRENT_CHANGE')
    expect(read(root, installPath)).toEqual(original)
    const other = setup()
    rmSync(join(other, '.agents'), { recursive: true })
    symlinkSync(join(root, '.agents'), join(other, '.agents'))
    expect(command(other).result).not.toBe('ok')
  })

  it('rolls back failed writes and shares the lock with other management requests', () => {
    const root = setup()
    ok(command(root))
    const before = read(root, installPath)
    const result = command(root, 'tool update', testBundle('0.2.0'), {}, { afterStep(index) {
      expect(command(root).diagnostics[0].code).toBe('WRITE_BUSY')
      if (index === 1)
        throw new Error('Injected write failure')
    } })
    expect(result.result).toBe('failed')
    expect(read(root, installPath)).toEqual(before)
    ok(command(root, 'status'))
  })

  it.each(['install', 'tool update', 'repair', 'hosts set'] as const)('recovers real SIGKILL during %s and preserves third-party edits', (operation) => {
    const root = setup()
    if (operation !== 'install')
      ok(command(root))
    if (operation === 'repair')
      write(root, '.agents/skills/agent-note/SKILL.md', 'Repair edit')
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, operation], { timeout: 30_000 })
    expect(child.signal, child.stderr?.toString()).toBe('SIGKILL')
    const journalPath = '.agents/notes/local/write-lock/journal.json'
    const journal = JSON.parse(read(root, journalPath).toString())
    const entry = journal.entries[0]
    write(root, entry.path, 'External editor')
    expect(() => recoverTransaction(root)).toThrow(/outside|endpoints|projection|source/i)
    expect(read(root, entry.path).toString()).toBe('External editor')
    if (entry.after === null)
      rmSync(join(root, entry.path))
    else write(root, entry.path, Buffer.from(entry.after, 'base64'))
    expect(recoverTransaction(root)).toBe(true)
    if (operation !== 'install') {
      if (operation === 'repair')
        ok(command(root, 'repair'))
      ok(command(root, 'status'))
    }
  })
  it('validates committed after endpoints and finishes cleanup after a real crash', () => {
    const root = setup()
    ok(command(root))
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'hosts set', 'committed'], { timeout: 30_000 })
    expect(child.signal, child.stderr?.toString()).toBe('SIGKILL')
    expect(manifest(root).integrations).toEqual(['claude-code'])
    expect(recoverTransaction(root)).toBe(true)
    expect(existsSync(join(root, '.agents/skills/agent-note'))).toBe(false)
    ok(command(root, 'status'))
  })

  it.each(['before-config', 'after-config', 'after-install'])('recovers an initial installation killed at %s', (step) => {
    const root = setup()
    rmSync(join(root, '.agents'), { recursive: true })
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'install', step], { timeout: 30_000 })
    expect(child.signal, child.stderr?.toString()).toBe('SIGKILL')
    expect(recoverTransaction(root)).toBe(true)
    expect(existsSync(join(root, installPath))).toBe(false)
    expect(existsSync(join(root, '.agents/notes/config.json'))).toBe(false)
    expect(existsSync(join(root, '.agents/skills/agent-note'))).toBe(false)
    ok(command(root))
  })

  it('rebuilds both version sources after the manifest has switched but before commit', () => {
    const root = setup()
    ok(command(root))
    const before = read(root, installPath)
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'tool update', 'after-install'], { timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    expect(manifest(root).version).toBe('0.2.0')
    expect(existsSync(join(root, '.agents/notes/runtime/assets/new-resource.md'))).toBe(true)
    expect(recoverTransaction(root)).toBe(true)
    expect(read(root, installPath)).toEqual(before)
    expect(existsSync(join(root, '.agents/notes/runtime/assets/new-resource.md'))).toBe(false)
    ok(command(root, 'status'))
  })

  it('refuses recovery without the supplemental clean source needed by repair', () => {
    const root = setup()
    ok(command(root))
    const path = '.agents/notes/runtime/assets/references/writing.md'
    write(root, path, 'Damaged source requiring evidence')
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'repair'], { timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    const journalPath = '.agents/notes/local/write-lock/journal.json'
    const original = read(root, journalPath)
    const journal = JSON.parse(original.toString())
    expect(Object.keys(journal.context.supplemental).length).toBeGreaterThan(0)
    journal.context.supplemental = {}
    write(root, journalPath, canonical(journal))
    expect(() => recoverTransaction(root)).toThrow(/reconstruct/)
    expect(existsSync(join(root, journalPath))).toBe(true)
    write(root, journalPath, original)
    expect(recoverTransaction(root)).toBe(true)
    expect(read(root, path).toString()).toBe('Damaged source requiring evidence')
    ok(command(root, 'repair'))
  })

  it('rechecks external Git input after file replacement and rolls back', () => {
    const root = setup()
    ok(command(root))
    const before = read(root, installPath)
    const result = command(root, 'tool update', testBundle('0.2.0'), {}, { afterStep(index) {
      if (index === 0)
        write(root, '.git/info/exclude', '# External edit during management\n')
    } })
    expect(result.diagnostics[0].code).toBe('CONCURRENT_CHANGE')
    expect(read(root, installPath)).toEqual(before)
    expect(read(root, '.git/info/exclude').toString()).toBe('# External edit during management\n')
  })

  it.each(['endpoint', 'unchanged-source'])('preserves a %s edit made during the final recovery step', (kind) => {
    const root = setup()
    ok(command(root))
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'hosts set'], { timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    const journalPath = '.agents/notes/local/write-lock/journal.json'
    const journal = JSON.parse(read(root, journalPath).toString())
    const path = kind === 'endpoint' ? journal.entries[0].path : '.agents/notes/runtime/assets/references/writing.md'
    const original = kind === 'endpoint' ? journal.entries[0].before === null ? null : Buffer.from(journal.entries[0].before, 'base64') : read(root, path)
    expect(() => recoverWithHooks(root, validateJournal, { afterStep(index) {
      if (index === journal.entries.length - 1)
        write(root, path, 'Edited during recovery')
    } })).toThrow(/during recovery/)
    expect(read(root, path).toString()).toBe('Edited during recovery')
    expect(existsSync(join(root, journalPath))).toBe(true)
    if (original === null)
      rmSync(join(root, path))
    else write(root, path, original)
    expect(recoverTransaction(root)).toBe(true)
    ok(command(root, 'status'))
  })

  it.each(['extra-entry', 'missing-entry', 'directory', 'created-public-directory', 'outside-block', 'extra-source'])('rejects forged distribution journal %s before any recovery write', (kind) => {
    const root = setup()
    ok(command(root))
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'tool update'], { timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    const path = '.agents/notes/local/write-lock/journal.json'
    const original = read(root, path)
    const journal = JSON.parse(original.toString())
    if (kind === 'extra-entry')
      journal.entries.push({ path: 'README.md', before: null, after: Buffer.from('Unauthorized').toString('base64'), mode: 0o644 })
    if (kind === 'missing-entry')
      journal.entries.pop()
    if (kind === 'directory')
      journal.cleanup.push('.agents')
    if (kind === 'created-public-directory')
      journal.directories.push('.agents')
    if (kind === 'outside-block') {
      const before = read(root, '.gitignore')
      journal.entries.push({ path: '.gitignore', before: before.toString('base64'), after: Buffer.from(`Unauthorized outside text\n${before.toString()}`).toString('base64'), mode: 0o644 })
    }
    if (kind === 'extra-source')
      journal.context.supplemental['0'.repeat(64)] = Buffer.from('Unnecessary').toString('base64')
    write(root, path, canonical(journal))
    const state = read(root, installPath)
    expect(() => recoverTransaction(root)).toThrow()
    expect(read(root, installPath)).toEqual(state)
    expect(existsSync(join(root, 'README.md'))).toBe(false)
    write(root, path, original)
    expect(recoverTransaction(root)).toBe(true)
  })
  it.skipIf(process.getuid?.() === 0)('preserves edited originals when native permissions prevent necessary backup', () => {
    const root = setup()
    ok(command(root))
    const path = '.agents/skills/agent-note/SKILL.md'
    write(root, path, 'Local edit requiring a backup')
    const backupRoot = join(root, '.agents/notes/local/backups')
    mkdirSync(backupRoot, { recursive: true })
    chmodSync(backupRoot, 0o500)
    try {
      const result = command(root, 'repair')
      expect(result.diagnostics[0].code).toBe('BACKUP_FAILED')
      expect(read(root, path).toString()).toBe('Local edit requiring a backup')
    }
    finally { chmodSync(backupRoot, 0o700) }
  })

  it('blocks an independent process while a content-compatible management lock is live', () => {
    const root = setup()
    ok(command(root))
    const result = command(root, 'tool update', testBundle('0.2.0'), {}, { beforeCommit() {
      const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('../src/cli/main.ts', import.meta.url)), 'repair', '--root', root, '--json'], { encoding: 'utf8', timeout: 30_000 })
      expect(child.status).toBe(1)
      expect(JSON.parse(child.stdout).diagnostics[0].code).toBe('WRITE_BUSY')
    } })
    ok(result)
  })

  it('rejects missing Git before writing a plain project and never creates a repository there', () => {
    const root = setup()
    rmSync(join(root, '.git'), { recursive: true })
    const previous = process.env.PATH
    process.env.PATH = root
    try {
      expect(command(root).diagnostics[0].code).toBe('GIT_REQUIRED')
      expect(existsSync(join(root, installPath))).toBe(false)
      expect(existsSync(join(root, '.git'))).toBe(false)
    }
    finally { process.env.PATH = previous }
  })
})
