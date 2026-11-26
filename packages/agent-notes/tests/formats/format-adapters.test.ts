import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { exitCode } from '../../src/cli/run'
import { parseNote, readIndex } from '../../src/notes/reader'
import { Repository } from '../../src/notes/snapshot'
import { executeWrite } from '../../src/workflow/execute'
import { body, commit, document, git, ids, metadata, note, project, write } from '../fixtures'
import { run } from '../production'
import { experimentalFormats, runExperimental } from './experimental'
import { configPath, hash, manifestPath, notesRoot, v2, v2Golden, v2Note } from './fixtures'

function setup() {
  const root = project()
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  return root
}
const invoke = (root: string, args: string[], input?: unknown, policy = false) => runExperimental(['--root', root, ...args], root, input === undefined ? undefined : JSON.stringify(input), policy)
const contents = (root: string, path: string) => readFileSync(join(root, path), 'utf8')
const material = (text: string) => ({ expected_hash: hash(text), reason: 'Verify the same durable decision.' })
const parse = (text: string, path = `${notesRoot}/implemented/architecture/2026-10-21-fixture.md`) => parseNote(Buffer.from(text), path, notesRoot, experimentalFormats)
const diagnostics = (result: ReturnType<typeof invoke>) => result.diagnostics.map(item => item.code)

describe('format dispatch', () => {
  it('reads v1 and v2 through the same canonical index and retains independent raw bytes', () => {
    const root = setup()
    const first = note(root, metadata({ id: ids[0], relations: { related: [ids[1]] } }))
    const second = v2Note(root, { id: ids[1], relations: { requires: [ids[0]] } })
    const index = readIndex(new Repository(root).snapshot('worktree'), experimentalFormats)
    expect(index.diagnostics).toEqual([])
    expect(index.notes.get(ids[0])?.source.format).toBe('agent-note/1')
    expect(index.notes.get(ids[1])?.source.format).toBe('agent-note/2')
    expect(index.notes.get(ids[1])?.value.metadata.read_when).toBe('When changing event ownership.')
    expect(index.notes.get(ids[1])?.source.hash).toBe(second.hash)
    index.notes.get(ids[1])?.source.bytes.copy().fill(0)
    expect(invoke(root, ['show', ids[1]]).data).toMatchObject({ path: second.path, text: second.text, hash: second.hash })
    expect(invoke(root, ['context', '--topic', 'events']).data.notes).toEqual(expect.arrayContaining([expect.objectContaining({ path: first, reasons: ['topic:events', `requires:${ids[1]}`] })]))
    expect(invoke(root, ['check']).result).toBe('ok')
    expect(run(['check'], root)).toMatchObject({ result: 'invalid-input', diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'UNSUPPORTED_FORMAT', details: { format: 'agent-note/2', supported_formats: ['agent-note/1'] } })]) })
    expect(run(['migrate', ids[0], '--to', 'agent-note/2', '--input', '-'], root).result).toBe('invalid-input')
    expect(run(['--help'], root).data.help).not.toContain('migrate')
  })

  it('reports per-kind formats and gives v2 validation the correct phase', () => {
    const root = setup()
    const { path, text } = v2Note(root)
    write(root, path, text.replace('readWhen:', 'read_when:'))
    expect(invoke(root, ['check'])).toMatchObject({ result: 'failed', diagnostics: [{ code: 'INVALID_NOTE_V2', details: { phase: 'metadata' } }] })
    write(root, path, text.replace('## Decision', '## Unknown'))
    expect(invoke(root, ['check'])).toMatchObject({ result: 'failed', diagnostics: [{ code: 'INVALID_NOTE_V2', details: { phase: 'body' } }] })
    write(root, path, text.replace('agent-note/2', 'agent-note/999'))
    write(root, manifestPath, '{"format":"agent-note-archive/99","entries":{}}')
    const wrong = invoke(root, ['check'])
    expect(exitCode(wrong)).toBe(2)
    expect(wrong.diagnostics[0].details?.supported_formats).toEqual(['agent-note-archive/1'])
    expect(wrong.diagnostics[1].details?.supported_formats).toEqual(expect.arrayContaining(['agent-note/1', 'agent-note/2']))
    expect(wrong.diagnostics[1].details?.supported_formats).not.toContain('agent-note-archive/1')
    write(root, configPath, '{"format":"agent-notes-config/99","notes_dir":".agents/notes","language":"en"}')
    expect(invoke(root, ['check'])).toMatchObject({ result: 'invalid-input', diagnostics: [{ code: 'UNSUPPORTED_FORMAT', details: { format: 'agent-notes-config/99', supported_formats: ['agent-notes-config/1'] } }] })
  })

  it('dispatches the staged and exact commit bytes independently of the worktree', () => {
    const root = setup()
    const path = note(root)
    const base = commit(root)
    write(root, path, v2())
    git(root, 'add', path)
    write(root, path, v2().replace('agent-note/2', 'agent-note/999'))
    expect(invoke(root, ['check', '--staged']).data.structural_check).toBe('passed')
    expect(invoke(root, ['check', '--base', base, '--head', base]).result).toBe('ok')
    expect(invoke(root, ['check']).diagnostics[0].code).toBe('UNSUPPORTED_FORMAT')
  })

  it('keeps absent config and seals source-free and defaults create to v1', () => {
    const root = setup()
    rmSync(join(root, configPath))
    const index = readIndex(new Repository(root).snapshot('worktree'), experimentalFormats)
    expect(index.config).toEqual({ notes_dir: notesRoot, language: 'zh-CN' })
    expect(index.configSource).toBeUndefined()
    expect(index.manifestSource).toBeUndefined()
    const path = `${notesRoot}/local/new.md`
    write(root, path, document().replace(/^format:.*\n|^id:.*\n|^status:.*\n/gm, ''))
    const result = invoke(root, ['create', '--input', '-', '--dry-run'], { class: 'architecture', status: 'implemented', document: path, rationale: 'A durable choice.' })
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(result.data.changes).toEqual([expect.objectContaining({ after: expect.stringContaining('format: agent-note/1') })])
  })
})

