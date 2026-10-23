import type { InitPrompts } from '../src/cli/init'
import type { Bundle } from '../src/distribution/bundle'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { options, parseArguments, runtimeArguments } from '../src/cli/arguments'
import { completeInit, InitCancelled, interactiveInit, promptInit } from '../src/cli/init'
import { run } from '../src/cli/run'
import { delegate } from '../src/distribution/delegate'
import { manage } from '../src/distribution/manage'
import { Repository, sha256 } from '../src/notes/snapshot'
import { recoverTransaction, recoveryView } from '../src/workflow/transaction'
import { project, write } from './fixtures'

vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
function setup(blank = true): string {
  const root = project()
  roots.push(root)
  if (blank)
    rmSync(join(root, '.agent-notes'), { recursive: true })
  return root
}
function files(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.parentPath.includes('/.git'))
    .map(entry => [join(entry.parentPath, entry.name).slice(root.length + 1), sha256(readFileSync(join(entry.parentPath, entry.name)))]))
}
const fakeBundle: Bundle = {
  version: '0.0.0',
  files: new Map([['cli.mjs', Buffer.from('console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))\n')]]),
  skills: new Map(['agent-note', 'agent-note-maintenance'].map(name => [`${name}/SKILL.md`, Buffer.from(`Skill ${name}\n`)])),
}
function install(root: string): void {
  const result = manage({ command: 'init', root, targets: ['claude'], notesDir: 'docs/decisions', language: 'en', dryRun: false, recover: false }, root, fakeBundle)
  expect(result.result, JSON.stringify(result)).toBe('ok')
}
function adapter(overrides: Partial<InitPrompts> = {}): InitPrompts {
  return { start: vi.fn(), targets: vi.fn<InitPrompts['targets']>(async () => ['agents']), directory: vi.fn(async () => '.agents/notes'), language: vi.fn<InitPrompts['language']>(async () => 'zh-CN'), ...overrides }
}
afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('cLI argument boundary', () => {
  it.each([
    ['context', '--paths', 'a', 'b', '--paths=c', '--topic', '001', '--topic=events', '--include-archived'],
    ['show', '001'],
    ['check', '--base=001', '--head', 'HEAD', '--maintenance'],
    ['check', '--staged'],
    ['init', '--target', 'agents', '--target=claude', '--notes-dir=docs/decisions', '--language=en', '--no-interactive'],
    ['init'],
    ['upgrade', '--recover'],
    ['status'],
    ['create', '--input=-', '--dry-run'],
    ['update', 'id', '--input', '001'],
    ['transition', 'id', '--input', '-', '--to=rejected'],
    ['archive', 'id', '--input', 'file', '--base=HEAD'],
    ['prune', 'id', '--input', 'file', '--recover'],
  ])('preserves meaning in canonical runtime arguments: %j', (...args) => {
    const input = options(['--root=/tmp', '--json', ...args])
    const canonical = runtimeArguments(input)
    // --no-interactive is local to init and never reaches a daily locked runtime.
    expect(options(canonical)).toEqual({ ...input, interactive: undefined })
    if (input.command === 'context') {
      expect(input.paths).toEqual(['a', 'b', 'c'])
      expect(input.topics).toEqual(['001', 'events'])
    }
    if (input.id)
      expect(input.id).toBe(args[1])
  })

  it.each([
    { args: ['context', '--topic', '-internal'], expected: { topics: ['-internal'] } },
    { args: ['context', '--topic=-internal'], expected: { topics: ['-internal'] } },
    { args: ['context', '--paths', '-generated/file.ts', '-other/file.ts', '--topic', '-internal'], expected: { paths: ['-generated/file.ts', '-other/file.ts'], topics: ['-internal'] } },
    { args: ['context', '--paths=-generated/file.ts', 'src/file.ts', '-other/file.ts'], expected: { paths: ['-generated/file.ts', 'src/file.ts', '-other/file.ts'] } },
    { args: ['create', '--input', '-materials.json'], expected: { input: '-materials.json' } },
    { args: ['create', '--input=-materials.json'], expected: { input: '-materials.json' } },
  ])('preserves single-hyphen literal values: $args', ({ args, expected }) => {
    const input = options(args)
    expect(input).toMatchObject(expected)
    expect(options(runtimeArguments(input))).toEqual(input)
  })

  it.each([
    ['unknown'],
    ['context', '--bogus'],
    ['context', '--target', 'agents'],
    ['status', '--dry-run'],
    ['show'],
    ['show', 'one', 'two'],
    ['create'],
    ['update', '--input', '-'],
    ['transition', 'id', '--input', '-', '--to', 'proposed'],
    ['check', '--head', 'HEAD'],
    ['check', '--head', 'HEAD', '--base', 'HEAD', '--staged'],
    ['init', '--dry-run', '--recover'],
    ['init', '--target', 'agents', '--target', 'agents'],
    ['init', '--target', 'other'],
    ['init', '--language', 'other'],
    ['init', '--notes-dir', '../outside'],
    ['context', '--paths'],
    ['context', '--paths', '--include-archived'],
    ['context', '--topic', '--include-archived'],
    ['context', '--paths', '*.ts'],
    ['context', '--topic', ' '],
    ['context', '--root'],
    ['context', '--root', '/tmp', '--root=/tmp'],
    ['context', '--json', '--json'],
    ['context', '--no-json'],
    ['context', '--json=false', '--json'],
    ['context', '--json', '--no-json'],
    ['context', '--root=x', '--root.path=y'],
    ['context', '--json.value=x'],
    ['context', '--root.path=x'],
    ['context', '--includeArchived'],
    ['status', '--no-interactive'],
    ['init', '--no-interactive', '--no-interactive'],
    ['init', '--no-interactive=false'],
    ['init', '--target=agents', '--dry-run=true'],
    ['context', '--', 'extra'],
  ])('returns one structured invalid-input result: %j', (...args) => {
    const input = args.includes('--') ? ['--json', ...args] : [...args, '--json']
    const parsed = parseArguments(input)
    expect(parsed.json).toBe(true)
    expect(run(input)).toMatchObject({ result: 'invalid-input', diagnostics: [{ code: 'INVALID_INPUT' }] })
  })

  it('generates command help without printing and keeps it inside the JSON Result', () => {
    const output = vi.spyOn(console, 'info')
    expect(run(['--json', 'init', '--help'])).toMatchObject({ result: 'ok', data: { help: expect.stringContaining('--no-interactive') } })
    expect(parseArguments([]).help).toContain('Commands:')
    expect(output).not.toHaveBeenCalled()
    expect(run(['show', '--help']).result).toBe('ok')
  })

  it('refuses a modified locked runtime before delegation', () => {
    const root = setup()
    install(root)
    const input = options(['--root', root, 'context', '--paths=a', 'b', '--topic=001', '--json'])
    const runtime = join(root, '.agent-notes/runtime/cli.mjs')
    const child = vi.spyOn(process, 'cwd').mockReturnValue(root)
    // The runtime hash remains authoritative; modified executables are refused.
    write(root, '.agent-notes/runtime/cli.mjs', '// changed')
    expect(() => delegate(input, fileURLToPath(import.meta.url))).toThrow(/locked runtime/)
    child.mockRestore()
    expect(existsSync(runtime)).toBe(true)
  })
})

