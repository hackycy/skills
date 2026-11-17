import type { SpawnSyncReturns } from 'node:child_process'
import type { Result } from '../src/cli/run'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { archive, ids, metadata, note, project, write } from './fixtures'

// Both CLIs must come from real extracted packages; the old one predates D5.
const oldCli = resolve(process.argv[2])
const newCli = resolve(process.argv[3])
const node = process.argv[4] ?? process.execPath
const sets = Array.from({ length: 7 }, (_, n) => ['generic', 'codex', 'claude-code'].filter((_, i) => (n + 1) & (1 << i)))
const roots: string[] = []
try {
  for (const notesDir of ['.agents/notes', 'docs/decisions']) {
    for (const hosts of sets) {
      const root = project()
      roots.push(root)
      rmSync(join(root, '.agents/notes'), { recursive: true })
      const original = '/vendor/\r\n'
      write(root, '.rgignore', original)
      const invoke = (cli: string, args: string[]): Result => {
        const result = spawnSync(node, [cli, ...args, '--root', root, '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
        assert.equal(result.status, 0, result.stdout || result.stderr)
        return JSON.parse(result.stdout)
      }
      invoke(oldCli, ['install', '--notes-dir', notesDir, ...hosts.flatMap(host => ['--host', host])])
      const installPath = `${notesDir}/install.json`
      const before = readFileSync(join(root, installPath))
      assert.equal(JSON.parse(before.toString()).assets.some((asset: { path: string }) => asset.path === '.rgignore'), false)
      const frozen = archive(root, note(root))
      const active = note(root, metadata({ id: ids[1] }), 'active')
      const paths = [frozen, active, '.agents/notes/archived/manifest.json']
      const actual = (path: string): string => path.replace('.agents/notes', notesDir)
      if (notesDir !== '.agents/notes') {
        for (const path of paths) write(root, actual(path), readFileSync(join(root, path)))
        rmSync(join(root, '.agents/notes'), { recursive: true })
      }
      const preserved = [...paths.map(actual), `${notesDir}/config.json`].map(path => [path, readFileSync(join(root, path))] as const)
      invoke(newCli, ['status']) // The new manager must validate the real old receipt.
      const preview = invoke(newCli, ['tool', 'update', '--dry-run'])
      assert.ok((preview.data.changes as { path: string }[]).some(change => change.path === '.rgignore'))
      assert.deepEqual(readFileSync(join(root, installPath)), before)
      assert.equal(readFileSync(join(root, '.rgignore'), 'utf8'), original)
      invoke(newCli, ['tool', 'update'])
      assert.equal(readFileSync(join(root, '.rgignore'), 'utf8'), `${original}\n# agent-notes:begin\n/${notesDir}/archived/\n# agent-notes:end\n`)
      const installation = JSON.parse(readFileSync(join(root, installPath), 'utf8'))
      assert.notEqual(installation.version, JSON.parse(before.toString()).version)
      assert.deepEqual(installation.integrations, [...hosts].sort())
      for (const [path, bytes] of preserved) assert.deepEqual(readFileSync(join(root, path)), bytes, path)
      const pointers = (flags: string[]): { id: string }[] => invoke(newCli, ['context', '--topic', 'events', ...flags]).data.notes as { id: string }[]
      assert.deepEqual(pointers([]).map(note => note.id), [ids[1]])
      assert.ok(pointers(['--include-archived']).some(note => note.id === ids[0]))
      assert.equal(invoke(newCli, ['show', ids[0]]).data.path, actual(frozen))
      const search = (path: string): SpawnSyncReturns<string> => spawnSync('rg', ['--no-config', '--hidden', '-l', '-F', 'Infrastructure publication', path], { cwd: root, encoding: 'utf8' })
      const current = search('.')
      assert.equal(current.status, 0, current.stderr)
      assert.deepEqual(current.stdout.trim().split('\n'), [`./${actual(active)}`])
      assert.equal(search(`${notesDir}/archived`).stdout.trim(), actual(frozen))
      assert.equal(invoke(newCli, ['status']).data.integrity, 'intact')
      assert.deepEqual(invoke(newCli, ['tool', 'update']).data.changes, [])
      assert.equal(existsSync(join(root, `${notesDir}/local/write-lock/journal.json`)), false)
    }
  }
  console.log('Archive search upgrade passed: real old/new packages, 7 integration sets, default/custom roots, preserved Notes/config/seal and explicit history.')
}
finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
}