describe('local byte preservation', () => {
  it('preserves Chinese text, annotations, opaque extensions and untouched ranges of a single scalar patch', () => {
    const original = parse(v2Golden)
    expect(original.value).toMatchObject({ title: '事件发布权', metadata: { read_when: '改变订单发布责任时。', scope: { topics: ['events', 'routing'] } } })
    expect(original.source.residue).toMatchObject({ hasComments: true, hasOpaque: true })
    const after = experimentalFormats.patchNote(original.source, { metadata: { read_when: '新阅读条件。' } })
    expect(after.toString()).toBe(v2Golden.replace('"改变订单发布责任时。"', '"新阅读条件。"'))
    expect(parse(after.toString()).value.metadata.read_when).toBe('新阅读条件。')
    expect(experimentalFormats.patchNote(original.source, {})).toEqual(Buffer.from(v2Golden))
  })

  it('patches the v2 side of a cross-version backlink without disturbing its siblings', () => {
    const root = setup()
    const target = v2Note(root, { relations: { requires: [ids[2]] } }, 'target', body(), { opaque: { data: ['value'] } })
    note(root, metadata({ id: ids[2] }), 'requirement')
    const relation = `relations: {requires: ['${ids[2]}']} # retained\n`
    const original = target.text.replace(/relations:\n {2}requires:\n {4}- .*\n/, relation)
    write(root, target.path, original)
    const subject = note(root, metadata({ id: ids[1], status: 'proposed' }), 'subject')
    write(root, `${notesRoot}/local/update.md`, document(metadata({ id: ids[1], status: 'proposed', relations: { supersedes: [{ id: ids[0], extent: 'partial', reason: 'Merge one responsibility.' }] } })))
    const result = invoke(root, ['update', ids[1], '--input', '-'], { ...material(contents(root, subject)), document: `${notesRoot}/local/update.md` })
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(contents(root, target.path)).toBe(original.replace(']} # retained', `], related: [ "${ids[1]}" ]} # retained`))
  })

  it('preserves opaque source while applying a same-format replacement draft', () => {
    const root = setup()
    const { path } = v2Note(root)
    write(root, path, v2Golden)
    const draft = `${notesRoot}/local/draft.md`
    write(root, draft, v2({ scope: { topics: ['events', 'routing'] }, read_when: '新条件。' }, parse(v2Golden).value.body, { overwrite: false }))
    expect(invoke(root, ['update', ids[0], '--input', '-'], { ...material(v2Golden), document: draft }).result).toBe('ok')
    expect(contents(root, path)).toBe(v2Golden.replace('"改变订单发布责任时。"', '"新条件。"'))
    write(root, draft, document())
    expect(diagnostics(invoke(root, ['update', ids[0], '--input', '-'], { ...material(contents(root, path)), document: draft }))).toEqual(['INVALID_INPUT'])
  })

  it('rejects a removal that would orphan a comment and stays atomic', () => {
    const root = setup()
    const target = note(root, metadata({ id: ids[1] }), 'remove')
    const candidate = v2Note(root, { relations: { related: [ids[1]] } }, 'candidate')
    const text = candidate.text.replace(`- ${ids[1]}`, `- ${ids[1]} # Keep this explanation`)
    write(root, candidate.path, text)
    commit(root)
    const result = invoke(root, ['prune', ids[1], '--mechanical', '--input', '-'], { ...material(contents(root, target)), references: [{ path: candidate.path, target_id: null }] })
    expect(diagnostics(result)).toEqual(['UNSAFE_FORMAT_PATCH'])
    expect(contents(root, candidate.path)).toBe(text)
    expect(contents(root, target)).toBe(document(metadata({ id: ids[1] })))
  })
})

