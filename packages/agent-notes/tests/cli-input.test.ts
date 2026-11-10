import type { InitPrompts } from '../src/cli/init'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { options, parseArguments, runtimeArguments } from '../src/cli/arguments'
import { completeInit, InitCancelled, interactiveInit, promptInit } from '../src/cli/init'
import { manage } from '../src/distribution/manage'
import { sha256 } from '../src/notes/snapshot'
import { testBundle } from './distribution-fixtures'
import { project, write } from './fixtures'

const roots: string[] = []
function setup(): string {
  const root = project()
  roots.push(root)
  rmSync(join(root, '.agents/notes'), { recursive: true })
  return root
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
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'install', step], { timeout: 30_000 })
    expect(child.signal, child.stderr?.toString()).toBe('SIGKILL')
    const journalPath = join(root, '.agents/notes/local/write-lock/journal.json')
    const hash = sha256(readFileSync(journalPath))
    await expect(promptInit(options(['install', '--recover']), root, adapter({ hosts: async () => Symbol('cancel') }))).rejects.toBeInstanceOf(InitCancelled)
    expect(sha256(readFileSync(journalPath))).toBe(hash)
  })
})