describe('initialization input acquisition', () => {
  it('asks only missing fields and produces no project writes', async () => {
    const root = setup()
    const before = files(root)
    const prompts = adapter()
    const input = await promptInit(options(['init', '--target', 'claude']), root, prompts)
    expect(input).toMatchObject({ root, targets: ['claude'], notesDir: '.agents/notes', language: 'zh-CN' })
    expect(prompts.targets).not.toHaveBeenCalled()
    expect(prompts.directory).toHaveBeenCalledOnce()
    expect(prompts.language).toHaveBeenCalledOnce()
    expect(files(root)).toEqual(before)
    expect(existsSync(join(root, '.agent-notes'))).toBe(false)
  })

  it('reuses installation/configuration without questions and rejects explicit conflicts', async () => {
    const root = setup()
    install(root)
    const before = files(root)
    const prompts = adapter()
    expect(await promptInit(options(['init']), root, prompts)).toMatchObject({ targets: ['claude'], notesDir: 'docs/decisions', language: 'en' })
    expect(prompts.start).not.toHaveBeenCalled()
    expect(completeInit(options(['init']), root).targets).toEqual(['claude'])
    expect(() => completeInit(options(['init', '--target', 'agents']), root)).toThrow(/targets/)
    expect(() => completeInit(options(['init', '--language', 'zh-CN']), root)).toThrow(/configuration/)
    expect(files(root)).toEqual(before)
  })

  it('preserves a standalone config and collects only its missing targets', async () => {
    const root = setup(false)
    const prompts = adapter()
    await promptInit(options(['init']), root, prompts)
    expect(prompts.targets).toHaveBeenCalledOnce()
    expect(prompts.directory).not.toHaveBeenCalled()
    expect(prompts.language).not.toHaveBeenCalled()
    expect(() => completeInit(options(['init']), root)).toThrow(/require --target/)
    expect(completeInit(options(['init', '--target', 'agents']), root)).toMatchObject({ notesDir: '.agents/notes', language: 'zh-CN' })
  })

  it.each(['targets', 'directory', 'language'] as const)('cancels at %s before any writes', async (field) => {
    const root = setup()
    const before = files(root)
    await expect(promptInit(options(['init']), root, adapter({ [field]: async () => Symbol('cancel') }))).rejects.toBeInstanceOf(InitCancelled)
    expect(files(root)).toEqual(before)
    expect(existsSync(join(root, '.agent-notes'))).toBe(false)
  })

  it('detects configuration changes while answering', async () => {
    const root = setup()
    await expect(promptInit(options(['init']), root, adapter({ language: async () => {
      write(root, '.agent-notes/config.json', '{}')
      return 'zh-CN'
    } }))).rejects.toThrow(/changed/)
    expect(readFileSync(join(root, '.agent-notes/config.json'), 'utf8')).toBe('{}')
    expect(existsSync(join(root, '.agent-notes/install.json'))).toBe(false)
  })

  it('gates interaction on both terminals, CI and explicit output preferences', () => {
    const terminal = { stdinTTY: true, stderrTTY: true, ci: false }
    expect(interactiveInit(options(['init']), terminal)).toBe(true)
    expect(interactiveInit(options(['init', '--json']), terminal)).toBe(false)
    expect(interactiveInit(options(['init', '--no-interactive']), terminal)).toBe(false)
    expect(interactiveInit(options(['init']), { ...terminal, ci: true })).toBe(false)
    expect(interactiveInit(options(['init']), { ...terminal, stdinTTY: false })).toBe(false)
    expect(interactiveInit(options(['init']), { ...terminal, stderrTTY: false })).toBe(false)
  })
})

