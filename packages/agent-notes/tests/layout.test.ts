import type { Bundle } from '../src/distribution/bundle'
import { Buffer } from 'node:buffer'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../src/cli/run'
import { manage } from '../src/distribution/manage'
import { body, git, project, write } from './fixtures'

vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
const bundle: Bundle = {
  version: '0.1.0',
  files: new Map([
    ['cli.mjs', Buffer.from('console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))\n')],
    ['assets/references/writing.md', Buffer.from('# Writing Notes\n')],
  ]),
  skills: new Map(['agent-note', 'agent-note-maintenance'].map(name => [`${name}/SKILL.md`, Buffer.from('Run `node .agents/notes/runtime/cli.mjs`. Draft in `.agents/notes/local/`.\n')])),
}
function setup(): string {
  const root = project()
  roots.push(root)
  rmSync(join(root, '.agents'), { recursive: true })
  return root
}
function install(root: string, notesDir = '.agents/notes') {
  return manage({ command: 'init', root, targets: ['agents'], notesDir, dryRun: false, recover: false }, root, bundle)
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('unified Notes root', () => {
  it.each(['.agents/notes', 'docs/decisions', 'docs/architecture/team/decisions/notes'])('installs and writes everything under %s', (notesDir) => {
    const root = setup()
    expect(install(root, notesDir)).toMatchObject({ result: 'ok', data: { notes_dir: notesDir } })
    for (const path of ['config.json', 'install.json', 'runtime/cli.mjs'])
      expect(existsSync(join(root, notesDir, path)), path).toBe(true)
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain(`node ${notesDir}/runtime/cli.mjs`)
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
    expect(run(['status'], root)).toMatchObject({ scope: { root }, result: 'failed', data: { notes_dir: 'docs/decisions', integrity: 'damaged' } })
    expect(manage({ command: 'repair', targets: [], dryRun: false, recover: false }, root, bundle).result).toBe('ok')
    expect(run(['status'], root).data.integrity).toBe('intact')
  })

  it('reports a missing installation within a new project', () => {
    const root = setup()
    expect(run(['context'], root).diagnostics[0].code).toBe('ROOT_NOT_FOUND')
  })
})
