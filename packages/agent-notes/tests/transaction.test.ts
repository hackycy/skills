import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/cli/run'
import { executeWrite } from '../src/workflow/execute'
import { recoverTransaction } from '../src/workflow/transaction'
import { commit, ids, metadata, note, project, write } from './fixtures'

const roots: string[] = []
function setup(): { root: string, path: string, input: string } {
  const root = project()
  roots.push(root)
  write(root, '.gitignore', '.agent-notes/local/\n')
  const path = note(root, metadata({ status: 'proposed' }))
  write(root, 'README.md', `[Proposal](${path}#proposal)\n`)
  commit(root)
  const input = '.agent-notes/local/input.json'
  write(root, input, JSON.stringify({ expected_hash: run(['show', ids[0], '--root', root]).data.hash, reason: 'This proposal does not preserve the transaction boundary.' }))
  return { root, path, input }
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('transaction guarantees', () => {
  it.each(['note', 'incoming', 'new-incoming', 'runtime', 'input', 'config'])('rejects a concurrent %s change before writing', (kind) => {
    const { root, path, input } = setup()
    const before = readFileSync(join(root, path))
    const result = executeWrite(root, { command: 'transition', id: ids[0], to: 'rejected', input, dryRun: false, recover: false }, undefined, {
      beforeCommit() {
        if (kind === 'note')
          write(root, path, `${before.toString('utf8')}\nIndependent edit.\n`)
        if (kind === 'incoming')
          write(root, 'README.md', 'Independent incoming edit.\n')
        if (kind === 'new-incoming')
          write(root, 'new.md', `[New reference](${path})\n`)
        if (kind === 'runtime')
          write(root, '.agent-notes/runtime/cli.mjs', '// new runtime\n')
        if (kind === 'input')
          write(root, input, '{}')
        if (kind === 'config')
          write(root, '.agent-notes/config.json', '{"format":"agent-notes-config/1","notes_dir":"notes","language":"en"}')
      },
    })
    expect(result.diagnostics.map(item => item.code)).toContain('CONCURRENT_CHANGE')
    expect(existsSync(join(root, path.replace('/proposed/', '/rejected/')))).toBe(false)
    expect(existsSync(join(root, path))).toBe(true)
    if (kind !== 'note')
      expect(readFileSync(join(root, path))).toEqual(before)
    expect(existsSync(join(root, '.agent-notes/local/write-lock'))).toBe(false)
  })

  it('rolls back a multi-file move when a write step fails', () => {
    const { root, path, input } = setup()
    const before = readFileSync(join(root, path))
    const readme = readFileSync(join(root, 'README.md'))
    const result = executeWrite(root, { command: 'transition', id: ids[0], to: 'rejected', input, dryRun: false, recover: false }, undefined, {
      afterStep(index) {
        if (index === 1)
          throw new Error('Injected write failure')
      },
    })
    expect(result.result).toBe('failed')
    expect(readFileSync(join(root, path))).toEqual(before)
    expect(readFileSync(join(root, 'README.md'))).toEqual(readme)
    expect(existsSync(join(root, path.replace('/proposed/', '/rejected/')))).toBe(false)
    expect(existsSync(join(root, '.agent-notes/local/write-lock'))).toBe(false)
    expect(run(['check', '--root', root]).result).toBe('ok')
  })

  it('rechecks the runtime after the last file replacement and rolls back a concurrent upgrade', () => {
    const { root, path, input } = setup()
    const original = readFileSync(join(root, path))
    const result = executeWrite(root, { command: 'transition', id: ids[0], to: 'rejected', input, dryRun: false, recover: false }, undefined, {
      afterStep(index) {
        if (index === 0)
          write(root, '.agent-notes/runtime/cli.mjs', '// concurrent new runtime\n')
      },
    })
    expect(result.diagnostics.map(item => item.code)).toContain('CONCURRENT_CHANGE')
    expect(readFileSync(join(root, path))).toEqual(original)
    expect(readFileSync(join(root, '.agent-notes/runtime/cli.mjs'), 'utf8')).toBe('// concurrent new runtime\n')
    expect(existsSync(join(root, path.replace('/proposed/', '/rejected/')))).toBe(false)
  })

  it('refuses overlapping writers and worktree reads while a transaction is active', () => {
    const { root, input } = setup()
    const options = { command: 'transition', id: ids[0], to: 'rejected', input, dryRun: false, recover: false } as const
    const result = executeWrite(root, options, undefined, {
      beforeCommit() {
        expect(executeWrite(root, options).diagnostics.map(item => item.code)).toContain('WRITE_BUSY')
        expect(run(['check', '--root', root]).diagnostics.map(item => item.code)).toContain('WRITE_BUSY')
        expect(run(['check', '--root', root, '--staged']).result).toBe('ok')
        expect(() => recoverTransaction(root)).toThrow(/live/)
      },
    })
    expect(result.result, JSON.stringify(result)).toBe('ok')
  })

  it('recovers a SIGKILL-interrupted process and then safely retries the requested operation', () => {
    const { root, path } = setup()
    const before = readFileSync(join(root, path))
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./transaction-child.ts', import.meta.url)), root, 'kill', ids[0]], { encoding: 'utf8' })
    expect(child.signal, child.stderr).toBe('SIGKILL')
    expect(existsSync(join(root, '.agent-notes/local/write-lock/journal.json'))).toBe(true)
    expect(run(['check', '--root', root]).diagnostics.map(item => item.code)).toContain('RECOVERY_REQUIRED')
    expect(recoverTransaction(root)).toBe(true)
    expect(readFileSync(join(root, path))).toEqual(before)
    expect(run(['check', '--root', root]).result).toBe('ok')
    const result = run(['transition', ids[0], '--to', 'rejected', '--root', root, '--input', '.agent-notes/local/input.json', '--recover'])
    expect(result.result, JSON.stringify(result)).toBe('ok')
  })

  it('preserves external edits and retains a recoverable journal on rollback conflict', () => {
    const { root, path } = setup()
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./transaction-child.ts', import.meta.url)), root, 'conflict', ids[0]], { encoding: 'utf8' })
    expect(child.status, child.stderr).toBe(0)
    expect(JSON.parse(child.stdout).diagnostics.map((item: { code: string }) => item.code)).toContain('RECOVERY_CONFLICT')
    const destination = path.replace('/proposed/', '/rejected/')
    expect(readFileSync(join(root, destination), 'utf8')).toBe('Independent editor content\n')
    expect(() => recoverTransaction(root)).toThrow(/File changed outside/)
    expect(readFileSync(join(root, destination), 'utf8')).toBe('Independent editor content\n')
    const journal = JSON.parse(readFileSync(join(root, '.agent-notes/local/write-lock/journal.json'), 'utf8'))
    expect(journal.entries[0].path).toBe(destination)
    // The human has preserved/reconciled their edit; restoring either journal endpoint permits recovery.
    rmSync(join(root, destination))
    expect(recoverTransaction(root)).toBe(true)
    expect(existsSync(join(root, path))).toBe(true)
    expect(run(['check', '--root', root]).result).toBe('ok')
  })
})
