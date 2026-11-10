import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { arch, platform, release, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../..')
const phase = process.argv[2] ?? 'baseline'
const raw = resolve(process.argv[3] ?? join(repo, '.cache/host-adapter-study/notes'))
mkdirSync(raw, { recursive: true })
const env = { ...process.env, HOME: join(raw, 'home'), npm_config_cache: join(raw, 'npm-cache'), XDG_CACHE_HOME: join(raw, 'xdg'), NODE_PATH: '', NODE_OPTIONS: '', CI: 'true', GIT_CONFIG_GLOBAL: join(raw, 'empty-gitconfig'), GIT_CONFIG_NOSYSTEM: '1' }
for (const path of [env.HOME, env.npm_config_cache, env.XDG_CACHE_HOME]) mkdirSync(path, { recursive: true })
writeFileSync(env.GIT_CONFIG_GLOBAL, '')
const results = []
let seq = 0
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function tree(root, prefix = '') {
  const found = {}
  if (!existsSync(join(root, prefix))) return found
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const p = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.name === '.git') continue
    if (entry.isDirectory()) Object.assign(found, tree(root, p))
    else if (entry.isFile()) found[p] = hash(readFileSync(join(root, p)))
  }
  return found
}
function run(label, argv, cwd = repo, expected, watch) {
  const id = phase + '-' + String(++seq).padStart(3, '0') + '-' + label
  const before = watch ? tree(watch) : {}
  const start = Date.now()
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8', timeout: 600000, maxBuffer: 20 * 1024 * 1024 })
  const after = watch ? tree(watch) : {}
  const diff = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(p => before[p] !== after[p]).map(path => ({ path, before: before[path] ?? null, after: after[path] ?? null }))
  const stdout = r.stdout ?? '', stderr = r.stderr ?? ''
  writeFileSync(join(raw, id + '.stdout'), stdout); writeFileSync(join(raw, id + '.stderr'), stderr)
  if (watch) writeFileSync(join(raw, id + '.tree.json'), JSON.stringify({ before, after, diff }, null, 2))
  let value; try { value = JSON.parse(stdout) } catch {}
  const record = { id, argv, cwd, environment: { HOME: env.HOME, npm_config_cache: env.npm_config_cache, XDG_CACHE_HOME: env.XDG_CACHE_HOME, NODE_PATH: '', NODE_OPTIONS: '', CI: 'true', GIT_CONFIG_GLOBAL: env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: '1' }, exit: r.status, signal: r.signal, durationMs: Date.now() - start, stdout: id + '.stdout', stderr: id + '.stderr', stdoutSha256: hash(stdout), stderrSha256: hash(stderr), tree: watch ? id + '.tree.json' : null, changed: diff.map(x => x.path), result: value?.result ?? null, code: value?.diagnostics?.[0]?.code ?? value?.code ?? null, data: value?.data ? Object.fromEntries(Object.entries(value.data).filter(([key]) => ['manager_version', 'runtime_version', 'previous_version', 'targets', 'notes_dir', 'integrity', 'recovered', 'backup'].includes(key))) : null, error: r.error?.message ?? null }
  results.push(record)
  writeFileSync(join(here, phase + '-results.json'), JSON.stringify({ environment: { node: process.version, platform: platform(), release: release(), arch: arch(), raw }, records: results }, null, 2))
  console.log(id + ' exit=' + r.status + ' code=' + record.code + ' changed=' + diff.length)
  if (expected !== undefined) assert.equal(r.status, expected, label + ': ' + stdout + stderr)
  return { ...r, value, record }
}
const node = process.execPath
function cli(version) { return join(raw, 'npm-' + version, 'node_modules/@hackycy/agent-notes/dist/cli.mjs') }
function project(name, git = false) { const root = join(tmpdir(), 'agent-notes-host-adapter-study-' + hash(repo).slice(0, 12), name); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true }); if (git) run(name + '-git', ['git', 'init', '-q'], root, 0); return root }
function invoke(label, executable, command, root, flags = [], expected) { return run(label, [node, executable, command, '--root', root, '--json', ...flags], root, expected, root) }
const manifestPath = root => join(root, '.agents/notes/install.json')
const main = resolve(repo, '../../../../..')
if (phase === 'baseline') {
  run('head', ['git', 'rev-parse', 'HEAD'], repo, 0)
  run('build', ['pnpm', '--filter', '@hackycy/agent-notes', 'build'], repo, 0)
  run('tests', ['pnpm', '--filter', '@hackycy/agent-notes', 'test'], repo, 0)
  run('lint', ['pnpm', 'lint'], repo, 0)
  for (const version of ['0.1.0', '0.2.0', '0.3.0']) {
    const metadata = run('registry-' + version, ['npm', 'view', '@hackycy/agent-notes@' + version, 'version', 'gitHead', 'dist', '--json'], repo, 0).value
    const packed = run('pack-' + version, ['npm', 'pack', '@hackycy/agent-notes@' + version, '--json', '--pack-destination', raw], repo, 0).value[0]
    const tarball = join(raw, packed.filename)
    const integrity = 'sha512-' + createHash('sha512').update(readFileSync(tarball)).digest('base64')
    assert.equal(integrity, metadata.dist.integrity)
    run('install-' + version, ['npm', 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', join(raw, 'npm-' + version), tarball], raw, 0)
    results.push({ id: 'identity-' + version, tarballSha256: hash(readFileSync(tarball)), integrity, gitHead: metadata.gitHead ?? null })
  }
  run('bundle-smoke', ['pnpm', '--filter', '@hackycy/agent-notes', 'test:bundle', cli('0.3.0')], repo, 0)
  run('install-smoke', ['pnpm', '--filter', '@hackycy/agent-notes', 'test:install', join(raw, 'hackycy-agent-notes-0.3.0.tgz')], repo, 0)
}
if (phase === 'strict') {
  const root = project('strict')
  invoke('strict-init', cli('0.3.0'), 'init', root, ['--target', 'agents'], 0)
  const saved = readFileSync(manifestPath(root))
  const variants = { target: m => m.targets.push('study'), top: m => m.extension = {}, assetField: m => m.assets[0].extension = true, assetPath: m => m.assets.push({ path: '.study/skills/agent-note/SKILL.md', kind: 'file', sha256: 'a'.repeat(64) }), entryPath: m => m.assets.push({ path: 'NOTES-STUDY.md', kind: 'block', sha256: 'a'.repeat(64) }), format: m => m.format = 'agent-notes-install/2' }
  for (const [name, mutate] of Object.entries(variants)) {
    const m = JSON.parse(saved); mutate(m); writeFileSync(manifestPath(root), JSON.stringify(m))
    for (const [reader, executable] of [['manager', cli('0.3.0')], ['runtime', join(root, '.agents/notes/runtime/cli.mjs')]]) {
      for (const command of ['status', 'context', 'repair', 'upgrade']) invoke(name + '-' + reader + '-' + command, executable, command, root)
    }
    writeFileSync(manifestPath(root), saved)
  }
  const locked = join(root, '.agents/notes/runtime/cli.mjs')
  const originalRuntime = readFileSync(locked)
  const marker = join(root, 'runtime-entered')
  const sentinel = Buffer.concat([Buffer.from('import { writeFileSync as studyWrite } from "node:fs"; studyWrite(' + JSON.stringify(marker) + ', "entered");\n'), originalRuntime.subarray(originalRuntime.indexOf('\n') + 1)])
  writeFileSync(locked, sentinel)
  const sentinelManifest = JSON.parse(saved); sentinelManifest.assets.find(a => a.path.endsWith('/runtime/cli.mjs')).sha256 = hash(sentinel); sentinelManifest.targets.push('study')
  writeFileSync(manifestPath(root), JSON.stringify(sentinelManifest))
  invoke('manager-predelegation-sentinel', cli('0.3.0'), 'context', root, [], 2)
  assert.equal(existsSync(marker), false)
  invoke('direct-runtime-sentinel', locked, 'context', root, [], 2)
  assert.equal(existsSync(marker), true)
  rmSync(marker); writeFileSync(locked, originalRuntime); writeFileSync(manifestPath(root), saved)
  invoke('add-target-init', cli('0.3.0'), 'init', root, ['--target', 'agents', '--target', 'claude'], 2)
  invoke('upgrade-target-flag', cli('0.3.0'), 'upgrade', root, ['--target', 'claude'], 2)
  const damaged = join(root, '.agents/skills/agent-note/SKILL.md'); writeFileSync(damaged, 'local edit\n')
  invoke('same-upgrade-damaged', cli('0.3.0'), 'upgrade', root, [], 1)
  invoke('runtime-repair-host', join(root, '.agents/notes/runtime/cli.mjs'), 'repair', root, [], 0)
  const source = join(root, '.agents/notes/runtime/assets/templates/proposed.en.md'); rmSync(source)
  invoke('runtime-source-damaged', join(root, '.agents/notes/runtime/cli.mjs'), 'repair', root, [], 1)
  invoke('same-package-repair', cli('0.3.0'), 'repair', root, [], 0)
  for (const version of ['0.1.0', '0.2.0']) {
    const old = project('real-old-' + version)
    invoke('old-' + version + '-init', cli(version), 'init', old, ['--target', 'agents'], 0)
    invoke('old-' + version + '-status', cli(version), 'status', old)
    invoke('new-upgrade-old-' + version, cli('0.3.0'), 'upgrade', old)
    invoke('new-status-old-' + version, cli('0.3.0'), 'status', old)
    for (const command of ['status', 'context', 'upgrade', 'repair']) invoke('old-' + version + '-reads03-' + command, cli(version), command, root)
    const oldManifest = join(old, '.agent-notes/install.json')
    if (existsSync(oldManifest)) {
      const bytes = readFileSync(oldManifest)
      for (const [name, mutate] of Object.entries(variants)) {
        const m = JSON.parse(bytes); mutate(m); writeFileSync(oldManifest, JSON.stringify(m))
        invoke('old-' + version + '-own-layout-' + name, cli(version), 'status', old)
        invoke('oldruntime-' + version + '-own-layout-' + name, join(old, '.agent-notes/runtime/cli.mjs'), 'context', old)
      }
      writeFileSync(oldManifest, bytes)
    }
  }
}
if (phase === 'synthetic') {
  run('apply', ['python3', join(here, 'prepare-synthetic.py')], repo, 0)
  const manifest = join(repo, 'packages/agent-notes/package.json')
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"version": "0.3.0"', '"version": "0.3.1-study.0"'))
  cpSync(join(here, 'third-target.test.ts.fixture'), join(repo, 'packages/agent-notes/tests/third-target.test.ts'))
  run('synthetic-tests', ['pnpm', '--filter', '@hackycy/agent-notes', 'test', 'tests/third-target.test.ts'], repo, 0)
  run('typecheck', ['pnpm', 'exec', 'tsc', '--noEmit'], repo, 0)
  run('build', ['pnpm', '--filter', '@hackycy/agent-notes', 'build'], repo, 0)
  run('pack', ['pnpm', '--filter', '@hackycy/agent-notes', 'pack', '--pack-destination', raw], repo, 0)
  run('install', ['npm', 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', join(raw, 'npm-study'), join(raw, 'hackycy-agent-notes-0.3.1-study.0.tgz')], raw, 0)
}
if (phase === 'compat') {
  const study = cli('study')
  for (const targets of [['study'], ['agents', 'claude', 'study']]) {
    const name = targets.join('-'), root = project('synthetic-' + name, true)
    writeFileSync(join(root, '.gitignore'), '.study/\n')
    invoke(name + '-init', study, 'init', root, targets.flatMap(t => ['--target', t]), 0)
    invoke(name + '-runtime-check', join(root, '.agents/notes/runtime/cli.mjs'), 'check', root, [], 0)
    invoke(name + '-new-status', study, 'status', root, [], 0)
    run(name + '-future-ignore', ['git', 'check-ignore', '--no-index', '-q', '.study/skills/agent-note/references/future.md'], root, 1)
    for (const version of ['0.3.0', '0.2.0', '0.1.0']) for (const command of ['status', 'context', 'upgrade', 'repair']) invoke(name + '-reader-' + version + '-' + command, cli(version), command, root)
    const host = join(root, '.study/skills/agent-note/SKILL.md'); writeFileSync(host, 'custom edit\n')
    invoke(name + '-repair', join(root, '.agents/notes/runtime/cli.mjs'), 'repair', root, [], 0)
    invoke(name + '-intact', study, 'status', root, [], 0)
  }
  const standard = project('synthetic-agents')
  invoke('synthetic-oldtarget-init', study, 'init', standard, ['--target', 'agents'], 0)
  for (const command of ['status', 'context', 'repair']) invoke('03-reader-new-runtime-' + command, cli('0.3.0'), command, standard)
  invoke('03-downgrade-standard', cli('0.3.0'), 'upgrade', standard, [], 0)
  invoke('study-upgrade-standard', study, 'upgrade', standard, [], 0)
  const plain = project('plain-study')
  invoke('custom-root-init', study, 'init', plain, ['--target', 'study', '--notes-dir', 'docs/decisions'], 0)
  mkdirSync(join(plain, 'src/sub'), { recursive: true })
  run('custom-root-subdir', [node, study, 'context', '--json'], join(plain, 'src/sub'), 0, plain)
  const collision = project('layout-collision')
  invoke('protected-layout', study, 'init', collision, ['--target', 'study', '--notes-dir', '.study/skills/nested'], 2)
  const recovery = project('prepared-recovery')
  const child = join(here, 'recovery-child.mjs')
  const killed = run('prepared-kill', [node, '--import', 'tsx', child, repo, recovery, 'kill'], repo, undefined, recovery); assert.equal(killed.signal, 'SIGKILL')
  const transaction = join(repo, 'packages/agent-notes/src/workflow/transaction.ts')
  const patched = readFileSync(transaction)
  run('omit-recovery-allowlist', ['git', 'restore', '--source=f74deccc5991e0452b3cb83feba51fe1c6bb1c1c', '--', 'packages/agent-notes/src/workflow/transaction.ts'], repo, 0)
  run('prepared-old-recover', [node, '--import', 'tsx', child, repo, recovery, 'recover'], repo, 1, recovery)
  writeFileSync(transaction, patched)
  run('prepared-recover', [node, '--import', 'tsx', child, repo, recovery, 'recover'], repo, 0, recovery)
  assert.deepEqual(tree(recovery), {})
}
writeFileSync(join(here, phase + '-results.json'), JSON.stringify({ environment: { node: process.version, platform: platform(), release: release(), arch: arch(), raw }, records: results }, null, 2))
