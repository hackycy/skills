import type { InitPrompts } from '../src/cli/init'
import type { Result } from '../src/cli/run'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { options, parseArguments, runtimeArguments } from '../src/cli/arguments'
import { InitCancelled, interactiveInit } from '../src/cli/init'
import { sha256 } from '../src/notes/snapshot'
import { testBundle } from './distribution-fixtures'
import { git, project, write } from './fixtures'
import { completeInit, manage, promptInit } from './production'

vi.setConfig({ testTimeout: 30_000 })
const roots: string[] = []
const defaultNotesDir = '.agents/notes'
const childPath = fileURLToPath(new URL('./distribution-child.ts', import.meta.url))
const main = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url))
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
function setup(): string {
  const root = project()
  roots.push(root)
  rmSync(join(root, '.agents/notes'), { recursive: true })
  return root
}
function interruptInstall(root: string, step: string, notesDir = defaultNotesDir, bundlePath?: string): void {
  const args = [root, 'install', step, notesDir]
  if (bundlePath)
    args.push(bundlePath)
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), childPath, ...args], { timeout: 30_000 })
  expect(child.signal, child.stderr?.toString()).toBe('SIGKILL')
}

function cli(root: string, args: string[], status = 0): Result {
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), main, ...args, '--root', root, '--json'], { encoding: 'utf8', timeout: 30_000 })
  expect(child.status, child.stdout || child.stderr).toBe(status)
  return JSON.parse(child.stdout)
}

function projectTree(root: string): [string, string | null][] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map(entry => ({ entry, path: relative(root, join(entry.parentPath, entry.name)).split(sep).join('/') }))
    .filter(({ path }) => path !== '.git' && !path.startsWith('.git/'))
    .map(({ entry, path }): [string, string | null] => [path, entry.isDirectory() ? null : sha256(readFileSync(join(root, path)))])
    .sort(([left], [right]) => left.localeCompare(right))
}

function adapter(overrides: Partial<InitPrompts> = {}): InitPrompts {
  return { start: vi.fn(), hosts: vi.fn(async () => ['generic']), directory: vi.fn(async () => '.agents/notes'), language: vi.fn<InitPrompts['language']>(async () => 'zh-CN'), ...overrides }
}
afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
  vi.restoreAllMocks()
})

