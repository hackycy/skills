import type { Result } from '../src/cli/run'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { stringify } from 'yaml'
import { body, commit, document, git, ids, metadata, note, project, write } from './fixtures'

// Pass an extracted tarball's CLI and optionally an alternate Node executable.
const cli = resolve(process.argv[2] ?? 'dist/cli.mjs')
const node = process.argv[3] ?? process.execPath
const nextCli = process.argv[4] ? resolve(process.argv[4]) : undefined
const root = project()
function invoke(args: string[], expectedExit = 0, input?: unknown, executable = cli): Result {
  const result = spawnSync(node, [executable, ...args, '--root', root, '--json'], {
    cwd: root,
    encoding: 'utf8',
    input: input === undefined ? undefined : JSON.stringify(input),
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
  })
  assert.equal(result.status, expectedExit, result.stderr || result.stdout)
  assert.equal(result.stderr, '')
  return JSON.parse(result.stdout) as Result
}

function canonicalDelegation(): void {
  for (const [args, input] of [
    [['context', '--paths=src/orders/new.ts', 'src/other.ts', '--topic=001', '--topic=events'], undefined],
    [['create', '--input=-', '--dry-run'], { class: 'architecture', status: 'proposed', document: '.agent-notes/local/draft.md', rationale: 'Verify stdin reaches the locked runtime.' }],
  ] as const) {
    const result = spawnSync(node, [cli, `--root=${root}`, '--json', ...args], {
      cwd: root,
      encoding: 'utf8',
      input: input && JSON.stringify(input),
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
    })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(result.stderr, '')
    assert.equal(JSON.parse(result.stdout).result, 'ok')
  }
}

function operation(command: string, id: string | undefined, input: unknown, args: string[] = [], expectedExit = 0): Result {
  return invoke([command, ...(id ? [id] : []), '--input', '-', ...args], expectedExit, input)
}

function currentHash(id: string): string {
  return String(invoke(['show', id]).data.hash)
}

