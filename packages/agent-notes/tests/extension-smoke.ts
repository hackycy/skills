import type { Result } from '../src/cli/run'
import type { Installation } from '../src/distribution/manifest'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sha256 } from '../src/notes/snapshot'

// Builds real test-only packages outside the checkout. Never edits the product
// catalog or introduces a test host branch in production code.
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const workspace = resolve(packageRoot, '../..')
const output = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'agent-notes-extension-')))
const node = process.argv[3] ?? process.execPath
mkdirSync(output, { recursive: true })
const records: unknown[] = []
function invoke(executable: string, args: string[], cwd: string): string {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, maxBuffer: 16 * 1024 ** 2 })
  records.push({ executable, args, cwd, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout
}
try {
  for (const [variant, skillRoot] of [['new-root', '.example/skills'], ['shared-root', '.agents/skills']]) {
    const fixture = join(output, `${variant}-source`)
    mkdirSync(fixture)
    for (const path of ['src', 'scripts', 'assets', 'docs', 'package.json', 'README.md', 'tsdown.config.ts'])
      cpSync(join(packageRoot, path), join(fixture, path), { recursive: true })
    mkdirSync(join(fixture, 'node_modules'))
    for (const name of ['cac', '@clack', '@types', 'ajv', 'ajv-formats', 'github-slugger', 'mdast-util-to-string', 'remark-gfm', 'remark-parse', 'unified', 'yaml', 'zod'])
      symlinkSync(join(packageRoot, 'node_modules', name), join(fixture, 'node_modules', name), 'dir')
    for (const name of ['tsdown', 'tsx'])
      symlinkSync(join(workspace, 'node_modules', name), join(fixture, 'node_modules', name), 'dir')
    const catalogPath = join(fixture, 'src/distribution/integrations.ts')
    const catalog = readFileSync(catalogPath, 'utf8')
    writeFileSync(catalogPath, catalog.replace('] as const', `  { id: 'example-agent', label: 'Example', default: false, skillRoot: '${skillRoot}' },\n] as const`))
    invoke(join(workspace, 'node_modules/.bin/tsdown'), [], fixture)
    const packed = JSON.parse(invoke('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', output], fixture))
    const tarball = join(output, `${variant}.tgz`)
    cpSync(join(output, packed[0].filename), tarball)
    const extracted = join(output, `${variant}-extracted`)
    mkdirSync(extracted)
    invoke('tar', ['-xzf', tarball, '-C', extracted], output)
    const cli = join(extracted, 'package/dist/cli.mjs')
    const root = join(output, `${variant}-project`)
    mkdirSync(root)
    invoke('git', ['init', '-q', root], output)
    const run = (args: string[], runtime = false): Result => JSON.parse(invoke(node, [runtime ? join(root, '.agents/notes/runtime/cli.mjs') : cli, ...args, '--root', root, '--json', ...(args[0] === 'install' || args[0] === 'hosts' ? ['--no-interactive'] : [])], root))
    run(['install', '--host', 'example-agent', '--host', 'generic', '--host', 'codex', '--language', 'en'])
    const readState = (): Installation => JSON.parse(readFileSync(join(root, '.agents/notes/install.json'), 'utf8'))
    assert.deepEqual(readState().integrations, ['codex', 'example-agent', 'generic'])
    for (const name of ['agent-note', 'agent-note-maintenance'])
      assert.equal(existsSync(join(root, skillRoot, name, 'SKILL.md')), true)
    const paths = readState().assets.map(asset => asset.path)
    assert.equal(new Set(paths).size, paths.length)
    run(['hosts', 'set', '--host', 'example-agent'], true)
    assert.equal(existsSync(join(root, '.agents/skills/agent-note/SKILL.md')), variant === 'shared-root')
    run(['hosts', 'set', '--host', 'example-agent', '--host', 'generic'], true)
    const before = readFileSync(join(root, '.agents/notes/install.json'))
    const childArgs = ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'hosts set', '', '.agents/notes', join(extracted, 'package'), 'claude-code']
    const child = spawnSync(node, childArgs, { encoding: 'utf8', timeout: 30_000 })
    records.push({ executable: node, args: childArgs, status: child.status, signal: child.signal, stdout: child.stdout, stderr: child.stderr })
    assert.equal(child.signal, 'SIGKILL', child.stderr)
    const journalPath = join(root, '.agents/notes/local/write-lock/journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    assert.ok(Buffer.from(journal.context.beforeIndex, 'base64').toString().includes('example-agent'))
    run(['hosts', 'set', '--host', 'example-agent', '--host', 'generic', '--recover'], true)
    assert.equal(readFileSync(join(root, '.agents/notes/install.json')).equals(before), true)
    assert.equal(existsSync(journalPath), false)
    run(['status'], true)
    records.push({ variant, tarball, sha256: sha256(readFileSync(tarball)), skillRoot, changedProductionSources: ['src/distribution/integrations.ts'] })
    rmSync(join(fixture, 'node_modules'), { recursive: true })
  }
  console.log('Test-only descriptor packages: new/shared roots, installation, removal and recovery passed.')
}
finally {
  mkdirSync(dirname(join(output, 'evidence.json')), { recursive: true })
  writeFileSync(join(output, 'evidence.json'), JSON.stringify({ node: invoke(node, ['--version'], output).trim(), records }, null, 2))
}
