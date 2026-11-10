import type { Bundle } from '../src/distribution/bundle'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { readBundle } from '../src/distribution/bundle'
import { manage } from '../src/distribution/manage'
import { boundedRead, canonical } from '../src/distribution/protocol'
import { project, write } from './fixtures'

const paths = process.argv.slice(2)
const load = (cli: string): Bundle => readBundle((path, max) => boundedRead(path, max), join(dirname(cli), 'source-index.json'), path => path === 'cli.mjs' ? cli : join(dirname(cli), '..', path))
const [a, b] = paths.map(load)
assert.ok(a && b, 'Pass two real extracted CLIs')
const results: Record<string, unknown>[] = []
for (const hosts of Array.from({ length: 7 }, (_, n) => ['generic', 'codex', 'claude-code'].filter((_, i) => (n + 1) & (1 << i)))) {
  const root = project()
  try {
    for (const [command, source] of [['install', a], ['tool update', b], ['tool update', a], ['repair', a]] as const) {
      if (command === 'repair') {
        write(root, '.agents/notes/runtime/assets/skills/agent-note/SKILL.md', 'Damaged local source\n')
        write(root, `${hosts.some(id => id === 'generic' || id === 'codex') ? '.agents' : '.claude'}/skills/agent-note/SKILL.md`, 'User skill edit\n')
      }
      let measure: Record<string, unknown> = {}
      const started = performance.now()
      const result = manage({ command, root, hosts: command === 'install' ? hosts : [], dryRun: false, recover: false }, root, source, { afterStep() {
        if (Object.keys(measure).length)
          return
        const bytes = readFileSync(join(root, '.agents/notes/local/write-lock/journal.json'))
        const journal = JSON.parse(bytes.toString())
        const endpoints = journal.entries.flatMap((entry: { before: string | null, after: string | null }) => [entry.before, entry.after]).filter((value: string | null) => value !== null).map((value: string) => Buffer.from(value, 'base64').length)
        const context = journal.context
        const indices = [context.beforeIndex, context.afterIndex].filter(Boolean).map((value: string) => Buffer.from(value, 'base64'))
        const indexData = indices.map((bytes: Buffer) => JSON.parse(bytes.toString()))
        const totals = indexData.map((index: { files: { path: string, sha256: string }[] }) => index.files.reduce((total: number, file) => total + (file.path === 'cli.mjs' ? source.files.get('cli.mjs')!.length : (source.files.get(file.path)?.length ?? a.files.get(file.path)?.length ?? b.files.get(file.path)!.length)), 0))
        measure = { journal_encoded: bytes.length, endpoint_max: Math.max(...endpoints), endpoint_decoded: endpoints.reduce((a: number, b: number) => a + b, 0), indices: indices.map((bytes: Buffer) => bytes.length), source_totals: totals, source_counts: indexData.map((index: { files: unknown[] }) => index.files.length), supplemental: Object.values(context.supplemental).reduce((sum: number, value) => sum + Buffer.from(String(value), 'base64').length, 0), decoded_conservative: endpoints.reduce((a: number, b: number) => a + b, 0) + indices.reduce((sum: number, value: Buffer) => sum + value.length, 0) + totals.reduce((a: number, b: number) => a + b, 0) + canonical({ operation: context.operation, config: context.config, before: context.before, after: context.after }).length, entries: journal.entries.length, directories: journal.directories.length + journal.cleanup.length, assets: context.after.assets.length, path_max: Math.max(...journal.entries.map((entry: { path: string }) => Buffer.byteLength(entry.path)), ...journal.directories.map((path: string) => Buffer.byteLength(path))), source_max: Math.max(...[...source.files.values()].map(bytes => bytes.length)) }
      } })
      assert.equal(result.result, 'ok', JSON.stringify(result))
      const backups = result.data.backup ? readdirSync(join(root, String(result.data.backup)), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)) : []
      results.push({ backup_bytes: backups.reduce((sum, path) => sum + readFileSync(path).length, 0), backup_path_max: Math.max(0, ...backups.map(path => Buffer.byteLength(path.slice(root.length + 1)))), hosts, command, version: JSON.parse(source.index.toString()).version, elapsed_ms: performance.now() - started, ...measure })
    }
  }
  finally { rmSync(root, { recursive: true, force: true }) }
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, max_rss_kib: process.resourceUsage().maxRSS, results }, null, 2))