describe('cLI responsibilities and inputs', () => {
  it.each([
    ['context', '--paths', 'a', 'b', '--paths=c', '--topic', '001', '--topic=events', '--include-archived'],
    ['show', '001'],
    ['check', '--base=001', '--head', 'HEAD', '--maintenance'],
    ['check', '--staged'],
    ['install', '--host', 'generic', '--host=claude-code', '--notes-dir=docs/decisions', '--language=en', '--no-interactive'],
    ['install'],
    ['tool', 'update', '--recover'],
    ['hosts', 'set', '--host', 'codex'],
    ['repair', '--dry-run'],
    ['status'],
    ['create', '--input=-', '--dry-run'],
    ['update', 'id', '--input', '001'],
    ['transition', 'id', '--input', '-', '--to=rejected'],
    ['archive', 'id', '--input', 'file', '--base=HEAD'],
    ['prune', 'id', '--input', 'file', '--recover'],
    ['prune', 'id', '--mechanical', '--input=-', '--base=HEAD', '--dry-run'],
    ['context', '--topic=-internal'],
    ['context', '--paths', '-generated/file.ts', '-other/file.ts'],
  ])('preserves canonical delegation for %j', (...args) => {
    const input = options(['--root=/tmp', '--json', ...args])
    expect(options(runtimeArguments(input))).toEqual({ ...input, interactive: undefined })
  })

  it.each([
    ['init'],
    ['upgrade'],
    ['tool'],
    ['tool', 'update', 'id'],
    ['hosts'],
    ['hosts', 'remove'],
    ['unknown'],
    ['context', '--host', 'generic'],
    ['status', '--dry-run'],
    ['repair', '--host', 'generic'],
    ['repair', '--dry-run', '--recover'],
    ['show'],
    ['show', 'one', 'two'],
    ['create'],
    ['update', '--input', '-'],
    ['update'],
    ['transition', 'id', '--input', '-', '--to', 'proposed'],
    ['archive', 'id', '--input', '-', '--mechanical'],
    ['prune', 'id', '--input', '-', '--mechanical=false'],
    ['check', '--head', 'HEAD'],
    ['check', '--head', 'HEAD', '--base', 'HEAD', '--staged'],
    ['install', '--dry-run', '--recover'],
    ['install', '--host', 'generic', '--host', 'generic'],
    ['install', '--target', 'agents'],
    ['install', '--language', 'other'],
    ['install', '--notes-dir', '../outside'],
    ['context', '--paths'],
    ['context', '--paths', '*.ts'],
    ['context', '--topic', ' '],
    ['context', '--root'],
    ['context', '--root.path=x'],
    ['context', '--json=false'],
  ])('rejects malformed or removed arguments: %j', (...args) => {
    expect(parseArguments(args).error).toBeDefined()
  })

  it('derives help choices and separates Note update from tool update', () => {
    const help = parseArguments(['install', '--help', '--json'])
    expect(help.help).toContain('--host')
    expect(help.help).toContain('claude-code')
    expect(parseArguments(['--help'], 'runtime').help).toContain('hosts set')
    expect(parseArguments(['--help'], 'runtime').help).not.toContain('tool update')
    expect(parseArguments(['tool', 'update', '--recover'], 'runtime').error).toBeDefined()
    expect(options(['update', 'note-id', '--input', '-']).command).toBe('update')
    expect(options(['tool', 'update']).command).toBe('tool update')
  })

  it('defaults first install to generic and reuses existing set without assuming generic', () => {
    const root = setup()
    expect(completeInit(options(['install']), root).hosts).toEqual(['generic'])
    const result = manage({ command: 'install', root, hosts: ['claude-code'], notesDir: 'docs/decisions', language: 'en', dryRun: false, recover: false }, root, testBundle())
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(completeInit(options(['install']), root)).toMatchObject({ hosts: ['claude-code'], notesDir: 'docs/decisions', language: 'en' })
    expect(() => completeInit(options(['install', '--host', 'generic']), root)).toThrow(/hosts set/)
    expect(() => completeInit(options(['hosts', 'set']), root)).toThrow(/complete nonempty/)
    expect(() => completeInit(options(['install', '--host', 'unknown']), setup())).toThrow(/Unknown integration/)
  })

  it('asks only missing install inputs and preselects the current hosts set', async () => {
    const root = setup()
    const prompts = adapter()
    await promptInit(options(['install', '--host', 'codex']), root, prompts)
    expect(prompts.hosts).not.toHaveBeenCalled()
    expect(prompts.directory).toHaveBeenCalledOnce()
    expect(prompts.language).toHaveBeenCalledOnce()
    expect(existsSync(join(root, '.agents/notes/install.json'))).toBe(false)
    expect(manage({ command: 'install', root, hosts: ['codex'], dryRun: false, recover: false }, root, testBundle()).result).toBe('ok')
    const setPrompts = adapter()
    await promptInit(options(['hosts', 'set']), root, setPrompts)
    expect(setPrompts.hosts).toHaveBeenCalledWith(['codex'])
    expect(setPrompts.directory).not.toHaveBeenCalled()
    expect(setPrompts.language).not.toHaveBeenCalled()
  })

  it.each(['hosts', 'directory', 'language'] as const)('cancels %s without writes', async (field) => {
    const root = setup()
    await expect(promptInit(options(['install']), root, adapter({ [field]: async () => Symbol('cancel') }))).rejects.toBeInstanceOf(InitCancelled)
    expect(existsSync(join(root, '.agents/notes'))).toBe(false)
  })

  it('detects project changes made during input collection', async () => {
    const root = setup()
    await expect(promptInit(options(['install']), root, adapter({ language: async () => {
      write(root, '.agents/notes/config.json', 'external edit')
      return 'en'
    } }))).rejects.toThrow(/changed/i)
  })

  it('gates interaction on terminals, CI and explicit output preferences', () => {
    const tty = { stdinTTY: true, stderrTTY: true, ci: false }
    expect(interactiveInit(options(['install']), tty)).toBe(true)
    expect(interactiveInit(options(['hosts', 'set']), tty)).toBe(true)
    for (const args of [['install', '--json'], ['install', '--no-interactive'], ['status']]) expect(interactiveInit(options(args), tty)).toBe(false)
    expect(interactiveInit(options(['install']), { ...tty, ci: true })).toBe(false)
  })

  it.each(['before-config', 'after-config', 'after-install'])('keeps interrupted %s state untouched when input is cancelled', async (step) => {
    const root = setup()
    interruptInstall(root, step)
    const journalPath = join(root, '.agents/notes/local/write-lock/journal.json')
    const hash = sha256(readFileSync(journalPath))
    await expect(promptInit(options(['install', '--recover']), root, adapter({ hosts: async () => Symbol('cancel') }))).rejects.toBeInstanceOf(InitCancelled)
    expect(sha256(readFileSync(journalPath))).toBe(hash)
  })
})

