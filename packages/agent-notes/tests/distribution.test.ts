import type { Bundle } from '../src/distribution/bundle'
import type { ManageOptions } from '../src/distribution/manage'
import type { Installation, Target } from '../src/distribution/manifest'
import type { TransactionHooks } from '../src/workflow/transaction'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../src/cli/run'
import { manage } from '../src/distribution/manage'
import { block, installPath } from '../src/distribution/manifest'
import { checkLinks } from '../src/notes/markdown'
import { Repository } from '../src/notes/snapshot'
import { executeWrite } from '../src/workflow/execute'
import { recoverTransaction } from '../src/workflow/transaction'
import { archive, commit, git, ids, metadata, note, project, write } from './fixtures'

vi.setConfig({ testTimeout: 30_000 })

const roots: string[] = []
const runtime = 'console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))\n'
function bundle(version = '0.1.0'): Bundle {
  return { version, files: new Map([['cli.mjs', Buffer.from(runtime)], ['rules.md', Buffer.from(`Rules ${version}\n`)]]), skills: new Map(['agent-note', 'agent-note-maintenance'].map(name => [`${name}/SKILL.md`, Buffer.from(`Skill ${name} ${version}\n`)])) }
}
function setup(blank = false): string {
  const root = project()
  roots.push(root)
  if (blank)
    rmSync(join(root, '.agent-notes'), { recursive: true })
  return root
}
function command(root: string, name: ManageOptions['command'] = 'init', targetBundle = bundle(), extra: Partial<ManageOptions> = {}, hooks: TransactionHooks = {}) {
  return manage({ command: name, root, targets: ['agents'], dryRun: false, recover: false, ...extra }, root, targetBundle, hooks)
}
function read(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8')
}
function manifest(root: string): Installation {
  return JSON.parse(read(root, installPath))
}
function expectOk(result: ReturnType<typeof manage>): void {
  expect(result.result, JSON.stringify(result)).toBe('ok')
}
function allFiles(root: string, prefix = ''): Map<string, string> {
  const result = new Map<string, string>()
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (path === '.git' || path === '.agent-notes/local')
      continue
    if (entry.isDirectory()) {
      for (const [childPath, bytes] of allFiles(root, path))
        result.set(childPath, bytes)
    }
    else {
      result.set(path, read(root, path))
    }
  }
  return result
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('installation ownership', () => {
  it.each([['agents'], ['claude'], ['agents', 'claude']] as Target[][])('installs targets %j without creating a Note', (...targets) => {
    const root = setup(true)
    expectOk(command(root, 'init', bundle(), { targets }))
    expect(manifest(root).targets).toEqual(targets)
    expect(JSON.parse(read(root, '.agent-notes/config.json')).notes_dir).toBe('.agents/notes')
    expect(existsSync(join(root, '.agents/notes'))).toBe(false)
    for (const target of ['agents', 'claude'])
      expect(existsSync(join(root, `.${target}/skills/agent-note/SKILL.md`))).toBe(targets.includes(target as Target))
    expect(existsSync(join(root, '.claude/settings.json'))).toBe(false)
    expectOk(command(root, 'status'))
    const before = allFiles(root)
    expectOk(command(root, 'init', bundle(), { targets }))
    expect(allFiles(root)).toEqual(before)
  })

  it('preserves custom configuration and original entry bytes outside its block', () => {
    const root = setup()
    const config = '{\n "format": "agent-notes-config/1", "notes_dir": "docs/decisions", "language": "en"\n}\n'
    write(root, '.agent-notes/config.json', config)
    write(root, 'AGENTS.md', 'Original rules\r\n@project-guide.md\r\n')
    write(root, 'CLAUDE.md', '@AGENTS.md\nExtra rules\n')
    write(root, 'project-guide.md', '# Guide\n')
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    expect(read(root, '.agent-notes/config.json')).toBe(config)
    expect(read(root, 'AGENTS.md').startsWith('Original rules\r\n@project-guide.md\r\n')).toBe(true)
    expect(read(root, 'CLAUDE.md').startsWith('@AGENTS.md\nExtra rules\n')).toBe(true)
    expect(existsSync(join(root, '.claude/CLAUDE.md'))).toBe(false)
    expectOk(command(root, 'upgrade', bundle('0.2.0')))
    expect(read(root, '.agent-notes/config.json')).toBe(config)
  })

  it('keeps inherited AGENTS rules when it creates a Claude entry, including after upgrade', () => {
    const root = setup()
    write(root, 'AGENTS.md', '# Shared project instructions\n')
    expectOk(command(root, 'init', bundle(), { targets: ['claude'] }))
    expect(read(root, '.claude/CLAUDE.md')).toContain('@../AGENTS.md')
    expectOk(command(root, 'upgrade', bundle('0.2.0')))
    expect(read(root, '.claude/CLAUDE.md')).toContain('@../AGENTS.md')
  })

  it('shares a single route when both targets are installed', () => {
    const root = setup()
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    expect(read(root, 'AGENTS.md')).toContain('Engineering decision Notes')
    expect(read(root, '.claude/CLAUDE.md')).toContain('@../AGENTS.md')
    expect(read(root, '.claude/CLAUDE.md')).not.toContain('Engineering decision Notes')
    expectOk(command(root, 'upgrade', bundle('0.2.0')))
    expect(read(root, '.claude/CLAUDE.md')).not.toContain('Engineering decision Notes')
  })

  it.each(['CLAUDE.md', '.claude/CLAUDE.md'])('reuses an existing direct AGENTS import in %s', (entry) => {
    const root = setup()
    const text = entry === 'CLAUDE.md' ? '@AGENTS.md\nProject rules\n' : '@../AGENTS.md\nProject rules\n'
    write(root, entry, text)
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    expect(read(root, entry)).toBe(text)
    expectOk(command(root, 'upgrade', bundle('0.2.0')))
    expect(read(root, entry)).toBe(text)
  })

  it.each(['```text\n@AGENTS.md\n```\n', '    @AGENTS.md\n'])('does not treat an import code example as an active route: %s', (example) => {
    const root = setup()
    write(root, 'CLAUDE.md', example)
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    expect(block(read(root, 'CLAUDE.md'), 'CLAUDE.md')?.text).toContain('@AGENTS.md')
  })

  it('keeps a reused ignored Claude entry trackable without taking ownership of its content', () => {
    const root = setup()
    write(root, '.gitignore', '.claude/\n')
    write(root, '.claude/CLAUDE.md', '@../AGENTS.md\nLocal rules\n')
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    expect(read(root, '.claude/CLAUDE.md')).toBe('@../AGENTS.md\nLocal rules\n')
    expect(spawnSync('git', ['-C', root, 'check-ignore', '--no-index', '-q', '.claude/CLAUDE.md']).status).toBe(1)
    expect(manifest(root).assets.some(asset => asset.path === '.claude/CLAUDE.md')).toBe(false)
  })

  it('uses a configured language and custom document directory on blank init', () => {
    const root = setup(true)
    expectOk(command(root, 'init', bundle(), { notesDir: 'docs/decisions', language: 'en' }))
    expect(JSON.parse(read(root, '.agent-notes/config.json'))).toMatchObject({ notes_dir: 'docs/decisions', language: 'en' })
    expect(read(root, '.gitattributes')).toContain('/docs/decisions/** text eol=lf')
  })

  it.each(['agents', 'claude'] as const)('relocates shared and skill-local resources for %s without rewriting examples', (target) => {
    const root = setup()
    const content = bundle()
    const guide = '# Example\n\n[Shared](../../../references/writing.md#inputs)\n\n![Asset](example.bin)\n'
    const skill = '# Skill\n\n[Guide][guide]\n\n[guide]: references/example.md#example\n\n[Format](../../formats/document.md)\n\n[Formats](../../formats/)\n\n[Local](references/)\n\n```md\n[Example](../../references/writing.md)\n```\n'
    content.files.set('assets/references/writing.md', Buffer.from('# Inputs\n'))
    content.files.set('assets/formats/document.md', Buffer.from('# Format\n'))
    for (const [path, bytes] of [
      ['agent-note/SKILL.md', Buffer.from(skill)],
      ['agent-note/references/example.md', Buffer.from(guide)],
      ['agent-note/references/example.bin', Buffer.from([0, 255, 128])],
    ] as const) {
      content.files.set(`assets/skills/${path}`, bytes)
      content.skills.set(path, bytes)
    }
    expectOk(command(root, 'init', content, { targets: [target] }))
    const prefix = `.${target}/skills/agent-note`
    expect(read(root, `${prefix}/SKILL.md`)).toContain('[guide]: references/example.md#example')
    expect(read(root, `${prefix}/SKILL.md`)).toContain('[Format](../../../.agent-notes/runtime/assets/formats/document.md)')
    expect(read(root, `${prefix}/SKILL.md`)).toContain('[Formats](../../../.agent-notes/runtime/assets/formats)')
    expect(read(root, `${prefix}/SKILL.md`)).toContain('[Local](references/)')
    expect(read(root, `${prefix}/SKILL.md`)).toContain('```md\n[Example](../../references/writing.md)\n```')
    expect(read(root, `${prefix}/references/example.md`)).toContain('../../../../.agent-notes/runtime/assets/references/writing.md#inputs')
    expect(readFileSync(join(root, `${prefix}/references/example.bin`))).toEqual(Buffer.from([0, 255, 128]))
    expect(read(root, '.agent-notes/runtime/assets/skills/agent-note/SKILL.md')).toBe(skill)
    const source = new Repository(root).snapshot('worktree')
    source.includeDirectory('.agent-notes/runtime')
    expect(checkLinks(source, source.paths().filter(path => path.endsWith('.md')))).toEqual([])
  })

  it.each(['.GIT/private-notes', '.AGENT-NOTES/runtime'])('rejects reserved directory aliases on case-insensitive filesystems: %s', (notesDir) => {
    const root = setup(true)
    expect(command(root, 'init', bundle(), { notesDir }).diagnostics[0].code).toBe('INVALID_CONFIG')
    expect(existsSync(join(root, installPath))).toBe(false)
  })

  it('requires explicit valid targets and rejects unknown installer flags', () => {
    const root = setup()
    for (const args of [['init'], ['init', '--target', 'cursor'], ['init', '--target', 'agents', '--target', 'agents'], ['upgrade', '--to', '0.2.0'], ['status', '--recover'], ['init', '--target', 'agents', '--dry-run', '--recover']])
      expect(run([...args, '--root', root]).result).toBe('invalid-input')
    expect(existsSync(join(root, installPath))).toBe(false)
  })

  it.each(['runtime', 'skill', 'note', 'marker'])('does not adopt an unknown %s', (kind) => {
    const root = setup()
    const path = kind === 'runtime' ? '.agent-notes/runtime/custom.txt' : kind === 'skill' ? '.agents/skills/agent-note/custom.txt' : kind === 'note' ? note(root) : 'AGENTS.md'
    if (kind !== 'note')
      write(root, path, kind === 'marker' ? '<!-- agent-notes:begin -->\nunknown\n<!-- agent-notes:end -->\n' : 'Unknown bytes\n')
    const before = allFiles(root)
    expect(command(root).diagnostics.map(item => item.code)).toContain('UNOWNED_ASSET')
    expect(allFiles(root)).toEqual(before)
  })

  it.each(['.agents', '.agent-notes/runtime', 'AGENTS.md'])('refuses symlink target %s', (path) => {
    const root = setup()
    const outside = setup(true)
    symlinkSync(outside, join(root, path))
    const result = command(root)
    expect(result.diagnostics.map(item => item.code)).toContain('SYMLINK_NOT_ALLOWED')
    expect(existsSync(join(root, installPath))).toBe(false)
  })

  it('resolves Git root on first install and installed root from nested directories', () => {
    const root = setup(true)
    mkdirSync(join(root, 'src/sub'), { recursive: true })
    const options: ManageOptions = { command: 'init', targets: ['agents'], dryRun: false, recover: false }
    const result = manage(options, join(root, 'src/sub'), bundle())
    expectOk(result)
    expect(result.scope.root).toBe(root)
    expect(manage({ ...options, command: 'status' }, join(root, 'src/sub')).scope.root).toBe(root)
  })
})