describe('shared lifecycle and supersession policy', () => {
  it.each(['full', 'partial'] as const)('uses the same activation rule for %s edges in dependency checks and queries', (extent) => {
    const root = setup()
    note(root, metadata({ relations: { related: [ids[1]] } }))
    const proposal = v2Note(root, { id: ids[1], status: 'proposed', relations: { supersedes: [{ id: ids[0], extent, reason: 'Replace the former entry.', activation: 'on-proposal' }] } })
    const dependant = note(root, metadata({ id: ids[2], relations: { requires: [ids[0]] } }), 'dependent')
    expect(diagnostics(invoke(root, ['check']))).toContain('POLICY_FEATURE_UNSUPPORTED')
    expect(diagnostics(invoke(root, ['check'], undefined, true))).toEqual(extent === 'full' ? ['INVALID_RELATION'] : [])
    expect(invoke(root, ['show', ids[0]], undefined, true).data.superseded_by).toMatchObject([{ id: ids[1], effective: true, extent }])
    if (extent === 'full')
      rmSync(join(root, dependant))
    expect(invoke(root, ['context', '--topic', 'events'], undefined, true).data.notes).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids[0], superseded_by: [expect.objectContaining({ effective: true })] })]))
    expect(invoke(root, ['check', '--maintenance'], undefined, true).review).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SUPERSESSION_MAINTENANCE', note_id: ids[0] })]))
    const result = invoke(root, ['transition', ids[1], '--to', 'rejected', '--input', '-'], material(proposal.text), true)
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(invoke(root, ['show', ids[0]], undefined, true).data.superseded_by).toEqual([])
  })

  it.each(['v1', 'v2'] as const)('protects %s archived bytes and existing seals', (version) => {
    const root = setup()
    const first = note(root, metadata({ id: ids[1] }), 'first')
    commit(root)
    expect(invoke(root, ['archive', ids[1], '--input', '-'], material(contents(root, first))).result).toBe('ok')
    const oldEntry = JSON.parse(contents(root, manifestPath)).entries[ids[1]]
    const path = version === 'v1' ? note(root) : v2Note(root).path
    if (version === 'v2')
      write(root, path, v2Golden)
    const text = contents(root, path)
    const baseline = commit(root)
    const archive = invoke(root, ['archive', ids[0], '--input', '-'], material(text))
    expect(archive.result, JSON.stringify(archive)).toBe('ok')
    const destination = archive.data.path as string
    const archived = contents(root, destination)
    const entry = JSON.parse(contents(root, manifestPath)).entries[ids[0]]
    expect(archived).toContain(`format: agent-note/${version === 'v1' ? 1 : 2}`)
    expect(entry).toEqual({ path: destination.slice(notesRoot.length + 1), sha256: hash(archived), source: { path: path.slice(notesRoot.length + 1), sha256: hash(text), revision: baseline } })
    expect(JSON.parse(contents(root, manifestPath)).entries[ids[1]]).toEqual(oldEntry)
    expect(invoke(root, ['check']).result).toBe('ok')
    // Change a presentation byte, reseal it and verify exact-source replay for v2.
    if (version === 'v2') {
      const changed = archived.replace('status:    implemented', 'status: implemented')
      write(root, destination, changed)
      write(root, manifestPath, contents(root, manifestPath).replace(entry.sha256, hash(changed)))
      expect(diagnostics(invoke(root, ['check']))).toContain('INVALID_ARCHIVE_SOURCE')
      write(root, destination, archived)
      write(root, manifestPath, contents(root, manifestPath).replace(hash(changed), entry.sha256))
    }
    commit(root)
    expect(diagnostics(invoke(root, ['migrate', ids[0], '--to', version === 'v1' ? 'agent-note/2' : 'agent-note/1', '--input', '-'], material(archived)))).toContain('FROZEN_NOTE_CHANGED')
    const modified = archived.replace('duplicate events', 'multiple events')
    write(root, destination, modified)
    write(root, manifestPath, contents(root, manifestPath).replace(entry.sha256, hash(modified)))
    expect(diagnostics(invoke(root, ['check']))).toContain('FROZEN_NOTE_CHANGED')
  })

  it.each(['v1', 'v2'] as const)('preserves %s rejected metadata and permits only same-identity reference repairs', (version) => {
    const root = setup()
    const destination = note(root)
    const input = { id: ids[1], status: 'rejected', rejection_reason: 'The boundary moved.' } as const
    const rejectedBody = `${body('rejected')}\n[Decision](../../implemented/architecture/${destination.split('/').at(-1)}#decision)\n`
    const rejected = version === 'v1' ? note(root, metadata(input), 'rejected', rejectedBody) : v2Note(root, input, 'rejected', rejectedBody).path
    commit(root)
    const original = contents(root, rejected)
    expect(diagnostics(invoke(root, ['migrate', ids[1], '--to', version === 'v1' ? 'agent-note/2' : 'agent-note/1', '--input', '-'], material(original)))).toContain('REJECTED_NOTE_CHANGED')
    expect(invoke(root, ['archive', ids[0], '--input', '-'], material(contents(root, destination))).result).toBe('ok')
    const repaired = original.replace('../../implemented/', '../../archived/')
    expect(contents(root, rejected)).toBe(repaired)
    write(root, rejected, repaired.replace('The boundary moved.', 'The reasons changed.'))
    expect(diagnostics(invoke(root, ['check']))).toContain('REJECTED_NOTE_CHANGED')
    write(root, rejected, version === 'v1' ? v2(input, rejectedBody.replace('../../implemented/', '../../archived/')) : document(metadata(input), rejectedBody.replace('../../implemented/', '../../archived/')))
    expect(diagnostics(invoke(root, ['check']))).toContain('REJECTED_NOTE_CHANGED')
  })
})

