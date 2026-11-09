import type { SpawnSyncReturns } from 'node:child_process'
import type { Result } from '../src/cli/run'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { checkLinks } from '../src/notes/markdown'
import { jsonYaml } from '../src/notes/reader'
import { Repository, sha256 } from '../src/notes/snapshot'
import { project, write } from './fixtures'

// Exercise npm's actual bin link, then use each installed runtime without npm.
const tarball = resolve(process.argv[2])
const sandbox = mkdtempSync(join(tmpdir(), 'agent-notes-npm-'))
const roots: string[] = []
try {
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', sandbox, tarball], {
    cwd: sandbox,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
  })
  const packageRoot = join(sandbox, 'node_modules/@hackycy/agent-notes')
  assert.ok(existsSync(join(packageRoot, 'README.md')))
  assert.ok(existsSync(join(packageRoot, 'docs/installation.md')))
  assert.ok(existsSync(join(packageRoot, 'assets/references/writing.md')))
  assert.ok(existsSync(join(packageRoot, 'assets/formats/document.md')))
  for (const path of ['AGENTS.md', 'docs/maintainers', 'src', 'tests', 'contracts', 'writing.md'])
    assert.equal(existsSync(join(packageRoot, path)), false, `Unexpected npm content: ${path}`)
  const packageSource = new Repository(packageRoot).snapshot('worktree')
  assert.deepEqual(checkLinks(packageSource, packageSource.paths().filter(path => path.endsWith('.md'))), [])
  const bin = join(sandbox, 'node_modules/.bin/agent-notes')
  assert.ok(existsSync(bin))
  const incompleteRoot = project()
  roots.push(incompleteRoot)
  const writing = join(packageRoot, 'assets/references/writing.md')
  const original = readFileSync(writing)
  rmSync(writing)
  try {
    const incomplete = spawnSync(bin, ['init', '--root', incompleteRoot, '--target', 'agents', '--json'], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
    assert.equal(incomplete.status, 1, incomplete.stdout || incomplete.stderr)
    assert.equal((JSON.parse(incomplete.stdout) as Result).diagnostics[0].code, 'INVALID_BUNDLE')
    assert.equal(existsSync(join(incompleteRoot, '.agents/notes/install.json')), false)
    assert.equal(existsSync(join(incompleteRoot, '.agents/notes/runtime')), false)
  }
  finally { writeFileSync(writing, original) }
  for (const [target, language, notesDir] of [['agents', 'zh-CN', '.agents/notes'], ['claude', 'en', 'docs/decisions'], ['agents', 'en', 'docs/architecture/team/decisions/notes']] as const) {
    const root = project()
    roots.push(root)
    rmSync(join(root, '.agents/notes'), { recursive: true })
    if (target === 'claude')
      rmSync(join(root, '.git'), { recursive: true }) // Plain project initialization also works.
    write(root, 'AGENTS.md', '# Project rules\nUse the existing architecture.\n')
    write(root, 'src/orders/order.ts', 'export const owner = "orders"\n')
    mkdirSync(join(root, 'src/orders/sub'), { recursive: true })
    const invoke = (args: string[], executable = bin): Result => {
      const result = spawnSync(executable, [...args, '--json'], { cwd: join(root, 'src/orders/sub'), encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
      assert.equal(result.status, 0, result.stdout || result.stderr)
      assert.equal(result.stderr, '')
      const parsed = JSON.parse(result.stdout) as Result
      assert.equal(parsed.result, 'ok', result.stdout)
      return parsed
    }
    invoke(['init', '--root', root, '--target', target, '--notes-dir', notesDir, '--language', language])
    assert.equal(invoke(['status']).data.notes_dir, notesDir)
    for (const path of ['README.md', 'docs', 'contracts', 'writing.md'])
      assert.equal(existsSync(join(root, `${notesDir}/runtime`, path)), false, `Unexpected runtime content: ${path}`)
    assert.ok(existsSync(join(root, `${notesDir}/runtime/assets/references/writing.md`)))
    assert.ok(existsSync(join(root, `${notesDir}/runtime/assets/formats/document.md`)))
    const entry = `.${target}/skills/agent-note/SKILL.md`
    const skill = readFileSync(join(root, entry), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)![1]
    assert.equal((jsonYaml(frontmatter, entry) as { name: string }).name, 'agent-note')
    const source = new Repository(root).snapshot('worktree')
    source.includeDirectory(`${notesDir}/runtime`)
    source.includeDirectory(`.${target}/skills`)
    assert.deepEqual(checkLinks(source, source.paths().filter(path => path.endsWith('.md'))), [])
    const draft = readFileSync(join(root, `${notesDir}/runtime/assets/templates/implemented.${language}.md`), 'utf8')
      .replace('paths: [src/affected-area/**]', 'paths: [src/orders/**]')
      .replaceAll('Replace this prompt with concrete reasoning or evidence for this section.', 'Only the order aggregate publishes events; duplicate entry-point delivery tests passed. The infrastructure alternative would obscure the transaction boundary.')
      .replaceAll('将这段提示替换为本节的具体理由或证据。', '订单聚合独占事件发布；两个入口的重复投递回归测试通过。基础设施统一代发会隐藏事务边界，因此不采用。')
    write(root, `${notesDir}/local/decision.md`, draft)
    write(root, `${notesDir}/local/input.json`, JSON.stringify({ class: 'architecture', status: 'implemented', document: `${notesDir}/local/decision.md`, rationale: 'Code does not explain why infrastructure publication was rejected; future entry points need this boundary.' }))
    const created = invoke(['create', '--input', `${notesDir}/local/input.json`])
    assert.ok(String(created.data.path).startsWith(`${notesDir}/implemented/architecture/`))
    const context = invoke(['context', '--paths', 'src/orders/order.ts'])
    const pointers = context.data.notes as Record<string, unknown>[]
    assert.equal(pointers.length, 1)
    assert.equal(pointers[0].id, created.data.id)
    assert.equal('text' in pointers[0], false)
    invoke(['check'])
    // Once installed, ordinary use does not depend on the npm package or source checkout.
    const local = spawnSync(process.execPath, [join(root, `${notesDir}/runtime/cli.mjs`), 'show', String(created.data.id), '--json'], { cwd: sandbox, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
    assert.equal(local.status, 0, local.stdout || local.stderr)
    assert.equal(JSON.parse(local.stdout).data.id, created.data.id)
    // The retained source skill can repair a host projection without npm.
    write(root, entry, 'Local edit of the installed skill\n')
    const installed = join(root, `${notesDir}/runtime/cli.mjs`)
    const runtime = (args: string[]): SpawnSyncReturns<string> => spawnSync(process.execPath, [installed, ...args, '--root', root, '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
    const files = (): Record<string, string> => Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && !entry.parentPath.startsWith(join(root, '.git')))
      .map(entry => [join(entry.parentPath, entry.name), sha256(readFileSync(join(entry.parentPath, entry.name)))]))
    const beforeRepair = files()
    const preview = runtime(['repair', '--dry-run'])
    assert.equal(preview.status, 0, preview.stdout || preview.stderr)
    assert.ok(JSON.parse(preview.stdout).data.modified_assets.includes(entry))
    assert.deepEqual(files(), beforeRepair)
    const repair = runtime(['repair'])
    assert.equal(repair.status, 0, repair.stdout || repair.stderr)
    assert.equal(readFileSync(join(root, entry), 'utf8'), skill)
    assert.equal(JSON.parse(repair.stdout).command, 'repair')
    assert.deepEqual(JSON.parse(runtime(['repair', '--dry-run']).stdout).data.changes, [])
    rmSync(join(root, entry))
    assert.equal(runtime(['repair']).status, 0)
    assert.equal(readFileSync(join(root, entry), 'utf8'), skill)

    const help = JSON.parse(runtime(['--help']).stdout).data.help as string
    assert.ok(help.includes('repair') && help.includes('status'))
    assert.ok(!help.includes('init') && !help.includes('upgrade'))
    // A blocked management command must not inspect or recover this journal.
    write(root, `${notesDir}/local/write-lock/journal.json`, 'Interrupted transaction placeholder\n')
    for (const command of ['init', 'upgrade']) {
      for (const flags of [[], ['--help'], ['--recover']]) {
        const before = files()
        const rejected = runtime([command, ...flags])
        assert.equal(rejected.status, 2, rejected.stdout || rejected.stderr)
        assert.equal(JSON.parse(rejected.stdout).diagnostics[0].code, 'PACKAGE_COMMAND_REQUIRED')
        assert.deepEqual(files(), before)
      }
    }
    rmSync(join(root, `${notesDir}/local/write-lock`), { recursive: true })

    // Every source file is required, including templates with no incoming links.
    const template = `${notesDir}/runtime/assets/templates/proposed.en.md`
    const sourceSkill = `${notesDir}/runtime/assets/skills/agent-note/SKILL.md`
    const unknown = `${notesDir}/runtime/assets/unknown.txt`
    const version = JSON.parse(readFileSync(join(root, `${notesDir}/install.json`), 'utf8')).version
    for (const damage of ['missing', 'modified', 'unknown']) {
      if (damage === 'missing')
        rmSync(join(root, template))
      else write(root, damage === 'modified' ? sourceSkill : unknown, 'Changed source\n')
      const before = files()
      const rejected = runtime(['repair'])
      assert.equal(rejected.status, 1, rejected.stdout || rejected.stderr)
      const diagnostic = JSON.parse(rejected.stdout).diagnostics[0]
      assert.equal(diagnostic.code, 'INVALID_BUNDLE')
      assert.ok(diagnostic.message.includes(`@${version} repair`))
      assert.deepEqual(files(), before)
      if (damage === 'unknown')
        rmSync(join(root, unknown)) // Unknown project files remain the owner's responsibility.
      invoke(['repair']) // The complete npm package restores the exact installed bundle.
      assert.equal(invoke(['status']).data.integrity, 'intact')
    }
    rmSync(installed)
    invoke(['repair'])
    assert.equal(invoke(['status']).data.integrity, 'intact')
  }
  console.log(`Offline npm/bin and individual targets smoke passed: ${tarball}`)
}
finally {
  for (const root of [...roots, sandbox])
    rmSync(root, { recursive: true, force: true })
}
