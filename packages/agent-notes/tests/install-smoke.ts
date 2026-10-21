import type { Result } from '../src/cli/run'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { checkLinks } from '../src/notes/markdown'
import { jsonYaml } from '../src/notes/reader'
import { Repository } from '../src/notes/snapshot'
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
  const bin = join(sandbox, 'node_modules/.bin/agent-notes')
  assert.ok(existsSync(bin))
  for (const [target, language] of [['agents', 'zh-CN'], ['claude', 'en']] as const) {
    const root = project()
    roots.push(root)
    rmSync(join(root, '.agent-notes'), { recursive: true })
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
    invoke(['init', '--root', root, '--target', target, '--notes-dir', 'docs/decisions', '--language', language])
    assert.equal(invoke(['status']).data.notes_dir, 'docs/decisions')
    const entry = `.${target}/skills/agent-note/SKILL.md`
    const skill = readFileSync(join(root, entry), 'utf8')
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)![1]
    assert.equal((jsonYaml(frontmatter, entry) as { name: string }).name, 'agent-note')
    const source = new Repository(root).snapshot('worktree')
    source.includeDirectory('.agent-notes/runtime')
    source.includeDirectory(`.${target}/skills`)
    assert.deepEqual(checkLinks(source, source.paths().filter(path => path.endsWith('.md'))), [])
    const draft = readFileSync(join(root, `.agent-notes/runtime/assets/templates/implemented.${language}.md`), 'utf8')
      .replace('paths: [src/affected-area/**]', 'paths: [src/orders/**]')
      .replaceAll('Replace this prompt with concrete reasoning or evidence for this section.', 'Only the order aggregate publishes events; duplicate entry-point delivery tests passed. The infrastructure alternative would obscure the transaction boundary.')
      .replaceAll('将这段提示替换为本节的具体理由或证据。', '订单聚合独占事件发布；两个入口的重复投递回归测试通过。基础设施统一代发会隐藏事务边界，因此不采用。')
    write(root, '.agent-notes/local/decision.md', draft)
    write(root, '.agent-notes/local/input.json', JSON.stringify({ class: 'architecture', status: 'implemented', document: '.agent-notes/local/decision.md', rationale: 'Code does not explain why infrastructure publication was rejected; future entry points need this boundary.' }))
    const created = invoke(['create', '--input', '.agent-notes/local/input.json'])
    assert.ok(String(created.data.path).startsWith('docs/decisions/implemented/architecture/'))
    const context = invoke(['context', '--paths', 'src/orders/order.ts'])
    const pointers = context.data.notes as Record<string, unknown>[]
    assert.equal(pointers.length, 1)
    assert.equal(pointers[0].id, created.data.id)
    assert.equal('text' in pointers[0], false)
    invoke(['check'])
    // Once installed, ordinary use does not depend on the npm package or source checkout.
    const local = spawnSync(process.execPath, [join(root, '.agent-notes/runtime/cli.mjs'), 'show', String(created.data.id), '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
    assert.equal(local.status, 0, local.stdout || local.stderr)
    assert.equal(JSON.parse(local.stdout).data.id, created.data.id)
  }
  console.log(`Offline npm/bin and individual targets smoke passed: ${tarball}`)
}
finally {
  for (const root of [...roots, sandbox])
    rmSync(root, { recursive: true, force: true })
}