describe('git distribution rules', () => {
  it('makes installed assets and future Notes trackable while other ignored skills stay ignored', () => {
    const root = setup()
    write(root, '.gitignore', '# user rules\n.agents/\n.claude/\n.agent-notes/\n*.log\n')
    write(root, '.agents/skills/unrelated/SKILL.md', 'User skill\n')
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    const ignored = (path: string) => spawnSync('git', ['-C', root, 'check-ignore', '--no-index', '-q', path]).status === 0
    for (const asset of manifest(root).assets)
      expect(ignored(asset.path), asset.path).toBe(false)
    for (const path of ['.agent-notes/config.json', installPath, '.agents/notes/implemented/feature/future.md'])
      expect(ignored(path), path).toBe(false)
    for (const path of ['.agents/skills/unrelated/SKILL.md', '.claude/skills/other/SKILL.md', '.agent-notes/local/draft.md', 'app.log'])
      expect(ignored(path), path).toBe(true)
    expect(read(root, '.gitignore').startsWith('# user rules\n.agents/\n.claude/\n.agent-notes/\n*.log\n')).toBe(true)
    expectOk(command(root, 'upgrade', bundle('0.2.0')))
    expect(ignored('.agent-notes/local/backup')).toBe(true)
    expect(ignored('.agents/notes/implemented/feature/future.md')).toBe(false)
  })

  it('reports nested ignore rules it cannot safely override', () => {
    const root = setup()
    write(root, '.agents/.gitignore', 'skills/\n')
    expect(command(root).diagnostics.map(item => item.code)).toContain('GIT_IGNORE_CONFLICT')
    expect(existsSync(join(root, installPath))).toBe(false)
  })

  it.each(['.agents/notes/** -text', '* text eol=crlf'])('reports conflicting attributes: %s', (rule) => {
    const root = setup()
    write(root, '.gitattributes', `${rule}\n`)
    expect(command(root).diagnostics.map(item => item.code)).toContain('GIT_ATTRIBUTES_CONFLICT')
    expect(read(root, '.gitattributes')).toBe(`${rule}\n`)
  })

  it('survives Git checkout with core.autocrlf=true without changing protected bytes', () => {
    const root = setup()
    write(root, 'AGENTS.md', 'Original project rules\n')
    expectOk(command(root, 'init', bundle(), { targets: ['agents', 'claude'] }))
    const path = note(root)
    const frozen = archive(root, path)
    commit(root)
    const checkout = setup(true)
    rmSync(checkout, { recursive: true })
    git(root, '-c', 'core.autocrlf=true', 'clone', '--no-local', root, checkout)
    expect(read(checkout, 'AGENTS.md')).toContain('\r\n')
    expectOk(command(checkout, 'status'))
    for (const protectedPath of [frozen, '.agents/notes/archived/manifest.json', '.agent-notes/config.json', '.agent-notes/runtime/cli.mjs'])
      expect(read(checkout, protectedPath), protectedPath).toBe(read(root, protectedPath))
    const before = allFiles(checkout)
    expect(command(checkout, 'upgrade').data.changes).toEqual([])
    expect(allFiles(checkout)).toEqual(before)
  })

  it('reports conflicting runtime newline attributes before installing', () => {
    const root = setup()
    write(root, '.gitattributes', '.agent-notes/runtime/** eol=crlf\n')
    expect(command(root).diagnostics.map(item => item.code)).toContain('GIT_ATTRIBUTES_CONFLICT')
    expect(existsSync(join(root, installPath))).toBe(false)
  })

  it('sets LF attributes for future Notes without disturbing other file rules', () => {
    const root = setup()
    write(root, '.gitattributes', '* text=auto\n*.png binary\n')
    expectOk(command(root))
    expect(git(root, 'check-attr', 'text', 'eol', '--', '.agents/notes/implemented/feature/future.md')).toContain('eol: lf')
    expect(git(root, 'check-attr', 'text', '--', 'image.png')).toContain('text: unset')
  })
})