describe('read-only recovery context', () => {
  it.each(['before-config', 'after-config', 'after-install'])('projects prepared %s crashes without writes, then runs actual init --recover', async (step) => {
    const root = setup()
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'init', step], { encoding: 'utf8', timeout: 30_000 })
    expect(child.signal, child.stderr).toBe('SIGKILL')
    const before = files(root)
    await expect(promptInit(options(['init', '--recover']), root, adapter({ targets: async () => Symbol('cancel') }))).rejects.toBeInstanceOf(InitCancelled)
    expect(files(root)).toEqual(before)
    expect(existsSync(join(root, '.agent-notes/local/write-lock/recovering'))).toBe(false)
    const view = recoveryView(new Repository(root).snapshot('worktree'))
    expect(view.source.read('.agent-notes/config.json')).toBeUndefined()
    expect(view.source.read('.agent-notes/install.json')).toBeUndefined()
    const explicit = step === 'after-install' ? ['--notes-dir', 'docs/decisions', '--language', 'en'] : []
    const cli = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/cli/main.ts', import.meta.url)), 'init', '--recover', '--root', root, '--target', 'agents', ...explicit, '--json'], { encoding: 'utf8', timeout: 30_000 })
    expect(cli.status, cli.stderr || cli.stdout).toBe(0)
    expect(JSON.parse(cli.stdout).data.recovered).toBe(true)
    expect(existsSync(join(root, '.agent-notes/local/write-lock'))).toBe(false)
    if (explicit.length)
      expect(JSON.parse(readFileSync(join(root, '.agent-notes/config.json'), 'utf8'))).toMatchObject({ notes_dir: 'docs/decisions', language: 'en' })
  })

  it.each(['owner.json', 'journal.json'])('detects %s changes while collecting recovery input', async (file) => {
    const root = setup()
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'init', 'after-install'], { timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    const path = `.agent-notes/local/write-lock/${file}`
    const bytes = readFileSync(join(root, path), 'utf8')
    await expect(promptInit(options(['init', '--recover']), root, adapter({ language: async () => {
      write(root, path, `${bytes}\n`)
      return 'zh-CN'
    } }))).rejects.toThrow(/changed/)
    expect(readFileSync(join(root, path), 'utf8')).toBe(`${bytes}\n`)
    expect(existsSync(join(root, '.agent-notes/local/write-lock/recovering'))).toBe(false)
  })

  it('reuses committed endpoints and preserves external edits', () => {
    const root = setup()
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'init', 'after-install'], { encoding: 'utf8', timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    const path = '.agent-notes/local/write-lock/journal.json'
    const journal = JSON.parse(readFileSync(join(root, path), 'utf8'))
    journal.state = 'committed'
    write(root, path, JSON.stringify(journal))
    const view = recoveryView(new Repository(root).snapshot('worktree'))
    expect(view.source.read('.agent-notes/install.json')).toEqual(readFileSync(join(root, '.agent-notes/install.json')))
    view.verify()
    expect(recoverTransaction(root)).toBe(true)
    const other = setup()
    spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), other, 'init', 'after-config'], { timeout: 30_000 })
    write(other, '.agent-notes/config.json', 'external edit')
    expect(() => recoveryView(new Repository(other).snapshot('worktree'))).toThrow(/outside this transaction/)
    expect(() => recoverTransaction(other)).toThrow(/outside this transaction/)
    expect(readFileSync(join(other, '.agent-notes/config.json'), 'utf8')).toBe('external edit')
  })
})
