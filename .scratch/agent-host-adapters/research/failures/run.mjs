#!/usr/bin/env node
// Run from any cwd. Usage: node run.mjs /absolute/main/repo [results-directory]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This executable experiment requires Darwin arm64; platform branches are observations only')
const repo = path.resolve(process.argv[2] || process.cwd())
const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(process.argv[3] || path.join(here, 'results'))
const cache = path.join(repo, '.cache/host-adapter-study')
const runRoot = fs.mkdtempSync(path.join(cache, 'failures-run-'))
const node = process.execPath
const notes = path.join(cache, 'extracted/notes/package/dist/cli.mjs')
const oldNotes = path.join(cache, 'extracted/notes-0.2/package/dist/cli.mjs')
const shim = path.join(cache, 'extracted/impeccable/package/cli/bin/cli.js')
const engine = path.join(cache, 'releases/impeccable-darwin-arm64')
const bundle = path.join(cache, 'releases/universal-4.8.2.zip')
const home = path.join(runRoot, 'home')
const tmp = path.join(runRoot, 'tmp')
fs.mkdirSync(out, { recursive: true })
fs.mkdirSync(home)
fs.mkdirSync(tmp)
const env = { PATH: process.env.PATH, HOME: home, TMPDIR: tmp, XDG_CACHE_HOME: path.join(home, '.cache'), CI: '1', IMPECCABLE_HOME: path.join(home, '.impeccable'), IMPECCABLE_DOWNLOAD_BASE: 'http://127.0.0.1:9' }
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function tree(root) {
  const found = {}
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir).sort()) {
      if (name === '.git') continue
      const full = path.join(dir, name)
      const stat = fs.lstatSync(full)
      const rel = path.relative(root, full)
      if (stat.isDirectory()) walk(full)
      else found[rel] = stat.isSymbolicLink() ? { link: fs.readlinkSync(full) } : { size: stat.size, sha256: hash(fs.readFileSync(full)), mode: (stat.mode & 0o777).toString(8) }
    }
  }
  walk(root)
  return found
}
function diff(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(k => ({ path: k, before: before[k] ?? null, after: after[k] ?? null }))
}
const results = []
async function run(id, project, argv, extra = {}, profile) {
  const before = tree(project)
  const homeBefore = tree(home)
  const actual = profile ? ['/usr/bin/sandbox-exec', '-p', profile, ...argv] : argv
  const started = new Date().toISOString()
  const child = spawn(actual[0], actual.slice(1), { cwd: project, env: { ...env, ...extra }, detached: !!extra.STUDY_KILL_ON })
  let stdout = '', stderr = ''
  child.stdout.on('data', b => stdout += b)
  child.stderr.on('data', b => stderr += b)
  const timer = setTimeout(() => child.kill('SIGKILL'), 30000)
  let killedAfterObservedPath = false
  const watcher = extra.STUDY_KILL_ON ? setInterval(() => { if (fs.existsSync(extra.STUDY_KILL_ON)) { killedAfterObservedPath = true; process.kill(-child.pid, 'SIGKILL'); clearInterval(watcher) } }, 1) : null
  const exit = await new Promise(resolve => { child.on('close', (status, signal) => resolve({ status, signal })); child.on('error', error => resolve({ error: String(error) })) })
  clearTimeout(timer)
  if (watcher) clearInterval(watcher)
  const after = tree(project)
  const record = { id, started, argv: actual, cwd: project, env: { ...env, ...extra }, ...exit, killedAfterObservedPath, stdout, stderr, before, after, diff: diff(before, after), homeBefore, homeAfter: tree(home), homeDiff: diff(homeBefore, tree(home)) }
  fs.writeFileSync(path.join(out, id + '.json'), JSON.stringify(record, null, 2) + '\n')
  results.push({ id, ...exit, filesChanged: record.diff.length, stdout: stdout.slice(0, 1000), stderr: stderr.slice(0, 1000) })
  console.log(id, exit.status ?? exit.signal, record.diff.length)
  return record
}
function project(name) { const root = path.join(runRoot, name); fs.mkdirSync(root); spawnSync('git', ['init', '--quiet'], { cwd: root }); return root }
const offline = '(version 1)(allow default)(deny network*)'
const initArgs = ['init', '--target', 'agents', '--target', 'claude', '--no-interactive', '--json']
const impArgs = ['skills', 'install', '--providers=codex,claude', '--project', '--no-hooks', '--yes']
const impEnv = { IMPECCABLE_BIN: engine, IMPECCABLE_BUNDLE_PATH: bundle }
// Verify all downloaded release inputs independently before executing them.
const sums = JSON.parse(fs.readFileSync(bundle + '.sig.json'))
const keys = { 'release-2026-09': '7433133bb92da2c0da4186925f36dbd36219c11192451df56f25fd6a23dd7db9' }
const publicKey = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(keys[sums.keyId], 'hex')]), format: 'der', type: 'spki' })
const payload = `impeccable-skill-bundle-v1\n${sums.keyId}\nskill-v${sums.version}\n${sums.artifact}\n${sums.size}\n${sums.sha256}\n`
if (!crypto.verify(null, Buffer.from(payload), publicKey, Buffer.from(sums.signature, 'hex')) || hash(fs.readFileSync(bundle)) !== sums.sha256) throw new Error('bundle verification failed')
if (hash(fs.readFileSync(engine)) !== '086fd22e54c445a0e792f66d2f168e35ec93f7c59054e1fde539d0d95b01ce41') throw new Error('engine verification failed')
const artifacts = Object.fromEntries([engine, bundle, bundle + '.sig.json', path.join(cache, 'baseline/impeccable-4.8.2.tgz'), path.join(cache, 'baseline/hackycy-agent-notes-0.3.0.tgz'), path.join(cache, 'baseline/hackycy-agent-notes-0.2.0.tgz')].map(p => [p, { sha256: hash(fs.readFileSync(p)), size: fs.statSync(p).size }]))
fs.writeFileSync(path.join(out, 'environment.json'), JSON.stringify({ date: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, os: os.release(), runRoot, artifacts, bundleSignatureVerified: true, keySource: '035c8f319edd019936525a062fe99e83ca8d12c6/scripts/bundle-signing-keys.json', env }, null, 2) + '\n')
const np = project('notes')
await run('notes-init-offline', np, [node, notes, ...initArgs], {}, offline)
await run('notes-context-offline', np, [node, notes, 'context', '--json'], {}, offline)
await run('notes-check-offline', np, [node, notes, 'check', '--json'], {}, offline)
await run('notes-unknown-target', project('notes-unknown'), [node, notes, 'init', '--target', 'cursor', '--no-interactive', '--json'])
const skill = path.join(np, '.agents/skills/agent-note/SKILL.md')
fs.appendFileSync(skill, '\nUser edit\n')
await run('notes-repair-edited-skill', np, [node, notes, 'repair', '--json'], {}, offline)
const sourceSkill = path.join(np, '.agents/notes/runtime/assets/skills/agent-note/SKILL.md')
// Locate original skill assets without assuming the runtime bundle layout.
const candidates = Object.keys(tree(path.join(np, '.agents/notes/runtime'))).filter(p => p.endsWith('SKILL.md'))
const source = fs.existsSync(sourceSkill) ? sourceSkill : path.join(np, '.agents/notes/runtime', candidates[0])
fs.appendFileSync(source, '\nCorrupted source\n')
await run('notes-corrupt-source-local-repair', np, [node, path.join(np, '.agents/notes/runtime/cli.mjs'), 'repair', '--json'], {}, offline)
await run('notes-corrupt-source-package-repair', np, [node, notes, 'repair', '--json'], {}, offline)
const permission = project('notes-permission')
const denyNotes = `(version 1)(allow default)(deny file-write* (subpath "${permission}/.agents/skills/agent-note-maintenance"))`
await run('notes-permission-rollback', permission, [node, notes, ...initArgs], {}, denyNotes)
const up = project('notes-upgrade')
await run('notes-old-init', up, [node, oldNotes, ...initArgs])
const marker = path.join(runRoot, 'fault-marker')
const fault = { STUDY_PROJECT: up, STUDY_MARKER: marker, STUDY_FAULT: 'kill' }
await run('notes-upgrade-020-to-030', up, [node, '--require', path.join(here, 'fault.cjs'), notes, 'upgrade', '--json'], fault)
await run('notes-old-context-after-refused-upgrade', up, [node, notes, 'context', '--json'])
await run('notes-upgrade-020-recover', up, [node, notes, 'upgrade', '--recover', '--json'])
const recoverRoot = project('notes-recovery')
await run('notes-recovery-init', recoverRoot, [node, notes, ...initArgs])
fault.STUDY_PROJECT = recoverRoot
const repairRoot = recoverRoot
// Capture conflict and successful repair recovery using the actual artifact.
fs.appendFileSync(path.join(repairRoot, '.agents/skills/agent-note/SKILL.md'), '\nManaged edit\n')
await run('notes-repair-killed', repairRoot, [node, '--require', path.join(here, 'fault.cjs'), notes, 'repair', '--json'], fault)
await run('notes-repair-interrupted-context', repairRoot, [node, notes, 'context', '--json'])
const journalPath = path.join(repairRoot, '.agents/notes/local/write-lock/journal.json')
if (fs.existsSync(journalPath)) {
  const journal = JSON.parse(fs.readFileSync(journalPath))
  const entry = journal.entries.find(e => e.path === fs.readFileSync(marker, 'utf8').slice(repairRoot.length + 1)) || journal.entries[0]
  fs.writeFileSync(path.join(repairRoot, entry.path), 'Independent editor content\n')
  await run('notes-recovery-conflict', repairRoot, [node, notes, 'repair', '--recover', '--json'])
  if (entry.after === null) fs.rmSync(path.join(repairRoot, entry.path), { force: true })
  else fs.writeFileSync(path.join(repairRoot, entry.path), Buffer.from(entry.after, 'base64'))
  await run('notes-recovery-after-reconcile', repairRoot, [node, notes, 'repair', '--recover', '--json'])
}
// Hold an actual writer at the first committed path, then run a competitor.
const concurrent = project('notes-concurrent')
await run('notes-concurrent-init', concurrent, [node, notes, ...initArgs])
fs.appendFileSync(path.join(concurrent, '.agents/skills/agent-note/SKILL.md'), '\nEdited\n')
const stopMarker = path.join(runRoot, 'stop-marker')
const writerArgv = [node, '--require', path.join(here, 'fault.cjs'), notes, 'repair', '--json']
const writerEnv = { ...env, STUDY_PROJECT: concurrent, STUDY_MARKER: stopMarker, STUDY_FAULT: 'stop' }
const beforeWriter = tree(concurrent)
const writer = spawn(writerArgv[0], writerArgv.slice(1), { cwd: concurrent, env: writerEnv })
let writerOut = '', writerErr = ''
writer.stdout.on('data', b => writerOut += b)
writer.stderr.on('data', b => writerErr += b)
const writerClosed = new Promise(resolve => writer.on('close', (status, signal) => resolve({ status, signal })))
for (let i = 0; i < 100 && !fs.existsSync(stopMarker); i++) await new Promise(resolve => setTimeout(resolve, 30))
await run('notes-concurrent-contender', concurrent, [node, notes, 'repair', '--json'])
writer.kill('SIGCONT')
const writerStatus = await writerClosed
fs.writeFileSync(path.join(out, 'notes-concurrent-writer.json'), JSON.stringify({ argv: writerArgv, cwd: concurrent, env: writerEnv, ...writerStatus, stdout: writerOut, stderr: writerErr, before: beforeWriter, after: tree(concurrent), diff: diff(beforeWriter, tree(concurrent)) }, null, 2) + '\n')
const ip = project('impeccable')
await run('impeccable-init-offline-local-bundle', ip, [node, shim, ...impArgs], impEnv, offline)
await run('impeccable-installed-launcher-offline', ip, [path.join(ip, '.agents/skills/impeccable/scripts/impeccable'), 'engine-probe'], {}, offline)
await run('impeccable-installed-launcher-override', ip, [path.join(ip, '.agents/skills/impeccable/scripts/impeccable'), 'engine-probe'], { IMPECCABLE_BIN: engine }, offline)
await run('impeccable-repeat-offline-missing-bundle', ip, [node, shim, ...impArgs], { ...impEnv, IMPECCABLE_BUNDLE_PATH: path.join(runRoot, 'missing.zip') }, offline)
await run('impeccable-unknown-provider', project('impeccable-unknown'), [node, shim, 'skills', 'install', '--providers=not-a-host', '--yes', '--no-hooks'], impEnv)
const partial = project('impeccable-partial')
const denyImp = `(version 1)(allow default)(deny file-write* (subpath "${partial}/.claude"))`
await run('impeccable-permission-partial', partial, [node, shim, ...impArgs], impEnv, denyImp)
await run('impeccable-partial-rerun', partial, [node, shim, ...impArgs], impEnv, offline)
// A real concurrently running install has no injected locking behavior.
const ic = project('impeccable-concurrent')
await Promise.all([run('impeccable-concurrent-a', ic, [node, shim, ...impArgs, '--force'], impEnv, offline), run('impeccable-concurrent-b', ic, [node, shim, ...impArgs, '--force'], impEnv, offline)])
for (let attempt = 1; attempt <= 3; attempt++) {
  const racing = project('impeccable-race-' + attempt)
  await Promise.all([run('impeccable-race-' + attempt + '-a', racing, [node, shim, ...impArgs, '--force'], impEnv, offline), run('impeccable-race-' + attempt + '-b', racing, [node, shim, ...impArgs, '--force'], impEnv, offline)])
}
const killed = project('impeccable-killed')
await run('impeccable-process-killed', killed, [node, shim, ...impArgs], { ...impEnv, STUDY_KILL_ON: path.join(killed, '.agents/skills/impeccable/SKILL.md') }, offline)
await run('impeccable-killed-force-rerun', killed, [node, shim, ...impArgs, '--force'], impEnv, offline)
const cp = project('cache-probe')
await run('impeccable-empty-cache-offline', cp, [node, shim, '--help'], {}, offline)
const cached = path.join(env.IMPECCABLE_HOME, 'bin/0.1.21/impeccable')
fs.mkdirSync(path.dirname(cached), { recursive: true })
fs.copyFileSync(engine, cached)
fs.chmodSync(cached, 0o755)
await run('impeccable-valid-cache-offline', cp, [node, shim, '--help'], {}, offline)
fs.writeFileSync(cached, 'corrupt engine\n')
await run('impeccable-corrupt-cache-offline', cp, [node, shim, '--help'], {}, offline)
const brokenZip = path.join(runRoot, 'broken.zip')
fs.writeFileSync(brokenZip, 'not-a-zip')
await run('impeccable-corrupt-bundle', project('impeccable-broken-bundle'), [node, shim, ...impArgs], { ...impEnv, IMPECCABLE_BUNDLE_PATH: brokenZip }, offline)
// Local HTTP fixture proves verified download and mismatch rejection without an external service.
const requests = []
let serveCorrupt = false
const server = http.createServer((req, res) => { requests.push(req.url); res.end(serveCorrupt ? 'broken-download' : fs.readFileSync(engine)) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
await run('impeccable-verified-download', cp, [node, shim, 'engine-probe'], { IMPECCABLE_DOWNLOAD_BASE: base })
await run('impeccable-install-with-verified-engine', ip, [node, shim, ...impArgs, '--force'], { ...impEnv, IMPECCABLE_DOWNLOAD_BASE: base })
await run('impeccable-selfcontained-launcher-offline', ip, [path.join(ip, '.agents/skills/impeccable/scripts/impeccable'), 'engine-probe'], {}, offline)
fs.rmSync(cached)
fs.rmSync(cached + '.verified', { force: true })
serveCorrupt = true
await run('impeccable-download-checksum-mismatch', cp, [node, shim, 'engine-probe'], { IMPECCABLE_DOWNLOAD_BASE: base })
server.close()
fs.writeFileSync(path.join(out, 'download-fixture.json'), JSON.stringify({ base, requests, note: 'Local HTTP fixture, official verified engine bytes for first request; invalid bytes for second. Not a GitHub outage test.' }, null, 2) + '\n')
for (const [platform, arch] of [['linux', 'arm64'], ['win32', 'x64'], ['win32', 'arm64'], ['freebsd', 'x64']]) {
  await run(`branch-shim-${platform}-${arch}`, cp, [node, '--require', path.join(here, 'platform.cjs'), shim, '--help'], { STUDY_OS: platform, STUDY_ARCH: arch, IMPECCABLE_HOME: path.join(home, `branch-${platform}-${arch}`) })
}
const readResult = id => JSON.parse(fs.readFileSync(path.join(out, id + '.json')))
const cleanTree = readResult('impeccable-init-offline-local-bundle').after
const comparisons = {
  partial_rerun_equal_clean: JSON.stringify(readResult('impeccable-partial-rerun').after) === JSON.stringify(cleanTree),
  killed_rerun_equal_clean: JSON.stringify(readResult('impeccable-killed-force-rerun').after) === JSON.stringify(cleanTree),
  clean_file_count: Object.keys(cleanTree).length,
  notes_file_count: Object.keys(readResult('notes-init-offline').after).length,
  impeccable_installed_bytes_equal_zip: Object.entries(cleanTree).every(([file, value]) => { const extracted = spawnSync('unzip', ['-p', bundle, file], { maxBuffer: 64 * 1024 * 1024 }); return extracted.status === 0 && hash(extracted.stdout) === value.sha256 }),
  installed_engines: Object.fromEntries(Object.entries(readResult('impeccable-install-with-verified-engine').after).filter(([file]) => file.includes('/bin/darwin-arm64/'))),
  notes_permission_rollback_empty: Object.keys(readResult('notes-permission-rollback').after).length === 0,
  notes_recovery_conflict_zero_diff: readResult('notes-recovery-conflict').diff.length === 0,
  impeccable_killed_remaining: Object.keys(readResult('impeccable-process-killed').after),
  race_statuses: Object.fromEntries(results.filter(r => r.id.includes('concurrent-') || r.id.includes('race-')).map(r => [r.id, r.status])),
}
fs.writeFileSync(path.join(out, 'comparisons.json'), JSON.stringify(comparisons, null, 2) + '\n')
const oldFixture = ['notes-upgrade/.agent-notes/config.json', 'notes-upgrade/.agent-notes/install.json']
fs.writeFileSync(path.join(out, 'notes-020-fixture.json'), JSON.stringify(Object.fromEntries(oldFixture.map(file => [file, JSON.parse(fs.readFileSync(path.join(runRoot, file)))])), null, 2) + '\n')
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(results, null, 2) + '\n')
fs.writeFileSync(path.join(out, 'cache-final-tree.json'), JSON.stringify(tree(home), null, 2) + '\n')
console.log('raw fixture root:', runRoot)