describe('upgrades and recovery boundaries', () => {
  it('preserves every Note, seal and project byte across upgrades and supported downgrades', () => {
    const root = setup()
    expectOk(command(root))
    note(root, metadata({ status: 'proposed' }))
    const original = note(root, metadata({ id: ids[1] }), 'archive-source')
    archive(root, original, metadata({ id: ids[1] }))
    const prior = allFiles(root)
    const protectedPaths = [...prior.keys()].filter(path => path.startsWith('.agents/notes/') || path === '.agent-notes/config.json')
    for (const version of ['0.2.0', '0.1.0']) {
      expectOk(command(root, 'upgrade', bundle(version)))
      expect(manifest(root).version).toBe(version)
      for (const path of protectedPaths)
        expect(read(root, path), path).toBe(prior.get(path))
    }
  })

  it('dry-run lists exact changes and modified assets without backups or project writes', () => {
    const root = setup()
    expectOk(command(root))
    write(root, '.agents/skills/agent-note/SKILL.md', 'My modified skill\n')
    const before = allFiles(root)
    const result = command(root, 'upgrade', bundle('0.2.0'), { dryRun: true })
    expectOk(result)
    expect(result.data.modified_assets).toContain('.agents/skills/agent-note/SKILL.md')
    expect(result.data.changes).not.toEqual([])
    expect(existsSync(join(root, '.agent-notes/local/backups'))).toBe(false)
    expect(allFiles(root)).toEqual(before)
  })

  it('backs up edited assets and diffs before replacement, including owned blocks', () => {
    const root = setup()
    expectOk(command(root))
    write(root, '.agents/skills/agent-note/SKILL.md', 'My modified skill\n')
    write(root, 'AGENTS.md', `User prefix\n${read(root, 'AGENTS.md').replace('Engineering decision Notes', 'Edited title')}User suffix\n`)
    const entry = read(root, 'AGENTS.md')
    const result = command(root, 'upgrade', bundle('0.2.0'))
    expectOk(result)
    const backup = result.data.backup as string
    expect(read(root, `${backup}/original/.agents/skills/agent-note/SKILL.md`)).toBe('My modified skill\n')
    expect(read(root, `${backup}/original/AGENTS.md`)).toBe(entry)
    expect(read(root, `${backup}/changes.patch`)).toContain('-My modified skill')
    expect(read(root, 'AGENTS.md').startsWith('User prefix\n')).toBe(true)
    expect(read(root, 'AGENTS.md').endsWith('User suffix\n')).toBe(true)
    expectOk(command(root, 'status'))
  })

  it('repairs same-version damage, and intact upgrade is a no-op', () => {
    const root = setup()
    expectOk(command(root))
    rmSync(join(root, '.agent-notes/runtime/rules.md'))
    expect(command(root, 'status').data.integrity).toBe('damaged')
    expect(command(root).diagnostics[0].code).toBe('UPGRADE_REQUIRED')
    expectOk(command(root, 'upgrade'))
    expect(command(root, 'upgrade').data.changes).toEqual([])
    expect(command(root, 'init', bundle('0.2.0')).diagnostics[0].code).toBe('UPGRADE_REQUIRED')
  })

  it('removes only obsolete manifest assets and preserves unknown neighboring files', () => {
    const root = setup()
    const previous = bundle()
    previous.files.set('obsolete.txt', Buffer.from('Old managed asset\n'))
    expectOk(command(root, 'init', previous))
    write(root, '.agent-notes/runtime/unknown.txt', 'Keep me\n')
    expectOk(command(root, 'upgrade', bundle('0.2.0')))
    expect(existsSync(join(root, '.agent-notes/runtime/obsolete.txt'))).toBe(false)
    expect(read(root, '.agent-notes/runtime/unknown.txt')).toBe('Keep me\n')
    const collision = bundle('0.3.0')
    collision.files.set('unknown.txt', Buffer.from('Replacement\n'))
    expect(command(root, 'upgrade', collision).diagnostics[0].code).toBe('UNOWNED_ASSET')
    expect(read(root, '.agent-notes/runtime/unknown.txt')).toBe('Keep me\n')
  })

  it('upgrades and rolls back the resource layout while preserving project documents and seals', () => {
    const root = setup()
    const previous = bundle()
    for (const path of ['README.md', 'writing.md', 'contracts/document.md'])
      previous.files.set(path, Buffer.from('# Previous resource\n'))
    expectOk(command(root, 'init', previous))
    note(root, metadata({ id: ids[1] }), 'active')
    archive(root, note(root))
    commit(root)
    const preserved = [...allFiles(root)].filter(([path]) => path.startsWith('.agents/notes/') || path === '.agent-notes/config.json')
    write(root, '.agent-notes/runtime/writing.md', '# Local edit of the old reference\n')
    write(root, '.agent-notes/runtime/unknown.txt', 'Project neighboring file\n')
    const next = bundle('0.2.0')
    next.files.set('assets/references/writing.md', Buffer.from('# Write inputs\n'))
    next.files.set('assets/formats/document.md', Buffer.from('# Document format\n'))
    const upgraded = command(root, 'upgrade', next)
    expectOk(upgraded)
    expect(read(root, `${upgraded.data.backup}/original/.agent-notes/runtime/writing.md`)).toBe('# Local edit of the old reference\n')
    for (const path of ['README.md', 'writing.md', 'contracts/document.md'])
      expect(existsSync(join(root, '.agent-notes/runtime', path))).toBe(false)
    expect(read(root, '.agent-notes/runtime/assets/references/writing.md')).toBe('# Write inputs\n')
    expectOk(command(root, 'upgrade', previous))
    expect(read(root, '.agent-notes/runtime/writing.md')).toBe('# Previous resource\n')
    expect(existsSync(join(root, '.agent-notes/runtime/assets/references/writing.md'))).toBe(false)
    expect(read(root, '.agent-notes/runtime/unknown.txt')).toBe('Project neighboring file\n')
    for (const [path, bytes] of preserved)
      expect(read(root, path)).toBe(bytes)
    expectOk(command(root, 'status'))
  })

  it.each(['../outside.md', 'README.md', '.agents/notes/implemented/architecture/2026-10-21-owned.md', '.agent-notes/config.json'])('rejects manifest ownership of %s', (path) => {
    const root = setup()
    expectOk(command(root))
    const state = manifest(root)
    state.assets.push({ path, kind: 'file', sha256: 'a'.repeat(64) })
    write(root, installPath, JSON.stringify(state))
    expect(command(root, 'upgrade').diagnostics[0].code).toBe('INVALID_INSTALLATION')
  })

  it('refuses unknown document contracts and a destination runtime that cannot read current Notes', () => {
    const root = setup()
    expectOk(command(root))
    const path = note(root)
    const valid = read(root, path)
    write(root, path, valid.replace('agent-note/1', 'agent-note/999'))
    const before = read(root, installPath)
    expect(command(root, 'upgrade', bundle('0.2.0')).diagnostics.map(item => item.code)).toContain('UNSUPPORTED_FORMAT')
    write(root, path, valid)
    const unsupported = bundle('0.2.0')
    unsupported.files.set('cli.mjs', Buffer.from('process.exit(2)\n'))
    expect(command(root, 'upgrade', unsupported).diagnostics[0].code).toBe('BUNDLE_SMOKE_FAILED')
    expect(read(root, installPath)).toBe(before)
  })

  it.each(['config', 'note', 'new-note', 'entry', 'runtime'])('preserves a concurrent %s edit and cancels upgrade', (kind) => {
    const root = setup()
    expectOk(command(root))
    const path = note(root)
    const manifestBefore = read(root, installPath)
    const result = command(root, 'upgrade', bundle('0.2.0'), {}, { beforeCommit() {
      if (kind === 'config')
        write(root, '.agent-notes/config.json', `${read(root, '.agent-notes/config.json')}\n`)
      if (kind === 'note')
        write(root, path, `${read(root, path)}\nIndependent edit\n`)
      if (kind === 'new-note')
        note(root, metadata({ id: ids[1] }), 'new-decision')
      if (kind === 'entry')
        write(root, 'AGENTS.md', `${read(root, 'AGENTS.md')}Independent rule\n`)
      if (kind === 'runtime')
        write(root, '.agent-notes/runtime/cli.mjs', '// external runtime edit\n')
    } })
    expect(result.diagnostics.map(item => item.code)).toContain('CONCURRENT_CHANGE')
    expect(read(root, installPath)).toBe(manifestBefore)
    if (kind === 'entry')
      expect(read(root, 'AGENTS.md')).toContain('Independent rule')
  })

  it('rolls back all installer files on a failed switch and keeps manifest last', () => {
    const root = setup()
    expectOk(command(root))
    const before = allFiles(root)
    const result = command(root, 'upgrade', bundle('0.2.0'), {}, { afterStep(index) {
      if (index === 0) {
        expect(read(root, installPath)).toBe(before.get(installPath))
        throw new Error('Disk failure')
      }
    } })
    expect(result.result).toBe('failed')
    expect(allFiles(root)).toEqual(before)
  })

  it('shares the lock with content writers', () => {
    const root = setup()
    expectOk(command(root))
    note(root, metadata({ status: 'proposed' }))
    commit(root)
    const result = command(root, 'upgrade', bundle('0.2.0'), {}, { beforeCommit() {
      const attempt = executeWrite(root, { command: 'transition', id: ids[0], input: '-', to: 'rejected', dryRun: false, recover: false }, '{}')
      expect(attempt.diagnostics[0].code).toBe('WRITE_BUSY')
      expect(command(root, 'upgrade').diagnostics[0].code).toBe('WRITE_BUSY')
    } })
    expectOk(result)
  })

  it('leaves original bytes untouched when the backup location is unusable', () => {
    const root = setup()
    expectOk(command(root))
    write(root, '.agents/skills/agent-note/SKILL.md', 'My customization\n')
    write(root, '.agent-notes/local/backups', 'Not a directory\n')
    const before = allFiles(root)
    expect(command(root, 'upgrade', bundle('0.2.0')).result).toBe('failed')
    expect(allFiles(root)).toEqual(before)
  })

  it.each(['init', 'upgrade'] as const)('recovers an actual SIGKILL during %s and retries', (operation) => {
    const root = setup(true)
    if (operation === 'upgrade')
      expectOk(command(root))
    const before = allFiles(root)
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, operation], { encoding: 'utf8' })
    expect(child.signal, child.stderr).toBe('SIGKILL')
    expect(recoverTransaction(root)).toBe(true)
    expect(allFiles(root)).toEqual(before)
    expectOk(command(root, operation, bundle('0.2.0'), { recover: true }))
  })

  it('retains an external edit and journal when interrupted upgrade recovery conflicts', () => {
    const root = setup()
    expectOk(command(root))
    const child = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./distribution-child.ts', import.meta.url)), root, 'upgrade'], { encoding: 'utf8' })
    expect(child.signal, child.stderr).toBe('SIGKILL')
    write(root, '.agent-notes/runtime/rules.md', 'Independent edit after interruption\n')
    expect(() => recoverTransaction(root)).toThrow(/File changed outside/)
    expect(read(root, '.agent-notes/runtime/rules.md')).toBe('Independent edit after interruption\n')
    expect(existsSync(join(root, '.agent-notes/local/write-lock/journal.json'))).toBe(true)
  })

  it('refuses malformed managed blocks instead of deleting user content', () => {
    const root = setup()
    expectOk(command(root))
    const entry = read(root, 'AGENTS.md').replace('<!-- agent-notes:end -->', '')
    write(root, 'AGENTS.md', entry)
    expect(command(root, 'upgrade').diagnostics[0].code).toBe('BLOCK_CONFLICT')
    expect(read(root, 'AGENTS.md')).toBe(entry)
    expect(() => block('<!-- agent-notes:end -->\n<!-- agent-notes:begin -->', 'AGENTS.md')).toThrow()
  })
})
