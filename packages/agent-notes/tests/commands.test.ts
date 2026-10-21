import { Buffer } from 'node:buffer'
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { exitCode, run } from '../src/cli/run'
import { sha256 } from '../src/notes/snapshot'
import { archive, body, commit, document, git, ids, metadata, note, project, write } from './fixtures'

const projects: string[] = []
function setup(): string {
  const root = project()
  projects.push(root)
  return root
}
function check(root: string, ...args: string[]) {
  return run(['check', '--root', root, ...args])
}
afterEach(() => {
  for (const root of projects.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('discovery', () => {
  it('returns global pointers only by default and expands requires without body leakage', () => {
    const root = setup()
    note(root, metadata({ scope: { global: true }, relations: { requires: [ids[1]] } }))
    note(root, metadata({ id: ids[1], scope: { topics: ['dependency'] } }), 'dependency')
    note(root, metadata({ id: ids[2], scope: { topics: ['unrelated'] } }), 'unrelated')
    const result = run(['context', '--root', root])
    expect(result.result).toBe('ok')
    expect(result.data.notes).toMatchObject([{ id: ids[1] }, { id: ids[0] }])
    expect(JSON.stringify(result.data)).not.toContain('Infrastructure publication')
    expect(result.review.map(item => item.code)).toContain('SCOPE_REQUIRED')
  })

  it('matches paths/topics and requires explicit archive discovery', () => {
    const root = setup()
    const path = note(root)
    expect(run(['context', '--root', root, '--paths', 'src/orders/create.ts']).data.notes).toHaveLength(1)
    expect(run(['context', '--root', root, '--topic', 'Events']).data.notes).toHaveLength(0)
    const frozen = archive(root, path)
    expect(run(['context', '--root', root, '--topic', 'events']).data.notes).toHaveLength(0)
    expect(run(['context', '--root', root, '--topic', 'events', '--include-archived']).data.notes).toHaveLength(1)
    const result = run(['show', ids[0], '--root', root])
    expect(result.data).toMatchObject({ path: frozen, hash: sha256(readFileSync(join(root, frozen))), text: readFileSync(join(root, frozen), 'utf8') })
  })

  it('reports broken/unknown Notes rather than an empty successful search', () => {
    const root = setup()
    const path = note(root)
    write(root, path, document().replace('agent-note/1', 'agent-note/99'))
    const result = run(['context', '--root', root, '--topic', 'events'])
    expect(exitCode(result)).toBe(2)
    expect(result.diagnostics.map(item => item.code)).toContain('UNSUPPORTED_FORMAT')
  })

  it('locates config upward and supports explicit root before installation', () => {
    const root = setup()
    note(root)
    mkdirSync(join(root, 'src/deep'), { recursive: true })
    expect(run(['show', ids[0]], join(root, 'src/deep')).scope.root).toBe(root)
    rmSync(join(root, '.agent-notes'), { recursive: true })
    expect(run(['show', ids[0], '--root', root]).result).toBe('ok')
  })
})

describe('snapshot isolation', () => {
  it('checks relevant untracked Notes even when their directory is ignored', () => {
    const root = setup()
    write(root, '.gitignore', '.agents\n')
    commit(root)
    note(root)
    note(root, metadata(), 'duplicate')
    expect(check(root).diagnostics.map(item => item.code)).toContain('DUPLICATE_ID')
    expect(check(root, '--staged').result).toBe('ok')
    expect(check(root, '--staged').data.notes_checked).toBe(0)
  })

  it('does not let worktree fixes hide broken staged links or config', () => {
    const root = setup()
    const path = note(root)
    const base = commit(root)
    write(root, path, document(metadata(), `${body()}\n[Guide](../../../missing.md#guide)\n`))
    git(root, 'add', path)
    write(root, path, document())
    expect(check(root).result).toBe('ok')
    expect(check(root, '--staged').diagnostics.map(item => item.code)).toContain('BROKEN_REFERENCE')
    expect(check(root, '--base', base, '--head', base).result).toBe('ok')
    write(root, '.agent-notes/config.json', '{"format":"agent-notes-config/99"}')
    git(root, 'add', '.agent-notes/config.json')
    write(root, '.agent-notes/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: '.agents/notes', language: 'zh-CN' }))
    expect(check(root, '--staged').diagnostics.map(item => item.code)).toContain('UNSUPPORTED_FORMAT')
    expect(check(root).result).toBe('ok')
  })

  it('reads link targets entirely from index and commit trees', () => {
    const root = setup()
    note(root, metadata(), 'event-ownership', `${body()}\n[Guide](../../../../docs/guide.md#owner)\n`)
    write(root, 'docs/guide.md', '# Owner\n')
    const base = commit(root)
    write(root, 'docs/guide.md', '# Missing\n')
    git(root, 'add', 'docs/guide.md')
    write(root, 'docs/guide.md', '# Owner\n')
    expect(check(root).result).toBe('ok')
    expect(check(root, '--staged').diagnostics.map(item => item.code)).toContain('BROKEN_ANCHOR')
    expect(check(root, '--base', base, '--head', base).result).toBe('ok')
  })

  it('uses the config from the selected commit, even if worktree root changes', () => {
    const root = setup()
    note(root)
    const base = commit(root)
    write(root, '.agent-notes/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: 'decisions', language: 'en' }))
    expect(check(root, '--base', base, '--head', base).data.notes_checked).toBe(1)
  })

  it('marks initial commits and plain directories as lacking a history baseline', () => {
    const root = setup()
    note(root)
    git(root, 'add', '.')
    expect(check(root, '--staged').review.map(item => item.code)).toContain('NO_HISTORY_BASELINE')
    rmSync(join(root, '.git'), { recursive: true })
    expect(check(root).result).toBe('ok')
    expect(check(root).review.map(item => item.code)).toContain('NO_HISTORY_BASELINE')
    expect(exitCode(check(root, '--staged'))).toBe(2)
  })

  it('rejects unresolved refs, ambiguous argument combinations and unknown commands', () => {
    const root = setup()
    for (const args of [['--base', 'missing'], ['--head', 'HEAD'], ['--base', 'HEAD', '--head', 'HEAD', '--staged'], ['--wat']])
      expect(exitCode(check(root, ...args))).toBe(2)
    expect(exitCode(run(['create', '--root', root]))).toBe(2)
  })

  it('does not treat a non-file configuration as a missing installation', () => {
    const root = setup()
    rmSync(join(root, '.agent-notes/config.json'))
    mkdirSync(join(root, '.agent-notes/config.json'))
    expect(check(root).diagnostics.map(item => item.code)).toContain('NOT_REGULAR_FILE')
  })

  it('supports project roots nested inside a Git repository', () => {
    const repository = setup()
    const root = join(repository, 'nested')
    mkdirSync(root)
    note(root)
    const base = commit(repository)
    expect(check(root, '--base', base, '--head', base).data.notes_checked).toBe(1)
    write(root, 'code.ts', 'export const value = 1\n')
    expect(check(root).data.changed_paths).toEqual(['code.ts'])
  })

  it('rejects an unmerged index', () => {
    const root = setup()
    note(root)
    commit(root)
    write(root, 'conflict', 'base\n')
    commit(root)
    git(root, 'checkout', '-qb', 'other')
    write(root, 'conflict', 'other\n')
    commit(root)
    git(root, 'checkout', 'main')
    write(root, 'conflict', 'main\n')
    commit(root)
    expect(() => git(root, 'merge', 'other')).toThrow()
    expect(check(root, '--staged').diagnostics.map(item => item.code)).toContain('UNMERGED_INDEX')
  })
})

describe('relations and references', () => {
  it('uses Markdown syntax for reference definitions and ignores code fences', () => {
    const root = setup()
    note(root, metadata(), 'event-ownership', `${body()}\n\`\`\`md\n[bad](missing.md)\n\`\`\`\n[read][guide]\n\n[guide]: ../../../../docs/guide.md#owner-1\n`)
    write(root, 'docs/guide.md', '# Owner\n\n# Owner\n')
    expect(check(root).result).toBe('ok')
    write(root, 'docs/guide.md', '# Owner\n')
    expect(check(root).diagnostics.map(item => item.code)).toContain('BROKEN_ANCHOR')
  })

  it('rejects requires cycles and missing targets', () => {
    const root = setup()
    note(root, metadata({ relations: { requires: [ids[1]] } }))
    expect(check(root).diagnostics.map(item => item.code)).toContain('INVALID_RELATION')
    note(root, metadata({ id: ids[1], relations: { requires: [ids[0]] } }), 'second')
    expect(check(root).diagnostics.map(item => item.code)).toContain('RELATION_CYCLE')
  })

  it('distinguishes proposed, partial and effective full supersession', () => {
    const root = setup()
    note(root, metadata({ relations: { related: [ids[1]] } }))
    const replacement = metadata({ id: ids[1], status: 'proposed', relations: { supersedes: [{ id: ids[0], extent: 'full', reason: 'All callers migrated.' }] } })
    const proposed = note(root, replacement, 'replacement')
    note(root, metadata({ id: ids[2], relations: { requires: [ids[0]] } }), 'consumer')
    expect(check(root).result).toBe('ok')
    rmSync(join(root, proposed))
    note(root, { ...replacement, status: 'implemented' }, 'replacement')
    expect(check(root).diagnostics.map(item => item.code)).toContain('INVALID_RELATION')
    note(root, { ...replacement, status: 'implemented', relations: { supersedes: [{ id: ids[0], extent: 'partial', reason: 'Only new callers migrated.' }] } }, 'replacement')
    expect(check(root).result).toBe('ok')
  })

  it('rejects traversal and symlinks without reading outside the project', () => {
    const root = setup()
    const outside = setup()
    note(outside)
    mkdirSync(join(root, '.agents'), { recursive: true })
    symlinkSync(join(outside, '.agents/notes'), join(root, '.agents/notes'))
    expect(check(root).diagnostics.map(item => item.code)).toContain('SYMLINK_NOT_ALLOWED')
    rmSync(join(root, '.agents/notes'))
    note(root, metadata(), 'event-ownership', `${body()}\n[escape](../../../../../outside.md)\n`)
    expect(check(root).diagnostics.map(item => item.code)).toContain('BROKEN_REFERENCE')
  })
})

describe('historical protections', () => {
  it('accepts archive creation but detects simultaneous body and seal tampering', () => {
    const root = setup()
    const path = note(root)
    commit(root)
    const frozen = archive(root, path)
    expect(check(root).result).toBe('ok')
    expect(check(root).review.map(item => item.code)).not.toContain('ARCHIVE_SOURCE_REVIEW')
    commit(root)
    const bytes = readFileSync(join(root, frozen), 'utf8').replace('aggregate owns', 'infrastructure owns')
    write(root, frozen, bytes)
    const manifestPath = '.agents/notes/archived/manifest.json'
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'))
    manifest.entries[ids[0]].sha256 = sha256(Buffer.from(bytes))
    write(root, manifestPath, JSON.stringify(manifest))
    expect(check(root).diagnostics.map(item => item.code)).toContain('FROZEN_NOTE_CHANGED')
  })

  it('detects archive removal even after deleting the seal, marker and changing notes_dir', () => {
    const root = setup()
    archive(root, note(root))
    commit(root)
    rmSync(join(root, '.agents/notes'), { recursive: true })
    write(root, '.agent-notes/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: 'other-notes', language: 'en' }))
    expect(check(root).diagnostics.map(item => item.code)).toContain('FROZEN_NOTE_CHANGED')
  })

  it('does not validate frozen outgoing links as current references', () => {
    const root = setup()
    const path = note(root)
    const frozen = archive(root, path)
    const text = `${readFileSync(join(root, frozen), 'utf8')}\n[Old](missing.md)\n`
    write(root, frozen, text)
    const manifest = JSON.parse(readFileSync(join(root, '.agents/notes/archived/manifest.json'), 'utf8'))
    manifest.entries[ids[0]].sha256 = sha256(Buffer.from(text))
    write(root, '.agents/notes/archived/manifest.json', JSON.stringify(manifest))
    commit(root)
    expect(check(root).result).toBe('ok')
  })

  it('reports unverifiable initial archive sources and rejects forged exact revisions', () => {
    const root = setup()
    const path = note(root)
    const base = commit(root)
    const frozen = archive(root, path)
    const manifest = JSON.parse(readFileSync(join(root, '.agents/notes/archived/manifest.json'), 'utf8'))
    manifest.entries[ids[0]].source.sha256 = 'a'.repeat(64)
    write(root, '.agents/notes/archived/manifest.json', JSON.stringify(manifest))
    expect(check(root).review.map(item => item.code)).toContain('ARCHIVE_SOURCE_REVIEW')
    manifest.entries[ids[0]].source.revision = base
    write(root, '.agents/notes/archived/manifest.json', JSON.stringify(manifest))
    expect(check(root).diagnostics).toContainEqual(expect.objectContaining({ code: 'INVALID_ARCHIVE_SOURCE', path: frozen }))
  })

  it('preserves rejected text/reason and allows verified same-ID link moves', () => {
    const root = setup()
    const rejected = metadata({ status: 'rejected', rejection_reason: 'Does not solve ownership.', relations: { related: [ids[1]] } })
    const contents = `${body('rejected')}\n[Other](../../implemented/architecture/2026-10-21-other.md)\n`
    const rejectedPath = note(root, rejected, 'event-ownership', contents)
    const target = metadata({ id: ids[1] })
    const targetPath = note(root, target, 'other')
    commit(root)
    archive(root, targetPath, target)
    write(root, rejectedPath, document(rejected, contents.replace('../../implemented/', '../../archived/')))
    expect(check(root).result).toBe('ok')
    write(root, rejectedPath, document(rejected, contents.replace('../../implemented/', '../../archived/').replace('should own', 'must never own')))
    expect(check(root).diagnostics.map(item => item.code)).toContain('REJECTED_NOTE_CHANGED')
  })

  it('reports conditional deletion for review, but fails remaining active inbound links', () => {
    const root = setup()
    const old = note(root, metadata({ status: 'rejected', rejection_reason: 'No plausible future misuse remains.' }))
    note(root, metadata({ id: ids[1], relations: { related: [ids[0]] } }), 'owner')
    commit(root)
    rmSync(join(root, old))
    expect(check(root).diagnostics.map(item => item.code)).toContain('INVALID_RELATION')
    note(root, metadata({ id: ids[1] }), 'owner')
    expect(check(root).result).toBe('ok')
    expect(check(root).review.map(item => item.code)).toContain('NOTE_REMOVAL_REVIEW')
  })

  it('protects date/slug/class and disallows backwards status transitions', () => {
    const root = setup()
    const path = note(root)
    commit(root)
    const next = path.replace('/implemented/', '/proposed/').replace('event-ownership.md', 'different-decision.md')
    mkdirSync(dirname(join(root, next)), { recursive: true })
    renameSync(join(root, path), join(root, next))
    write(root, next, document(metadata({ status: 'proposed' })))
    const codes = check(root).diagnostics.map(item => item.code)
    expect(codes).toContain('NOTE_IDENTITY_CHANGED')
    expect(codes).toContain('INVALID_TRANSITION')
  })

  it('accepts mechanical code changes without demanding a new Note', () => {
    const root = setup()
    write(root, 'src/button.ts', 'export const label = "Save"\n')
    commit(root)
    write(root, 'src/button.ts', 'export const label = "Save changes"\n')
    const result = check(root)
    expect(result.result).toBe('ok')
    expect(result.data.changed_paths).toEqual(['src/button.ts'])
    expect(result.review.map(item => item.code)).toContain('CHANGE_RATIONALE_REVIEW')
  })
})
