import type { Metadata } from '../src/notes/model'
import { Buffer } from 'node:buffer'
import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { exitCode, run } from '../src/cli/run'
import { body, commit, document, ids, metadata, note, project, write } from './fixtures'

const roots: string[] = []
function setup(): string {
  const root = project()
  roots.push(root)
  write(root, '.gitignore', '.agent-notes/local/\n')
  return root
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
function hash(root: string, id = ids[0]): string {
  return run(['show', id, '--root', root]).data.hash as string
}
function action(root: string, command: string, input: unknown, args: string[] = []) {
  return run([command, ...args, '--root', root, '--input', '-'], root, JSON.stringify(input))
}
function newDraft(root: string, status = 'proposed', title = 'Event ownership', extra: Record<string, unknown> = {}): string {
  const path = '.agent-notes/local/draft.md'
  write(root, path, `---\n${stringify({ scope: { topics: ['events'] }, read_when: 'Changing event ownership.', ...extra })}---\n${body(status).replace('# Event ownership', `# ${title}`)}`)
  return path
}
function input(root: string, extra: Record<string, unknown> = {}, id = ids[0]): Record<string, unknown> {
  return { expected_hash: hash(root, id), reason: 'The ownership boundary has changed in relevance; preserve its rationale.', ...extra }
}
function check(root: string) {
  return run(['check', '--root', root])
}

describe('create and update', () => {
  it('previews without permanent identity or any writes, then creates a complete Note', () => {
    const root = setup()
    const draft = newDraft(root)
    const params = { class: 'architecture', status: 'proposed', document: draft, rationale: 'Code cannot explain why infrastructure publication was discarded.' }
    const before = readdirSync(join(root, '.agent-notes/local'))
    const preview = action(root, 'create', params, ['--dry-run'])
    expect(preview.result, JSON.stringify(preview)).toBe('ok')
    expect(preview.data.id).toBeNull()
    expect(preview.data.changes).toMatchObject([{ action: 'create', before: null, after: expect.stringContaining('## Proposal') }])
    expect(existsSync(join(root, '.agents/notes'))).toBe(false)
    expect(readdirSync(join(root, '.agent-notes/local'))).toEqual(before)
    const result = action(root, 'create', params)
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(result.data.id).toMatch(/^an-[a-f\d-]{36}$/)
    expect(result.data.id).not.toBe('an-00000000-0000-4000-8000-000000000000')
    expect(check(root).result).toBe('ok')
    expect(action(root, 'create', params).diagnostics.map(item => item.code)).toContain('PATH_CONFLICT')
  })

  it('requires rationale and rejects unknown operation or draft fields', () => {
    const root = setup()
    const draft = newDraft(root)
    const params = { class: 'architecture', status: 'proposed', document: draft }
    expect(exitCode(action(root, 'create', params))).toBe(3)
    expect(exitCode(action(root, 'create', { ...params, rationale: 'Durable reason.', approved: true }))).toBe(2)
    newDraft(root, 'proposed', 'Event ownership', { id: ids[0] })
    expect(exitCode(action(root, 'create', { ...params, rationale: 'Durable reason.' }))).toBe(2)
  })

  it('normalizes active drafts to UTF-8/LF and supports Unicode title slugs', () => {
    const root = setup()
    const draft = newDraft(root, 'implemented', '事件所有权')
    write(root, draft, `\uFEFF${readFileSync(join(root, draft), 'utf8').replaceAll('\n', '\r\n')}`)
    const result = action(root, 'create', { class: 'architecture', status: 'implemented', document: draft, rationale: '长期边界取舍。' })
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const text = readFileSync(join(root, String(result.data.path)), 'utf8')
    expect(text).not.toMatch(/[\r\uFEFF]/)
    expect(result.data.path).toContain('事件所有权.md')
  })

  it('returns existing topic candidates without mechanically blocking a distinct decision', () => {
    const root = setup()
    note(root)
    const draft = newDraft(root, 'proposed', 'Event failure ownership')
    const result = action(root, 'create', { class: 'architecture', status: 'proposed', document: draft, rationale: 'Failure recovery ownership needs separate rationale.' })
    expect(result.result).toBe('ok')
    expect(result.data.candidates).toMatchObject([{ id: ids[0] }])
  })

  it('updates the same identity and refuses stale expected_hash or a replacement identity', () => {
    const root = setup()
    const path = note(root)
    commit(root)
    const before = hash(root)
    write(root, '.agent-notes/local/edit.md', document(metadata(), body().replace('both order entry points', 'all three order entry points')))
    const result = action(root, 'update', input(root, { document: '.agent-notes/local/edit.md' }), [ids[0]])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(result.data.path).toBe(path)
    expect(hash(root)).not.toBe(before)
    expect(action(root, 'update', { expected_hash: before, reason: 'Stale edit.', document: '.agent-notes/local/edit.md' }, [ids[0]]).diagnostics.map(item => item.code)).toContain('CONCURRENT_CHANGE')
    write(root, '.agent-notes/local/edit.md', document(metadata({ id: ids[1] })))
    expect(exitCode(action(root, 'update', input(root, { document: '.agent-notes/local/edit.md' }), [ids[0]]))).toBe(2)
  })

  it('checks anchors before committing an update to a referenced section', () => {
    const root = setup()
    const path = note(root)
    write(root, 'README.md', `[Decision](${path}#event-ownership)\n`)
    write(root, '.agent-notes/local/edit.md', document().replace('# Event ownership', '# New title'))
    const before = readFileSync(join(root, path))
    const result = action(root, 'update', input(root, { document: '.agent-notes/local/edit.md' }), [ids[0]])
    expect(result.diagnostics.map(item => item.code)).toContain('BROKEN_ANCHOR')
    expect(readFileSync(join(root, path))).toEqual(before)
    expect(existsSync(join(root, '.agent-notes/local/write-lock'))).toBe(false)
  })
})

describe('delivery and rejection', () => {
  it('delivers a proposal and repairs inline/reference links without touching code examples', () => {
    const root = setup()
    const original = metadata({ status: 'proposed' })
    const path = note(root, original)
    const readme = `[Decision](${path}#problem)\n\n[Reference][owner]\n\n[owner]: ${path}#problem "Title"\n\n\`\`\`md\n[Example](${path})\n\`\`\`\n`
    write(root, 'README.md', readme)
    commit(root)
    write(root, '.agent-notes/local/implemented.md', document(metadata(), body()))
    const result = action(root, 'transition', input(root, { document: '.agent-notes/local/implemented.md' }), [ids[0], '--to', 'implemented'])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const destination = path.replace('/proposed/', '/implemented/')
    expect(existsSync(join(root, path))).toBe(false)
    const updated = readFileSync(join(root, 'README.md'), 'utf8')
    expect(updated).toContain(`[Decision](${destination}#problem)`)
    expect(updated).toContain(`[owner]: ${destination}#problem "Title"`)
    expect(updated).toContain(`[Example](${path})`)
    expect(check(root).result).toBe('ok')
  })

  it('repairs a moved proposal’s outgoing relative links to sibling Notes', () => {
    const root = setup()
    const sibling = note(root, metadata({ id: ids[1], status: 'proposed' }), 'sibling')
    const contents = `${body('proposed')}\n[Sibling](2026-10-21-sibling.md#problem)\n`
    note(root, metadata({ status: 'proposed' }), 'event-ownership', contents)
    const result = action(root, 'transition', input(root), [ids[0], '--to', 'rejected'])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const text = readFileSync(join(root, String(result.data.path)), 'utf8')
    expect(text).toContain(`[Sibling](../../proposed/architecture/${sibling.split('/').pop()}#problem)`)
    expect(check(root).result).toBe('ok')
  })

  it('converts planned supersession to related on rejection and preserves the proposal', () => {
    const root = setup()
    note(root)
    const draft = newDraft(root, 'proposed', 'Alternative event ownership', { relations: { supersedes: [{ id: ids[0], extent: 'full', reason: 'Candidate ownership boundary.' }] } })
    const created = action(root, 'create', { class: 'architecture', status: 'proposed', document: draft, rationale: 'A different ownership boundary needs durable analysis.' })
    expect(created.result, JSON.stringify(created)).toBe('ok')
    const id = String(created.data.id)
    const before = readFileSync(join(root, String(created.data.path)), 'utf8').split('\n---\n')[1]
    const rejected = action(root, 'transition', input(root, {}, id), [id, '--to', 'rejected'])
    expect(rejected.result, JSON.stringify(rejected)).toBe('ok')
    const text = readFileSync(join(root, String(rejected.data.path)), 'utf8')
    expect(text.split('\n---\n')[1]).toBe(before)
    expect(text).not.toContain('supersedes:')
    expect(text).toContain('related:')
    const updated = action(root, 'update', input(root, { metadata: { read_when: 'When revisiting the rejected alternative.' } }, id), [id])
    expect(updated.result).toBe('ok')
    expect(readFileSync(join(root, String(rejected.data.path)), 'utf8').split('\n---\n')[1]).toBe(before)
    expect(exitCode(action(root, 'update', input(root, { document: draft }, id), [id]))).toBe(2)
  })

  it('refuses delivery without implemented sections and avoids any file movement', () => {
    const root = setup()
    const path = note(root, metadata({ status: 'proposed' }))
    write(root, '.agent-notes/local/edit.md', document(metadata({ status: 'proposed' })))
    const result = action(root, 'transition', input(root, { document: '.agent-notes/local/edit.md' }), [ids[0], '--to', 'implemented'])
    expect(result.diagnostics.map(item => item.code)).toContain('INVALID_BODY')
    expect(existsSync(join(root, path))).toBe(true)
    expect(existsSync(join(root, path.replace('/proposed/', '/implemented/')))).toBe(false)
  })

  it('removes the last rejected routing relation without altering protected history', () => {
    const root = setup()
    note(root, metadata({ id: ids[1] }), 'dependency')
    const path = note(root, metadata({ status: 'rejected', rejection_reason: 'Keep the original verdict.', relations: { requires: [ids[1]] } }))
    commit(root)
    const originalBody = readFileSync(join(root, path), 'utf8').split('\n---\n')[1]
    const result = action(root, 'update', input(root, { metadata: { relations: {} } }), [ids[0]])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const after = readFileSync(join(root, path), 'utf8')
    expect(after).not.toContain('relations:')
    expect(after.split('\n---\n')[1]).toBe(originalBody)
    expect(check(root).result).toBe('ok')
    expect(action(root, 'archive', input(root, {}, ids[1]), [ids[1]]).result).toBe('ok')
  })

  it('refuses to guess a replacement for an incoming anchor removed by delivery', () => {
    const root = setup()
    const path = note(root, metadata({ status: 'proposed' }))
    write(root, 'README.md', `[Proposal](${path}#proposal)\n`)
    write(root, '.agent-notes/local/edit.md', document())
    const before = readFileSync(join(root, 'README.md'))
    const result = action(root, 'transition', input(root, { document: '.agent-notes/local/edit.md' }), [ids[0], '--to', 'implemented'])
    expect(result.diagnostics.map(item => item.code)).toContain('BROKEN_ANCHOR')
    expect(readFileSync(join(root, 'README.md'))).toEqual(before)
    expect(existsSync(join(root, path))).toBe(true)
  })

  it('refuses ambiguous escaped destinations before any file changes', () => {
    const root = setup()
    const path = note(root, metadata({ status: 'proposed' }))
    write(root, 'README.md', `[Proposal](${path.replace('event-ownership', 'event&#45;ownership')}#problem)\n`)
    const result = action(root, 'transition', input(root), [ids[0], '--to', 'rejected'])
    expect(result.diagnostics.map(item => item.code)).toContain('AMBIGUOUS_REFERENCE')
    expect(existsSync(join(root, path))).toBe(true)
  })

  it('refuses to corrupt a non-UTF-8 incoming Markdown file', () => {
    const root = setup()
    const path = note(root, metadata({ status: 'proposed' }))
    const original = Buffer.concat([Buffer.from([0xFF]), Buffer.from(`[Proposal](${path})\n`)])
    write(root, 'README.md', original)
    const result = action(root, 'transition', input(root), [ids[0], '--to', 'rejected'])
    expect(result.diagnostics.map(item => item.code)).toContain('INVALID_ENCODING')
    expect(readFileSync(join(root, 'README.md'))).toEqual(original)
    expect(existsSync(join(root, path))).toBe(true)
  })
})

describe('archive', () => {
  it('requires a baseline and blocks unresolved current dependencies', () => {
    const root = setup()
    note(root)
    expect(exitCode(action(root, 'archive', input(root), [ids[0]]))).toBe(2)
    note(root, metadata({ id: ids[1], relations: { requires: [ids[0]] } }), 'consumer')
    commit(root)
    const result = action(root, 'archive', input(root), [ids[0]])
    expect(result.diagnostics.map(item => item.code)).toContain('INVALID_RELATION')
    expect(existsSync(join(root, '.agents/notes/archived/manifest.json'))).toBe(false)
  })

  it('preserves source YAML/comments/body and frozen outgoing links, while repairing live incoming links', () => {
    const root = setup()
    const path = note(root, metadata(), 'event-ownership', `${body()}\n[Sibling](2026-10-21-sibling.md)\n`)
    note(root, metadata({ id: ids[1] }), 'sibling')
    write(root, path, readFileSync(join(root, path), 'utf8').replace('status: implemented', '# Keep the original formatting\nstatus: implemented'))
    write(root, 'README.md', `[History](${path}#decision)\n`)
    const base = commit(root)
    const original = readFileSync(join(root, path), 'utf8')
    const result = action(root, 'archive', input(root), [ids[0]])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const frozen = readFileSync(join(root, String(result.data.path)), 'utf8')
    expect(frozen.split('\narchive:')[0]).toBe(original.split('\n---\n')[0])
    expect(frozen.split('\n---\n')[1]).toBe(original.split('\n---\n')[1])
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('/archived/')
    const manifest = JSON.parse(readFileSync(join(root, '.agents/notes/archived/manifest.json'), 'utf8'))
    expect(manifest.entries[ids[0]].source.revision).toBe(base)
    expect(check(root).result).toBe('ok')
    for (const command of ['update', 'transition', 'archive', 'prune']) {
      const rejected = action(root, command, input(root), [ids[0], ...(command === 'transition' ? ['--to', 'implemented'] : [])])
      expect(rejected.diagnostics.map(item => item.code)).toContain('FROZEN_NOTE_CHANGED')
    }
  })

  it('omits a source revision when the operation archives uncommitted source bytes', () => {
    const root = setup()
    const path = note(root)
    commit(root)
    write(root, path, document(metadata(), body().replace('both order entry points', 'all three order entry points')))
    expect(action(root, 'archive', input(root), [ids[0]]).result).toBe('ok')
    const manifest = JSON.parse(readFileSync(join(root, '.agents/notes/archived/manifest.json'), 'utf8'))
    expect(manifest.entries[ids[0]].source.revision).toBeUndefined()
    expect(check(root).review.map(item => item.code)).toContain('ARCHIVE_SOURCE_REVIEW')
  })

  it('does not freeze an invalid current link to make the problem disappear', () => {
    const root = setup()
    note(root, metadata(), 'event-ownership', `${body()}\n[Missing](missing.md)\n`)
    commit(root)
    expect(action(root, 'archive', input(root), [ids[0]]).diagnostics.map(item => item.code)).toContain('BROKEN_REFERENCE')
  })
})

describe('conditional prune', () => {
  function absorption(root: string, partial = false): { old: string, owner: string } {
    const old = note(root, metadata({ relations: { related: [ids[1]] } }))
    const owner = note(root, metadata({ id: ids[1], relations: { supersedes: [{ id: ids[0], extent: partial ? 'partial' : 'full', reason: 'The successor takes over this responsibility.' }] } }), 'owner')
    commit(root)
    return { old, owner }
  }

  it('demands explicit owner/coverage/references and rejects partial absorption', () => {
    const root = setup()
    const { owner } = absorption(root, true)
    expect(exitCode(action(root, 'prune', input(root, { references: [] }), [ids[0]]))).toBe(3)
    const result = action(root, 'prune', input(root, { owner: { id: ids[1], expected_hash: hash(root, ids[1]) }, coverage: [{ source: '#decision', destination: '#decision' }], references: [{ path: owner, target_id: null }] }), [ids[0]])
    expect(result.diagnostics.map(item => item.code)).toContain('PARTIAL_ABSORPTION')
  })

  it('checks coverage locations and completes absorption with explicit incoming dispositions', () => {
    const root = setup()
    const { old, owner } = absorption(root)
    write(root, 'README.md', `[Prior decision](${old}#decision)\n`)
    const params = input(root, {
      owner: { id: ids[1], expected_hash: hash(root, ids[1]) },
      coverage: [{ source: '#decision', destination: '#missing' }],
      references: [{ path: owner, target_id: null }, { path: 'README.md', target_id: ids[1] }],
    })
    expect(action(root, 'prune', params, [ids[0]]).diagnostics.map(item => item.code)).toContain('INVALID_COVERAGE')
    params.coverage = [{ source: '#decision', destination: '#decision' }]
    const preview = action(root, 'prune', params, [ids[0], '--dry-run'])
    expect(preview.result, JSON.stringify(preview)).toBe('ok')
    expect(existsSync(join(root, old))).toBe(true)
    const result = action(root, 'prune', params, [ids[0]])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(existsSync(join(root, old))).toBe(false)
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain(owner)
    expect(readFileSync(join(root, owner), 'utf8')).not.toContain('supersedes:')
    expect(check(root).result).toBe('ok')
    expect(result.review.map(item => item.code)).toContain('PRUNE_REVIEW')
  })

  it('can absorb additional content into the owner in the same transaction', () => {
    const root = setup()
    const { owner } = absorption(root)
    const ownerMeta: Metadata = metadata({ id: ids[1], relations: { supersedes: [{ id: ids[0], extent: 'full', reason: 'All responsibility absorbed.' }] } })
    write(root, '.agent-notes/local/owner.md', document(ownerMeta, `${body()}\n## Legacy coverage gap\nThe old retry worker remains uncovered and requires integration evidence.\n`))
    const result = action(root, 'prune', input(root, {
      owner: { id: ids[1], expected_hash: hash(root, ids[1]), document: '.agent-notes/local/owner.md' },
      coverage: [{ source: '#verification', destination: '#legacy-coverage-gap' }],
      references: [{ path: owner, target_id: null }],
    }), [ids[0]])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(readFileSync(join(root, owner), 'utf8')).toContain('old retry worker')
  })

  it('requires dispositions for every incoming source and removes reference links as plain labels', () => {
    const root = setup()
    const old = note(root, metadata({ status: 'rejected', rejection_reason: 'The failure scenario is no longer possible.' }))
    write(root, 'README.md', `[Old **proposal**][old]\n\n[old]: ${old}#proposal\n`)
    commit(root)
    const params = input(root, { references: [] })
    expect(exitCode(action(root, 'prune', params, [ids[0]]))).toBe(3)
    params.references = [{ path: 'README.md', target_id: null }]
    const result = action(root, 'prune', params, [ids[0]])
    expect(result.result, JSON.stringify(result)).toBe('ok')
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('Old **proposal**')
    expect(readFileSync(join(root, 'README.md'), 'utf8')).not.toContain('[old]')
  })

  it('cannot rewrite another rejected decision’s protected body during pruning', () => {
    const root = setup()
    const old = note(root, metadata({ status: 'rejected', rejection_reason: 'Obsolete.' }))
    const other = note(root, metadata({ id: ids[1], status: 'rejected', rejection_reason: 'Keep the history.' }), 'other', `${body('rejected')}\n[Original](2026-10-21-event-ownership.md)\n`)
    commit(root)
    const result = action(root, 'prune', input(root, { references: [{ path: other, target_id: null }] }), [ids[0]])
    expect(result.diagnostics.map(item => item.code)).toContain('REJECTED_NOTE_CHANGED')
    expect(existsSync(join(root, old))).toBe(true)
  })

  it('supports rejection followed by justified deletion within the same PR', () => {
    const root = setup()
    note(root, metadata({ status: 'proposed' }))
    commit(root)
    expect(action(root, 'prune', input(root, { references: [] }), [ids[0]]).diagnostics.map(item => item.code)).toContain('INVALID_REMOVAL')
    expect(action(root, 'transition', input(root), [ids[0], '--to', 'rejected']).result).toBe('ok')
    expect(action(root, 'prune', input(root, { references: [] }), [ids[0]]).result).toBe('ok')
    expect(check(root).result).toBe('ok')
    expect(check(root).review.map(item => item.code)).toContain('NOTE_REMOVAL_REVIEW')
  })
})

describe('write input boundaries', () => {
  it('reads input paths relative to root and rejects duplicate JSON fields and symlinks', () => {
    const root = setup()
    const draft = newDraft(root)
    const params = { class: 'architecture', status: 'proposed', document: draft, rationale: 'Durable rationale.' }
    write(root, '.agent-notes/local/input.json', JSON.stringify(params))
    const result = run(['create', '--input', '.agent-notes/local/input.json'], join(root, '.agent-notes/local'))
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const duplicate = run(['create', '--root', root, '--input', '-'], root, '{"class":"architecture","class":"testing"}')
    expect(exitCode(duplicate)).toBe(2)
    symlinkSync(join(root, draft), join(root, '.agent-notes/local/link.md'))
    expect(action(root, 'create', { ...params, document: '.agent-notes/local/link.md' }).diagnostics.map(item => item.code)).toContain('SYMLINK_NOT_ALLOWED')
    expect(exitCode(action(root, 'create', { ...params, document: '../outside.md' }))).toBe(2)
  })
})