describe('first installation recovery through the CLI', () => {
  it.each([
    { step: 'after-config', notesDir: defaultNotesDir, args: [] },
    { step: 'after-config', notesDir: 'docs/decisions', args: ['--notes-dir', 'docs/decisions', '--host', 'generic', '--language', 'zh-CN'] },
    { step: 'after-install', notesDir: defaultNotesDir, args: [] },
  ])('recovers a prepared install at $step in $notesDir', ({ step, notesDir, args }) => {
    const root = setup()
    interruptInstall(root, step, notesDir)
    const journal = join(root, notesDir, 'local/write-lock/journal.json')
    expect(JSON.parse(readFileSync(journal, 'utf8')).state).toBe('prepared')
    expect(existsSync(join(root, notesDir, 'runtime/cli.mjs'))).toBe(true)
    expect(existsSync(join(root, notesDir, 'config.json'))).toBe(true)
    expect(existsSync(join(root, notesDir, 'install.json'))).toBe(step === 'after-install')
    expect(cli(root, ['context'], 1).diagnostics[0]?.code).toBe('RECOVERY_REQUIRED')

    const request = ['install', '--recover', ...args]
    expect(cli(root, request)).toMatchObject({ result: 'ok', data: { recovered: true, notes_dir: notesDir } })
    expect(existsSync(join(root, notesDir, 'local/write-lock'))).toBe(false)
    expect(cli(root, ['status'])).toMatchObject({ result: 'ok', data: { integrity: 'intact', notes_dir: notesDir, integrations: ['generic'] } })
    expect(cli(root, ['context']).result).toBe('ok')
    expect(cli(root, request)).toMatchObject({ result: 'ok', data: { recovered: false, changes: [] } })
  })

  it('finishes a committed install without rewriting the published files', () => {
    const root = setup()
    interruptInstall(root, 'committed', defaultNotesDir, packageRoot)
    const lock = `${defaultNotesDir}/local/write-lock`
    expect(JSON.parse(readFileSync(join(root, lock, 'journal.json'), 'utf8')).state).toBe('committed')
    const before = projectTree(root).filter(([path]) => path !== lock && !path.startsWith(`${lock}/`))

    expect(cli(root, ['install', '--recover'])).toMatchObject({ result: 'ok', data: { recovered: true, changes: [] } })
    expect(projectTree(root)).toEqual(before)
    expect(cli(root, ['status'])).toMatchObject({ result: 'ok', data: { integrity: 'intact' } })
  })

  it('rejects a runtime without a receipt or journal', () => {
    const root = setup()
    write(root, `${defaultNotesDir}/runtime/cli.mjs`, 'Unowned runtime')
    const before = projectTree(root)
    expect(cli(root, ['install', '--recover'], 1).diagnostics[0]?.code).toBe('INVALID_INSTALLATION')
    expect(projectTree(root)).toEqual(before)
  })

  it.each([
    { path: `${defaultNotesDir}/runtime/unknown-dir`, code: 'INVALID_INSTALLATION' },
    { path: '.agents/skills/agent-note/private.txt', code: 'UNOWNED_ASSET' },
    { path: `${defaultNotesDir}/runtime/cli.mjs`, code: 'RECOVERY_CONFLICT' },
  ])('preserves interrupted state on $code at $path', ({ path, code }) => {
    const root = setup()
    interruptInstall(root, 'after-config')
    if (path.endsWith('/unknown-dir')) {
      mkdirSync(join(root, path))
    }
    else {
      write(root, path, 'External content')
      if (path.endsWith('/private.txt'))
        expect(git(root, 'check-ignore', '--no-index', path)).toBe(path)
    }
    const before = projectTree(root)
    expect(cli(root, ['install', '--recover'], 1).diagnostics[0]?.code).toBe(code)
    expect(projectTree(root)).toEqual(before)
  })

  it('rechecks projected directories after collecting input', async () => {
    const root = setup()
    interruptInstall(root, 'after-config')
    const before = projectTree(root)
    const path = `${defaultNotesDir}/runtime/unknown-dir`
    await expect(promptInit(options(['install', '--recover']), root, adapter({ language: async () => {
      mkdirSync(join(root, path))
      return 'zh-CN'
    } }))).rejects.toMatchObject({ code: 'CONCURRENT_CHANGE' })
    expect(projectTree(root).filter(([entry]) => entry !== path)).toEqual(before)
  })
})
