import type { Buffer } from 'node:buffer'
import type { Result } from '../src/cli/run'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { checkLinks } from '../src/notes/markdown'
import { Repository, sha256 } from '../src/notes/snapshot'
import { archive, note, project, write } from './fixtures'

/** Real extracted artifacts, never a source-tree manager or an old-format CLI. */
export function integrationMatrix(cli: string, node: string, alternate?: string): void {
  const sandbox = mkdtempSync(join(tmpdir(), 'agent-notes-matrix-'))
  const roots: string[] = []
  const results: Record<string, unknown>[] = []
  const sets = Array.from({ length: 7 }, (_, n) => ['generic', 'codex', 'claude-code'].filter((_, i) => (n + 1) & (1 << i)))
  const receiptPath = '.agents/notes/install.json'
  const flags = (hosts: string[]): string[] => hosts.flatMap(host => ['--host', host])
  const read = (root: string, path: string): Buffer => readFileSync(join(root, path))
  const invoke = (root: string, args: string[], executable = cli): Result => {
    const started = performance.now()
    const result = spawnSync(node, [executable, ...args, '--root', root, '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', npm_config_offline: 'true' } })
    results.push({ argv: [node, executable, ...args, '--root', root, '--json'], cwd: root, stdout: result.stdout, stderr: result.stderr, exit: result.status, elapsed_ms: performance.now() - started })
    assert.equal(result.status, 0, result.stdout || result.stderr)
    assert.equal(result.stderr, '')
    return JSON.parse(result.stdout)
  }
  const assertAssets = (root: string, reference: string, notesDir = '.agents/notes'): void => {
    const path = `${notesDir}/install.json`
    assert.deepEqual(read(root, path), read(reference, path))
    const receipt = JSON.parse(read(root, path).toString())
    for (const asset of receipt.assets) assert.deepEqual(read(root, asset.path), read(reference, asset.path), asset.path)
  }
  try {
    const references = new Map<string, string>()
    for (const hosts of sets) {
      const root = project()
      roots.push(root)
      for (const path of ['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.claude/CLAUDE.local.md']) write(root, path, `Rules ${path}\r\n`)
      write(root, '.gitignore', '.agents/\n.claude/\n')
      invoke(root, ['install', ...flags(hosts)])
      references.set(hosts.join(), root)
      const receipt = read(root, receiptPath)
      assert.deepEqual(invoke(root, ['install']).data.changes, [])
      assert.deepEqual(read(root, receiptPath), receipt)
      const source = new Repository(root).snapshot('worktree')
      assert.deepEqual(checkLinks(source, source.paths().filter(path => path.endsWith('.md'))), [])
      const custom = project()
      roots.push(custom)
      rmSync(join(custom, '.agents/notes'), { recursive: true })
      invoke(custom, ['install', ...flags(hosts), '--notes-dir', '.agents/notes-two'])
      const sourceIndex = JSON.parse(read(custom, '.agents/notes-two/runtime/source-index.json').toString())
      assert.equal(sourceIndex.notes_dir, '.agents/notes-two')
      assert.ok(!read(custom, `${hosts.some(host => host === 'generic' || host === 'codex') ? '.agents' : '.claude'}/skills/agent-note/SKILL.md`).toString().includes('notes-two-two'))
      invoke(custom, ['repair'])
    }
    for (const from of sets) {
      for (const to of sets) {
        const root = join(sandbox, `transition-${sets.indexOf(from)}-${sets.indexOf(to)}`)
        cpSync(references.get(from.join())!, root, { recursive: true })
        write(root, 'private.txt', 'Unknown project content\n')
        const request = invoke(root, ['hosts', 'set', ...flags(to)])
        if (from.join() === to.join())
          assert.deepEqual(request.data.changes, [])
        assertAssets(root, references.get(to.join())!)
        assert.equal(read(root, 'private.txt').toString(), 'Unknown project content\n')
        for (const path of ['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.claude/CLAUDE.local.md']) assert.equal(read(root, path).toString(), `Rules ${path}\r\n`)
      }
    }
    if (alternate) {
      const a = JSON.parse(readFileSync(join(dirname(cli), 'source-index.json'), 'utf8'))
      const b = JSON.parse(readFileSync(join(dirname(alternate), 'source-index.json'), 'utf8'))
      assert.notEqual(a.version, b.version)
      assert.notDeepEqual(a.files.map((file: { path: string }) => file.path), b.files.map((file: { path: string }) => file.path), 'A/B must change real resource inventory')
      for (const hosts of sets) {
        const root = references.get(hosts.join())!
        const config = read(root, '.agents/notes/config.json')
        const frozen = archive(root, note(root))
        const body = read(root, frozen)
        const seal = read(root, '.agents/notes/archived/manifest.json')
        for (const selected of [alternate, cli]) {
          invoke(root, ['tool', 'update'], selected)
          assert.deepEqual(read(root, '.agents/notes/config.json'), config)
          assert.deepEqual(read(root, frozen), body)
          assert.deepEqual(read(root, '.agents/notes/archived/manifest.json'), seal)
          invoke(root, ['status'], selected)
          const state = JSON.parse(read(root, receiptPath).toString())
          const index = JSON.parse(read(root, '.agents/notes/runtime/source-index.json').toString())
          assert.equal(state.bundle_sha256, sha256(read(root, '.agents/notes/runtime/source-index.json')))
          for (const file of index.files) assert.equal(sha256(read(root, `.agents/notes/runtime/${file.path}`)), file.sha256)
        }
        write(root, '.agents/notes/runtime/assets/unknown.txt', 'Unknown adjacent bytes\n')
        write(root, '.agents/notes/runtime/assets/skills/agent-note/SKILL.md', 'Corrupt source\n')
        invoke(root, ['repair'])
        assert.equal(read(root, '.agents/notes/runtime/assets/unknown.txt').toString(), 'Unknown adjacent bytes\n')
      }
    }
    const version = spawnSync(node, ['--version'], { encoding: 'utf8' }).stdout.trim()
    console.log(`Real integration matrix passed (${version}): 7 default/custom sets, 49 transitions${alternate ? ', 14 A/B switches and 7 source repairs' : ''}`)
  }
  finally {
    if (process.env.AGENT_NOTES_EVIDENCE)
      writeFileSync(`${process.env.AGENT_NOTES_EVIDENCE}.matrix.json`, JSON.stringify({ os: process.platform, arch: process.arch, node, cli_sha256: sha256(readFileSync(cli)), alternate_sha256: alternate ? sha256(readFileSync(alternate)) : null, runs: results, runner_memory: process.memoryUsage(), runner_usage: process.resourceUsage() }, null, 2))
    for (const root of [...roots, sandbox]) rmSync(root, { recursive: true, force: true })
  }
}