describe('explicit migration', () => {
  it('dry-runs and applies both directions with a replayable review and the original body', () => {
    const root = setup()
    const path = note(root)
    const base = commit(root)
    const original = contents(root, path)
    const migration = ['migrate', ids[0], '--to', 'agent-note/2', '--input', '-']
    const preview = invoke(root, [...migration, '--dry-run'], material(original))
    expect(preview.result, JSON.stringify(preview)).toBe('ok')
    expect(contents(root, path)).toBe(original)
    expect(preview.data.changes).toEqual([expect.objectContaining({ before: original, after: expect.stringContaining('readWhen:') })])
    expect(invoke(root, migration, material(original)).result).toBe('ok')
    const migrated = contents(root, path)
    expect(parse(original, path).value).toEqual(parse(migrated, path).value)
    expect(invoke(root, ['check', '--base', base]).review).toEqual([expect.objectContaining({ code: 'NOTE_FORMAT_MIGRATION', note_id: ids[0] })])
    expect(diagnostics(invoke(root, migration, material(original)))).toEqual(['CONCURRENT_CHANGE'])
    expect(exitCode(invoke(root, migration, material(migrated)))).toBe(2)
    commit(root)
    expect(invoke(root, ['migrate', ids[0], '--to', 'agent-note/1', '--input', '-'], material(migrated)).result).toBe('ok')
    expect(parse(contents(root, path), path).value).toEqual(parse(original, path).value)
    expect(invoke(root, ['check']).review[0].code).toBe('NOTE_FORMAT_MIGRATION')
  })

  it.each(['comment', 'opaque', 'activation'] as const)('rejects lossy migration with %s', (feature) => {
    const root = setup()
    const target = note(root, metadata({ relations: { related: [ids[1]] } }))
    const { path, text } = v2Note(root, { id: ids[1], ...(feature === 'activation' ? { relations: { supersedes: [{ id: ids[0], extent: 'partial', reason: 'Replace one use.', activation: 'on-proposal' }] } } : {}) }, 'migration', body(), feature === 'opaque' ? { vendor: {} } : undefined)
    const input = feature === 'comment' ? text.replace('status: implemented', 'status: implemented # Permanently retained') : text
    write(root, path, input)
    const outcome = invoke(root, ['migrate', ids[1], '--to', 'agent-note/1', '--input', '-'], material(input), true)
    expect(diagnostics(outcome)).toEqual(['LOSSY_FORMAT_CONVERSION'])
    expect(contents(root, path)).toBe(input)
    expect(contents(root, target)).toBe(document(metadata({ relations: { related: [ids[1]] } })))
  })

  it('uses ordinary content review for changes that cannot replay', () => {
    const root = setup()
    const path = note(root)
    expect(invoke(root, ['check']).review.map(item => item.code)).toEqual(['NO_HISTORY_BASELINE'])
    commit(root)
    const original = contents(root, path)
    const converted = experimentalFormats.convertNote(parse(original, path), 'agent-note/2').toString()
    for (const changed of [
      converted.replace('duplicate events', 'more events'),
      converted.replace('readWhen: When changing event ownership.', 'readWhen: "A different routing condition."'),
      converted.replace('status: implemented', 'status:    implemented'),
    ]) {
      write(root, path, changed)
      expect(invoke(root, ['check']).review.map(item => item.code)).toEqual(['NOTE_CHANGE_REVIEW'])
    }
  })

  it('rechecks migration observations during the transaction and preserves external edits', () => {
    const root = setup()
    const path = note(root)
    commit(root)
    const original = contents(root, path)
    const external = original.replace('duplicate events', 'an external edit')
    const options = { command: 'migrate', id: ids[0], to: 'agent-note/2', input: '-', dryRun: false, recover: false } as const
    const result = executeWrite(root, options, JSON.stringify(material(original)), {
      afterStep() {
        write(root, path, external)
      },
    }, experimentalFormats)
    expect(diagnostics(result)[0]).toMatch(/CONCURRENT_CHANGE|RECOVERY_CONFLICT/)
    expect(contents(root, path)).toBe(external)
  })

  it('rejects unknown targets and requires a migration reason', () => {
    const root = setup()
    const path = note(root)
    const original = contents(root, path)
    const request = ['migrate', ids[0], '--to', 'agent-note/999', '--input', '-']
    expect(exitCode(invoke(root, request, material(original)))).toBe(2)
    expect(exitCode(invoke(root, request, { expected_hash: hash(original) }))).toBe(3)
    expect(contents(root, path)).toBe(original)
  })
})

it.each(['prepared', 'committed'] as const)('recovers a real migration interrupted at %s', (state) => {
  const root = setup()
  const path = note(root)
  commit(root)
  const original = contents(root, path)
  const child = fileURLToPath(new URL('./migration-child.ts', import.meta.url))
  const crashed = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), child, root, ids[0], state, hash(original)], { encoding: 'utf8' })
  expect(crashed.signal, crashed.stdout || crashed.stderr).toBe('SIGKILL')
  expect(diagnostics(invoke(root, ['check']))).toEqual(['RECOVERY_REQUIRED'])
  expect(invoke(root, ['check', '--staged']).result).toBe('ok')
  const result = invoke(root, ['migrate', ids[0], '--to', 'agent-note/2', '--input', '-', '--recover'], material(original))
  if (state === 'prepared') {
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(result.data.recovered).toBe(true)
  }
  else {
    expect(diagnostics(result)).toEqual(['CONCURRENT_CHANGE'])
  }
  expect(contents(root, path)).toBe(experimentalFormats.convertNote(parse(original, path), 'agent-note/2').toString())
  expect(invoke(root, ['check']).result).toBe('ok')
})
