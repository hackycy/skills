import type { Result } from '../src/cli/run'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256 } from '../src/notes/snapshot'
import { project } from './fixtures'

vi.setConfig({ testTimeout: 30_000 })
const roots: string[] = []
const main = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url))
function setup(): string {
  const root = project()
  rmSync(join(root, '.agent-notes'), { recursive: true })
  roots.push(root)
  return root
}
function terminal(root: string, args: string[], actions: { expect: string, send: string }[], env = {}): { status: number, stdout: string, stderr: string } {
  const result = spawnSync('python3', [fileURLToPath(new URL('./terminal-driver.py', import.meta.url))], { encoding: 'utf8', input: JSON.stringify({ root, argv: [process.execPath, '--import', import.meta.resolve('tsx'), main, ...args], actions, env }), timeout: 28_000 })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe.skipIf(process.platform === 'win32')('real terminal initialization', () => {
  it.each(['\x1B', '\x03'])('cancels with exit 130 and empty stdout (%j)', (key) => {
    const root = setup()
    const result = terminal(root, ['init'], [{ expect: 'Installation targets', send: key }])
    expect(result).toMatchObject({ status: 130, stdout: '' })
    expect(result.stderr).toContain('Initialization cancelled')
    expect(readdirSync(root)).toEqual(['.git'])
  })

  it.each(['Notes directory', 'Template language'])('cancels at %s before creating local state', (question) => {
    const root = setup()
    const actions = [{ expect: 'Installation targets', send: '\r' }]
    if (question === 'Template language')
      actions.push({ expect: 'Notes directory', send: '\r' })
    actions.push({ expect: question, send: '\x03' })
    expect(terminal(root, ['init'], actions)).toMatchObject({ status: 130, stdout: '' })
    expect(readdirSync(root)).toEqual(['.git'])
  })

  it('corrects invalid input in place and previews without writes', () => {
    const root = setup()
    const result = terminal(root, ['init', '--dry-run'], [
      { expect: 'Installation targets', send: '\r' },
      { expect: 'Notes directory', send: 'bad path\r' },
      { expect: 'without whitespace', send: '\x15docs/decisions\r' },
      { expect: 'Template language', send: '\r' },
    ])
    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(result.stderr).toContain(root)
    expect(result.stdout).toContain('init: ok')
    expect(result.stdout).not.toContain('Installation targets')
    expect(existsSync(join(root, '.agent-notes'))).toBe(false)
  })

  it('installs default answers, then reuses installed values without questions', () => {
    const root = setup()
    const result = terminal(root, ['init'], [
      { expect: 'Installation targets', send: '\r' },
      { expect: 'Notes directory', send: '\r' },
      { expect: 'Template language', send: '\r' },
    ])
    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(JSON.parse(readFileSync(join(root, '.agent-notes/install.json'), 'utf8')).targets).toEqual(['agents'])
    expect(terminal(root, ['init'], [])).toMatchObject({ status: 0, stderr: '' })
  })

  it('cancels init --recover in a real terminal without changing interrupted files', () => {
    const root = setup()
    const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'init', 'after-install'], { timeout: 30_000 })
    expect(child.signal).toBe('SIGKILL')
    const tree = (): Record<string, string> => Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && !entry.parentPath.includes('/.git'))
      .map(entry => [join(entry.parentPath, entry.name), sha256(readFileSync(join(entry.parentPath, entry.name)))]))
    const before = tree()
    const paths = readdirSync(root, { recursive: true })
    expect(terminal(root, ['init', '--recover'], [{ expect: 'Installation targets', send: '\x03' }])).toMatchObject({ status: 130, stdout: '' })
    expect(tree()).toEqual(before)
    expect(readdirSync(root, { recursive: true })).toEqual(paths)
  })

  it.each<string[]>([['--json'], ['--no-interactive'], []])('does not prompt when disabled (%j)', (...args) => {
    const root = setup()
    const result = terminal(root, ['init', ...args], [], args.length ? {} : { CI: '1' })
    expect(result.status).toBe(2)
    expect(result.stderr).toBe('')
    if (args.includes('--json')) {
      const output: Result = JSON.parse(result.stdout)
      expect(output.result).toBe('invalid-input')
    }
    expect(existsSync(join(root, '.agent-notes'))).toBe(false)
  })
})
