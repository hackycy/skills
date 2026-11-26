import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testBundle } from './distribution-fixtures'
import { body, commit, document, git, ids, note, project, write } from './fixtures'
import { manage, run } from './production'

vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
const bundle = testBundle()
function setup(): string {
  const root = project()
  roots.push(root)
  rmSync(join(root, '.agents'), { recursive: true })
  return root
}
function install(root: string, notesDir = '.agents/notes') {
  return manage({ command: 'install', root, hosts: ['generic'], notesDir, dryRun: false, recover: false }, root, bundle)
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('unified Notes root', () => {
  it.each(['.agents/notes', 'docs/decisions', 'docs/architecture/team/decisions/notes'])('installs and writes everything under %s', (notesDir) => {
    const root = setup()
    expect(install(root, notesDir)).toMatchObject({ result: 'ok', data: { notes_dir: notesDir } })
    for (const path of ['config.json', 'install.json', 'runtime/cli.mjs'])
      expect(existsSync(join(root, notesDir, path)), path).toBe(true)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
    expect(readFileSync(join(root, '.agents/skills/agent-note/SKILL.md'), 'utf8')).toContain(`node ${notesDir}/runtime/cli.mjs`)
    mkdirSync(join(root, 'src/nested'), { recursive: true })
    expect(run(['status'], join(root, 'src/nested'))).toMatchObject({ result: 'ok', scope: { root }, data: { notes_dir: notesDir } })
    write(root, `${notesDir}/local/draft.md`, `---\nscope:\n  topics: [events]\nread_when: Changing event ownership.\n---\n${body('proposed')}`)
    const created = run(['create', '--root', root, '--input', '-'], root, JSON.stringify({ class: 'architecture', status: 'proposed', document: `${notesDir}/local/draft.md`, rationale: 'Record why infrastructure publication was discarded.' }))
    expect(created.result, JSON.stringify(created)).toBe('ok')
    expect(String(created.data.path)).toMatch(new RegExp(`^${notesDir.replaceAll('.', '\\.')}\/proposed\/architecture\/`))
    expect(run(['check', '--root', root]).data.notes_checked).toBe(1)
  })

  it('ignores unrelated config files while discovering the installation', () => {
    const root = setup()
    write(root, 'app/config.json', '{"theme":"dark"}')
    expect(install(root).result).toBe('ok')
    expect(run(['status'], root).result).toBe('ok')
  })

  it('discovers an ignored custom root and excludes tool Markdown and configurations from Notes', () => {
    const root = setup()
    const notesDir = 'docs/decisions'
    expect(install(root, notesDir).result).toBe('ok')
    write(root, 'docs/.gitignore', '/decisions/\n')
    for (const directory of ['runtime', 'local']) {
      write(root, `${notesDir}/${directory}/invalid.md`, '---\ninvalid Note\n[missing](missing.md)\n')
      write(root, `${notesDir}/${directory}/config.json`, JSON.stringify({ format: 'agent-notes-config/1', notes_dir: `${notesDir}/${directory}`, language: 'en' }))
    }
    expect(git(root, 'ls-files', '--others', '--exclude-standard', '--', notesDir).trim()).toBe('')
    expect(run(['status'], root)).toMatchObject({ result: 'ok', data: { notes_dir: notesDir } })
    expect(run(['check'], root)).toMatchObject({ result: 'ok', data: { notes_checked: 0 } })
  })

  it('reports multiple Notes roots without selecting one', () => {
    const root = setup()
    expect(install(root).result).toBe('ok')
    cpSync(join(root, '.agents/notes'), join(root, 'docs/decisions'), { recursive: true })
    write(root, 'docs/decisions/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: 'docs/decisions', language: 'zh-CN' }))
    expect(run(['status', '--root', root]).diagnostics[0].code).toBe('ROOT_CONFLICT')
    expect(run(['context'], root).diagnostics[0].code).toBe('ROOT_CONFLICT')
  })

  it('reads each checkout independently with an ignored linked worktree', () => {
    const root = setup()
    expect(install(root).result).toBe('ok')
    const path = note(root)
    write(root, '.gitignore', `${readFileSync(join(root, '.gitignore'), 'utf8')}\n/.claude/worktrees/\n`)
    const revision = commit(root)
    const nestedPath = '.claude/worktrees/agent-token-fixed'
    const nested = join(root, nestedPath)
    git(root, 'worktree', 'add', '--detach', nested, revision)
    expect(git(root, 'check-ignore', nestedPath)).toBe(nestedPath)
    const nestedText = document(undefined, body().replace('# Event ownership', '# Worktree event ownership'))
    write(nested, path, nestedText)

    for (const [checkout, expectedText, title] of [
      [root, document(), 'Event ownership'],
      [nested, nestedText, 'Worktree event ownership'],
    ] as const) {
      expect(run(['show', ids[0]], checkout)).toMatchObject({ result: 'ok', scope: { root: checkout }, data: { path, text: expectedText } })
      expect(run(['check'], checkout)).toMatchObject({ result: 'ok', scope: { root: checkout }, data: { notes_checked: 1 } })
      expect(run(['context', '--topic', 'events'], checkout)).toMatchObject({ result: 'ok', scope: { root: checkout }, data: { notes: [{ id: ids[0], title }] } })
    }
  })

  it.each(['vendor/engine', 'node_modules/engine'])('excludes working tree configs Git still tracks in the nested repository %s', (nested) => {
    const root = setup()
    const config = `${nested}/decisions/config.json`
    note(root)
    write(root, '.agents/notes/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: '.agents/notes', language: 'en' }))
    write(root, config, JSON.stringify({ format: 'agent-notes-config/1', notes_dir: 'decisions', language: 'en' }))
    git(root, 'add', '-f', config)
    const revision = commit(root)
    git(root, 'init', nested)
    expect(git(root, 'ls-files', '--', nested)).toBe(config)

    expect(run(['context', '--root', root, '--topic', 'events'], root)).toMatchObject({ result: 'ok', data: { notes: [{ id: ids[0] }] } })
    expect(run(['context'], join(root, nested))).toMatchObject({ result: 'ok', scope: { root: join(root, nested) } })
    expect(run(['check', '--staged'], root).diagnostics[0].code).toBe('ROOT_CONFLICT')
    expect(run(['check', '--base', revision, '--head', revision], root).diagnostics[0].code).toBe('ROOT_CONFLICT')
  })

  it('does not use a nested checkout as the default Notes root', () => {
    const root = setup()
    git(root, 'init', '.agents')
    write(root, '.agents/notes/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: 'notes', language: 'en' }))
    expect(run(['context'], root).diagnostics[0]?.code).toBe('ROOT_NOT_FOUND')
    mkdirSync(join(root, '.agents/notes/local/write-lock'), { recursive: true })
    expect(run(['context', '--root', root], root).diagnostics[0]?.code).toBe('ROOT_NOT_FOUND')

    write(root, 'docs/decisions/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: 'docs/decisions', language: 'en' }))
    expect(run(['context'], root)).toMatchObject({ result: 'ok', scope: { root }, data: { notes: [] } })
  })

  it('reports damaged custom configuration instead of reading an empty Notes tree', () => {
    const root = setup()
    expect(install(root, 'docs/decisions').result).toBe('ok')
    write(root, 'docs/decisions/config.json', '{broken JSON')
    write(root, 'docs/decisions/install.json', '{broken JSON')
    expect(run(['context'], root).diagnostics[0]).toMatchObject({ code: 'INVALID_JSON', path: 'docs/decisions/config.json' })
  })

  it('locates a custom installation when its runtime needs repair', () => {
    const root = setup()
    expect(install(root, 'docs/decisions').result).toBe('ok')
    rmSync(join(root, 'docs/decisions/runtime'), { recursive: true })
    expect(run(['status'], root)).toMatchObject({ scope: { root }, result: 'failed' })
    expect(manage({ command: 'repair', hosts: [], dryRun: false, recover: false }, root, bundle).result).toBe('ok')
    expect(run(['status'], root).data.integrity).toBe('intact')
  })

  it('reports a missing installation within a new project', () => {
    const root = setup()
    expect(run(['context'], root).diagnostics[0].code).toBe('ROOT_NOT_FOUND')
  })
})