function createDraft(status: string, title: string, relations?: unknown): string {
  const path = '.agent-notes/local/draft.md'
  write(root, path, `---\n${stringify({ scope: { topics: ['events'] }, read_when: 'When changing ownership.', ...(relations ? { relations } : {}) })}---\n${body(status).replace('# Event ownership', `# ${title}`)}`)
  return path
}

try {
  assert.ok(String(invoke(['init', '--help']).data.help).includes('--no-interactive'))
  assert.equal(invoke(['init'], 2).result, 'invalid-input')
  assert.equal(invoke(['context', '--root.path=x'], 2).result, 'invalid-input')
  const previewInstall = invoke(['init', '--target', 'agents', '--target', 'claude', '--dry-run'])
  assert.ok(Array.isArray(previewInstall.data.changes))
  assert.equal(existsSync(join(root, '.agent-notes/install.json')), false)
  invoke(['init', '--target', 'agents', '--target', 'claude'])
  assert.equal(invoke(['status']).data.integrity, 'intact')
  assert.deepEqual(invoke(['init', '--target', 'agents', '--target', 'claude']).data.changes, [])
  assert.deepEqual(invoke(['init']).data.changes, [])
  assert.equal(existsSync(join(root, '.agents/notes')), false)
  const path = note(root)
  const base = commit(root)
  assert.equal(invoke(['context', '--paths', 'src/orders/new.ts']).result, 'ok')
  const shown = invoke(['show', ids[0]])
  assert.equal(shown.data.text, readFileSync(join(root, path), 'utf8'))
  write(root, path, document().replace('agent-note/1', 'agent-note/2'))
  git(root, 'add', path)
  write(root, path, document())
  assert.equal(invoke(['check', '--staged'], 2).result, 'invalid-input')
  assert.equal(invoke(['check']).result, 'ok')
  assert.equal(invoke(['check', '--base', base, '--head', base]).result, 'ok')
  git(root, 'add', path)
  // Execute the actual write commands using stdin JSON, without a source-tree dependency.
  const input = { class: 'architecture', status: 'proposed', document: createDraft('proposed', 'Secondary ownership'), rationale: 'A distinct durable ownership tradeoff.' }
  canonicalDelegation()
  assert.equal(operation('create', undefined, { ...input, rationale: '' }, [], 3).result, 'needs-decision')
  const preview = operation('create', undefined, input, ['--dry-run'])
  assert.equal(preview.data.id, null)
  assert.equal(existsSync(join(root, String(preview.data.path))), false)
  const created = operation('create', undefined, input)
  const id = String(created.data.id)
  const proposed = String(created.data.path)
  write(root, 'README.md', `[Second note](${proposed}#problem)\n`)
  write(root, '.agent-notes/local/edit.md', document(metadata({ id, status: 'proposed' }), body('proposed').replace('# Event ownership', '# Secondary ownership')))
  operation('update', id, { expected_hash: currentHash(id), reason: 'Clarify the scope.', document: '.agent-notes/local/edit.md' })
  write(root, '.agent-notes/local/edit.md', document(metadata({ id }), body().replace('# Event ownership', '# Secondary ownership')))
  const delivered = operation('transition', id, { expected_hash: currentHash(id), reason: 'Both callers are delivered.', document: '.agent-notes/local/edit.md' }, ['--to', 'implemented'])
  assert.ok(readFileSync(join(root, 'README.md'), 'utf8').includes(String(delivered.data.path)))
  const ownerInput = { class: 'architecture', status: 'implemented', document: createDraft('implemented', 'Consolidated ownership', { supersedes: [{ id, extent: 'full', reason: 'All unique guidance has been absorbed.' }] }), rationale: 'Consolidate the same responsibility with retained rationale.' }
  const owner = operation('create', undefined, ownerInput)
  const ownerId = String(owner.data.id)
  operation('prune', id, {
    expected_hash: currentHash(id),
    reason: 'All unique rationale and verification were absorbed by the owner.',
    owner: { id: ownerId, expected_hash: currentHash(ownerId) },
    coverage: [{ source: '#decision', destination: '#decision' }, { source: '#verification', destination: '#verification' }],
    references: [{ path: String(owner.data.path), target_id: null }, { path: 'README.md', target_id: ownerId }],
  })
  const rejected = operation('create', undefined, { class: 'process', status: 'proposed', document: createDraft('proposed', 'Discarded ownership'), rationale: 'Record a plausible alternative under consideration.' })
  const rejectedId = String(rejected.data.id)
  operation('transition', rejectedId, { expected_hash: currentHash(rejectedId), reason: 'This alternative is no longer relevant.' }, ['--to', 'rejected'])
  operation('prune', rejectedId, { expected_hash: currentHash(rejectedId), reason: 'The old failure cannot recur; no remaining prevention value.', references: [] })
  const archived = operation('archive', ids[0], { expected_hash: currentHash(ids[0]), reason: 'The component was retired; keep the historical rationale.' })
  const frozen = String(archived.data.path)
  assert.equal(invoke(['check']).result, 'ok')
  commit(root)
  const checkout = project()
  rmSync(checkout, { recursive: true })
  try {
    git(root, '-c', 'core.autocrlf=true', 'clone', '--no-local', root, checkout)
    for (const command of ['status', 'check']) {
      const result = spawnSync(node, [join(checkout, '.agent-notes/runtime/cli.mjs'), command, '--root', checkout, '--json'], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
      assert.equal(result.status, 0, result.stdout || result.stderr)
      assert.equal(JSON.parse(result.stdout).result, 'ok')
    }
    for (const path of [frozen, '.agents/notes/archived/manifest.json', '.agent-notes/config.json'])
      assert.deepEqual(readFileSync(join(checkout, path)), readFileSync(join(root, path)), path)
  }
  finally { rmSync(checkout, { recursive: true, force: true }) }
  const preserved = new Map<string, string>([['.agent-notes/config.json', readFileSync(join(root, '.agent-notes/config.json'), 'utf8')]])
  const collect = (directory: string): void => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory())
        collect(path)
      else preserved.set(path, readFileSync(join(root, path), 'utf8'))
    }
  }
  collect('.agents/notes')
  write(root, '.agents/skills/agent-note/SKILL.md', 'Local customization to preserve in backup\n')
  write(root, '.agent-notes/runtime/unmanaged.txt', 'Unmanaged neighboring file\n')
  const repairPreview = invoke(['upgrade', '--dry-run'])
  assert.ok((repairPreview.data.modified_assets as string[]).includes('.agents/skills/agent-note/SKILL.md'))
  assert.equal(existsSync(join(root, '.agent-notes/local/backups')), false)
  const repaired = invoke(['upgrade'])
  assert.equal(readFileSync(join(root, String(repaired.data.backup), 'original/.agents/skills/agent-note/SKILL.md'), 'utf8'), 'Local customization to preserve in backup\n')
  assert.deepEqual(invoke(['upgrade']).data.changes, [])
  if (nextCli) {
    const nextVersion = invoke(['status'], 0, undefined, nextCli).data.manager_version
    invoke(['upgrade'], 0, undefined, nextCli)
    const status = invoke(['status'])
    assert.equal(status.data.runtime_version, nextVersion)
    assert.notEqual(status.data.manager_version, status.data.runtime_version)
    assert.equal(invoke(['check']).result, 'ok')
    canonicalDelegation()
    invoke(['upgrade'])
    assert.equal(invoke(['status']).data.runtime_version, status.data.manager_version)
  }
  assert.equal(readFileSync(join(root, '.agent-notes/runtime/unmanaged.txt'), 'utf8'), 'Unmanaged neighboring file\n')
  for (const [path, text] of preserved)
    assert.equal(readFileSync(join(root, path), 'utf8'), text, path)
  const installed = join(root, '.agent-notes/runtime/cli.mjs')
  assert.deepEqual(invoke(['upgrade', '--dry-run'], 0, undefined, installed).data.changes, [])
  assert.equal(invoke(['check'], 0, undefined, installed).result, 'ok')
  rmSync(join(root, frozen))
  rmSync(join(root, '.agents/notes/archived/manifest.json'))
  assert.ok(invoke(['check'], 1).diagnostics.some(item => item.code === 'FROZEN_NOTE_CHANGED'))
  const version = spawnSync(node, ['--version'], { encoding: 'utf8' }).stdout.trim()
  console.log(`Installed bundle and lifecycle smoke passed (${version}): ${cli}`)
}
finally {
  rmSync(root, { recursive: true, force: true })
}
