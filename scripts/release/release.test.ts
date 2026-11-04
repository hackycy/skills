import type { Override, Plan, Registration } from './model'
import type { Packument, PublishedVersion } from './npm'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execute, upload } from './execute'
import { checkPreviousRecords, dispatch, downloadEvidence, githubPreflight, noActiveRelease, recordRelease } from './github'
import { bump, compare, intent, loadGraph, section, source, tagFor, tarballName, upgrade } from './model'
import { createPlan, fixedPlan } from './plan'
import { checkTags, lock, prepare, synchronizedMain } from './prepare'
import { command, git } from './process'
import * as processes from './process'

const temporary: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true })
})

function temp(): string {
  const path = mkdtempSync(resolve(tmpdir(), 'release-test-'))
  temporary.push(path)
  return path
}

function write(root: string, path: string, value: string | object): void {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
}

function registered(id: string, role: Registration['role']): Registration {
  return { name: `@test/${id}`, path: `packages/${id}`, role, build: 'build', inlinedBuildDependencies: [] }
}

async function fixture(version = '0.1.0') {
  const root = temp()
  const registrations = [registered('a', 'cli'), registered('b', 'cli'), registered('core', 'runtime'), registered('mid', 'runtime'), registered('tool', 'build')]
  registrations[0].inlinedBuildDependencies = ['@test/tool']
  write(root, 'scripts/release/packages.json', registrations)
  write(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  write(root, 'package.json', { private: true, version: '0.0.0' })
  write(root, 'pnpm-lock.yaml', '# test lockfile\n')
  write(root, '.gitignore', 'node_modules\n.cache\n')
  const records = new Map<string, Packument>()
  for (const registration of registrations) {
    const dependencies = registration.name === '@test/a' ? { '@test/mid': 'workspace:*' } : ['@test/mid', '@test/b'].includes(registration.name) ? { '@test/core': 'workspace:*' } : {}
    write(root, `${registration.path}/package.json`, {
      name: registration.name,
      version,
      private: registration.role === 'build' ? true : undefined,
      scripts: { build: 'echo build' },
      dependencies,
      devDependencies: registration.name === '@test/a' ? { '@test/tool': 'workspace:*' } : {},
      repository: { url: 'git+https://github.com/test/repo.git', directory: registration.path },
      publishConfig: { access: 'public', registry: 'https://registry.npmjs.org', tag: 'latest' },
      bin: registration.role === 'cli' ? { cli: 'dist/main.mjs' } : undefined,
      files: ['dist'],
    })
    write(root, `${registration.path}/CHANGELOG.md`, `# Changelog\n\n## Unreleased\n\n- Human notes\n\n## ${version}\n\n- Previous\n`)
    write(root, `${registration.path}/src/index.ts`, 'export const value = 1\n')
    if (registration.role !== 'build') {
      const published: PublishedVersion = { name: registration.name, version, dependencies: Object.fromEntries(Object.keys(dependencies).map(name => [name, version])), dist: {} }
      records.set(registration.name, version === '0.0.0' ? { 'versions': {}, 'dist-tags': {} } : { 'versions': { [version]: published }, 'dist-tags': { latest: version } })
    }
  }
  await git(root, 'init', '--initial-branch=main')
  await git(root, 'config', 'user.name', 'Release Test')
  await git(root, 'config', 'user.email', 'release@example.com')
  await git(root, 'add', '.')
  await git(root, 'commit', '-m', 'feat: initial packages')
  for (const registration of registrations.filter(p => p.role !== 'build')) {
    if (version !== '0.0.0')
      await git(root, 'tag', tagFor(registration.name, version))
  }
  const remote = temp()
  await git(remote, 'init', '--bare', '--initial-branch=main')
  await git(root, 'remote', 'add', 'origin', remote)
  await git(root, 'push', '-u', 'origin', 'main', '--tags')
  const read = async (name: string) => structuredClone(records.get(name) ?? { 'versions': {}, 'dist-tags': {} })
  const graph = () => loadGraph(root, '@test/a')
  const plan = (version = '0.1.1', overrides: Record<string, Override> = {}) => createPlan(root, graph(), '@test/a', version, overrides, read)
  const change = async (path: string, message: string) => {
    write(root, path, `${readFileSync(resolve(root, path), 'utf8')}\n// changed\n`)
    await git(root, 'add', path)
    await git(root, 'commit', '-m', message)
  }
  return { root, registrations, records, read, graph, plan, change, remote }
}

function editManifest(root: string, id: string, edit: (value: Record<string, unknown>) => void): void {
  const path = `packages/${id}/package.json`
  const value = JSON.parse(source(root, path)) as Record<string, unknown>
  edit(value)
  write(root, path, value)
}

describe('版本与依赖边界', () => {
  it('只接受稳定、递增版本，按 0.x 和稳定版解释意图', () => {
    expect(compare('1.10.0', '1.9.9')).toBe(1)
    expect(() => compare('01.0.0', '1.0.0')).toThrow()
    expect(() => upgrade('0.0.0', '1.0.0')).toThrow('0.1.0')
    expect(() => upgrade('0.1.0', '0.1.1', 2)).toThrow('0.2.0')
    expect(intent('feat!: break API', '0.1.0')).toBe(2)
    expect(intent('feat: API', '0.1.0')).toBe(1)
    expect(intent('feat: API', '1.1.0')).toBe(2)
    expect(intent('fix: API\n\nBREAKING CHANGE: removed', '1.1.0')).toBe(3)
    expect(intent('refactor: internals', '1.0.0')).toBeUndefined()
    expect(bump('1.2.3', 3)).toBe('2.0.0')
    expect(() => section('## Unreleased\n<!-- placeholder -->\n-\n', 'Unreleased')).toThrow('不能为空')
  })

  it('首发只扩展依赖方向，private 与其他 CLI 不上传', async () => {
    const f = await fixture('0.0.0')
    const before = source(f.root, 'packages/b/package.json')
    const plan = await f.plan('0.1.0')
    expect(plan.targets.map(t => [t.name, t.version])).toEqual([['@test/core', '0.1.0'], ['@test/mid', '0.1.0'], ['@test/a', '0.1.0']])
    expect(plan.build).toEqual(['@test/core', '@test/mid', '@test/tool', '@test/a'])
    expect(source(f.root, 'packages/b/package.json')).toBe(before)
    expect(await git(f.root, 'status', '--porcelain')).toBe('')
  })

  it('共享运行时变更按图联动；未变化的依赖复用', async () => {
    const f = await fixture()
    expect((await f.plan()).reuse.map(t => t.name)).toEqual(['@test/core', '@test/mid'])
    await f.change('packages/core/src/index.ts', 'feat: core support')
    const plan = await f.plan()
    expect(plan.targets.map(t => t.version)).toEqual(['0.1.1', '0.1.1', '0.1.1'])
    expect(plan.targets[1].notes).toContain('@test/core → 0.1.1')
    expect(JSON.parse(source(f.root, 'packages/b/package.json')).version).toBe('0.1.0')
  })

  it('最高意图只升一次；private 内联破坏性变更要求 CLI minor', async () => {
    const f = await fixture()
    await f.change('packages/tool/src/index.ts', 'feat!: change bundled API')
    await f.change('packages/tool/src/index.ts', 'fix: bundled bug')
    await expect(f.plan()).rejects.toThrow('0.2.0')
    const plan = await f.plan('0.2.0')
    expect(plan.targets.map(t => t.name)).toEqual(['@test/a'])
    expect(plan.reuse).toHaveLength(2)
    // Removing the explicit inline edge stops propagation from an ordinary tool.
    f.registrations[0].inlinedBuildDependencies = []
    write(f.root, 'scripts/release/packages.json', f.registrations)
    expect((await f.plan()).targets[0].version).toBe('0.1.1')
  })

  it.each(['workspace:^', 'workspace:~'])('拒绝范围 workspace 声明 %s', async (specifier) => {
    const f = await fixture()
    editManifest(f.root, 'a', value => value.dependencies = { '@test/mid': specifier })
    expect(f.graph).toThrow('workspace:*')
  })

  it('devDependency 参与构建但不授予发布资格', async () => {
    const f = await fixture()
    editManifest(f.root, 'a', value => value.devDependencies = { '@test/tool': 'workspace:*', '@test/b': 'workspace:*' })
    expect(f.graph().buildOrder.map(p => p.name)).toContain('@test/b')
    expect(f.graph().publishOrder.map(p => p.name)).not.toContain('@test/b')
  })

  it('实际 pnpm tarball 将 workspace:* 转为精确版本，源码声明保持原样', async () => {
    const f = await fixture()
    editManifest(f.root, 'mid', value => value.version = '0.3.0')
    const file = resolve(temp(), 'a.tgz')
    await command(f.root, 'pnpm', ['--dir', 'packages/a', '--config.ignore-scripts=true', 'pack', '--out', file])
    const packed = JSON.parse(await command(f.root, 'tar', ['-xOf', file, 'package/package.json'])) as PublishedVersion
    expect(packed.dependencies?.['@test/mid']).toBe('0.3.0')
    expect(JSON.parse(source(f.root, 'packages/a/package.json')).dependencies['@test/mid']).toBe('workspace:*')
  })

  it.each(['private', 'peer', 'cycle', 'unregistered'])('在改文件前拒绝非法依赖图：%s', async (problem) => {
    const f = await fixture()
    if (problem === 'private')
      editManifest(f.root, 'a', value => value.dependencies = { '@test/tool': 'workspace:*' })
    if (problem === 'peer')
      editManifest(f.root, 'a', value => value.peerDependencies = { '@test/core': 'workspace:*' })
    if (problem === 'cycle')
      editManifest(f.root, 'core', value => value.dependencies = { '@test/a': 'workspace:*' })
    if (problem === 'unregistered')
      write(f.root, 'scripts/release/packages.json', f.registrations.filter(p => p.name !== '@test/core'))
    const before = source(f.root, 'packages/a/package.json')
    expect(f.graph).toThrow()
    expect(source(f.root, 'packages/a/package.json')).toBe(before)
  })

  it('缺少意图、共享配置和未知基线要求覆盖，覆盖仍遵守最低升级', async () => {
    const f = await fixture()
    await f.change('packages/core/src/index.ts', 'refactor: core')
    await expect(f.plan()).rejects.toThrow('--override')
    const overrides = { '@test/core': { version: '0.1.1', notes: '- Explicitly reviewed refactor.' } }
    expect((await f.plan('0.1.1', overrides)).targets[0].notes).toContain('Explicitly reviewed')
    write(f.root, 'tsconfig.json', '{}\n')
    await git(f.root, 'add', 'tsconfig.json')
    await git(f.root, 'commit', '-m', 'feat!: shared config')
    await expect(f.plan('0.1.1', overrides)).rejects.toThrow('0.2.0')
    await git(f.root, 'tag', '-d', '@test/core@0.1.0')
    await expect(f.plan()).rejects.toThrow('源码基线')
  })

  it('准备但未上传的版本不作为已发布基线，也不继续升版', async () => {
    const f = await fixture()
    editManifest(f.root, 'core', value => value.version = '0.1.1')
    await git(f.root, 'add', '.')
    await git(f.root, 'commit', '-m', 'chore(release): interrupted')
    await git(f.root, 'tag', '@test/core@0.1.1')
    await expect(f.plan()).rejects.toThrow('尚未完成目标')
  })
})

describe('git 定版与固定目标', () => {
  it('修复失败目标后，只能用显式覆盖发更高版本，保留旧 tag', async () => {
    const f = await fixture()
    editManifest(f.root, 'core', value => value.version = '0.2.0')
    await git(f.root, 'add', '.')
    await git(f.root, 'commit', '-m', 'chore(release): failed core')
    await git(f.root, 'tag', '@test/core@0.2.0')
    const original = await git(f.root, 'rev-parse', 'refs/tags/@test/core@0.2.0')
    await f.change('packages/core/src/index.ts', 'fix: repair failed artifact')
    await expect(f.plan()).rejects.toThrow('尚未完成目标')
    const plan = await f.plan('0.1.1', { '@test/core': { version: '0.2.1', notes: '- Supersede failed 0.2.0.' } })
    expect(plan.targets[0].version).toBe('0.2.1')
    expect(await git(f.root, 'rev-parse', 'refs/tags/@test/core@0.2.0')).toBe(original)
  })
  async function fakePnpm() {
    const bin = temp()
    const log = resolve(bin, 'commands.log')
    write(bin, 'pnpm', '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RELEASE_TEST_LOG"\nif [ "$RELEASE_TEST_FAIL_LINT" = "1" ] && [ "$1" = "lint" ]; then exit 1; fi\n')
    await command(bin, 'chmod', ['+x', 'pnpm'])
    vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
    vi.stubEnv('RELEASE_TEST_LOG', log)
    return log
  }

  it('一个版本 commit、多个同源 tag、atomic push；其他 CLI 字节不变', async () => {
    const f = await fixture('0.0.0')
    // A first release changelog must not already contain the target heading.
    const plan = await f.plan('0.1.0')
    const before = source(f.root, 'packages/b/package.json')
    const rootBefore = source(f.root, 'package.json')
    const log = await fakePnpm()
    const commit = await prepare(f.root, f.graph(), plan)
    expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual(['install --lockfile-only --ignore-scripts', 'lint', 'exec tsc --noEmit'])
    expect(source(f.root, 'packages/b/package.json')).toBe(before)
    expect(source(f.root, 'package.json')).toBe(rootBefore)
    expect(JSON.parse(source(f.root, 'packages/a/package.json')).dependencies['@test/mid']).toBe('workspace:*')
    for (const target of plan.targets)
      expect(await git(f.root, 'rev-parse', `refs/tags/${tagFor(target.name, target.version)}`)).toBe(commit)
    expect((await git(f.root, 'ls-remote', 'origin', 'refs/heads/main')).split(/\s+/)[0]).toBe(commit)
    const rebuilt = await fixedPlan(f.root, loadGraph(f.root, '@test/a', commit), plan.tag, commit)
    expect(rebuilt.targets).toEqual(plan.targets)
    expect(source(f.root, 'packages/a/CHANGELOG.md')).toContain('## Unreleased\n\n## 0.1.0')
    expect(await git(f.root, 'status', '--porcelain')).toBe('')
  })

  it('门禁失败保留版本改动，不 commit、tag 或 push', async () => {
    const f = await fixture('0.0.0')
    const head = await git(f.root, 'rev-parse', 'HEAD')
    const plan = await f.plan('0.1.0')
    await fakePnpm()
    vi.stubEnv('RELEASE_TEST_FAIL_LINT', '1')
    await expect(prepare(f.root, f.graph(), plan)).rejects.toThrow('pnpm lint')
    expect(await git(f.root, 'rev-parse', 'HEAD')).toBe(head)
    expect(JSON.parse(source(f.root, 'packages/a/package.json')).version).toBe('0.1.0')
    expect(await git(f.root, 'tag', '--list', '@test/a@0.1.0')).toBe('')
  })

  it('工作树、远程分支、tag 冲突与本地锁阻止并发覆盖', async () => {
    const f = await fixture('0.0.0')
    const plan = await f.plan('0.1.0')
    write(f.root, 'untracked.txt', 'work')
    await expect(synchronizedMain(f.root)).rejects.toThrow('干净工作树')
    rmSync(resolve(f.root, 'untracked.txt'))
    await f.change('packages/a/src/index.ts', 'fix: local ahead')
    await expect(synchronizedMain(f.root)).rejects.toThrow('不同步')
    await git(f.root, 'tag', plan.tag)
    await expect(checkTags(f.root, plan)).rejects.toThrow('已有')
    const release = await lock(f.root)
    await expect(lock(f.root)).rejects.toThrow('发布锁')
    await release()
    await (await lock(f.root))()
  })

  it('已有 tag 的计划包含已上传目标与完整复用闭包，拒绝其他 CLI 升版', async () => {
    const f = await fixture()
    const plan = await f.plan()
    await fakePnpm()
    const commit = await prepare(f.root, f.graph(), plan)
    const graph = loadGraph(f.root, '@test/a', commit)
    const rebuilt = await fixedPlan(f.root, graph, plan.tag, commit)
    expect(rebuilt.targets.map(t => t.name)).toEqual(['@test/a'])
    expect(rebuilt.reuse.map(t => t.name)).toEqual(['@test/core', '@test/mid'])
    editManifest(f.root, 'b', value => value.version = '0.1.1')
    await git(f.root, 'add', '.')
    await git(f.root, 'commit', '--amend', '--no-edit')
    // A distinct fixture tag, never a production identity.
    await git(f.root, 'tag', '-d', plan.tag)
    await git(f.root, 'tag', plan.tag)
    const amended = await git(f.root, 'rev-parse', 'HEAD')
    await expect(fixedPlan(f.root, loadGraph(f.root, '@test/a', amended), plan.tag, amended)).rejects.toThrow('计划外包')
  })
})

describe('npm 部分成功与证据边界', () => {
  async function uploading() {
    const f = await fixture('0.0.0')
    const plan = await f.plan('0.1.0')
    const graph = f.graph()
    const artifacts = new Map<string, string>()
    for (const target of plan.targets) {
      graph.packages.get(target.name)!.manifest.version = target.version
      const file = resolve(temp(), tarballName(target.name, target.version))
      writeFileSync(file, `original bytes ${target.name}`)
      artifacts.set(target.name, file)
    }
    const published = (name: string): PublishedVersion => {
      const pkg = graph.packages.get(name)!
      return {
        name,
        version: pkg.manifest.version,
        dependencies: Object.fromEntries(Object.keys(pkg.manifest.dependencies ?? {}).map(name => [name, graph.packages.get(name)!.manifest.version])),
        dist: { integrity: `sha512-${createHash('sha512').update(readFileSync(artifacts.get(name)!)).digest('base64')}` },
      }
    }
    const uploads: string[] = []
    const records: string[] = []
    const latest: string[] = []
    const ports = {
      read: f.read,
      wait: async (name: string) => f.read(name),
      publish: async (file: string) => {
        const name = [...artifacts].find(([, path]) => path === file)![0]
        uploads.push(name)
        f.records.set(name, { 'versions': { '0.1.0': published(name) }, 'dist-tags': { latest: '0.1.0' } })
      },
      latest: async (name: string, version: string) => {
        latest.push(`${name}@${version}`)
        f.records.get(name)!['dist-tags'].latest = version
      },
      record: async (target: Plan['targets'][number]) => { records.push(target.name) },
      beforePublish: async () => {},
    }
    return { ...f, plan, graph, artifacts, ports, published, uploads, releases: records, latest }
  }

  it('依赖先上传并可查询，超时后核对已存在版本，不重传成功依赖', async () => {
    const f = await uploading()
    const publish = f.ports.publish
    f.ports.publish = async (file) => {
      if (file === f.artifacts.get('@test/a'))
        throw new Error('CLI registry unavailable')
      await publish(file)
      throw new Error('network timeout after successful upload')
    }
    await expect(upload(f.graph, f.plan, f.artifacts, f.ports, () => {})).rejects.toThrow('CLI registry unavailable')
    expect(f.uploads).toEqual(['@test/core', '@test/mid'])
    expect(f.releases).toEqual(['@test/core', '@test/mid'])
    f.ports.publish = publish
    await upload(f.graph, f.plan, f.artifacts, f.ports, () => {})
    expect(f.uploads).toEqual(['@test/core', '@test/mid', '@test/a'])
  })

  it('npm 成功但 Release 失败后只补记录，latest 更高时不回退', async () => {
    const f = await uploading()
    f.ports.record = async () => {
      throw new Error('GitHub unavailable')
    }
    await expect(upload(f.graph, f.plan, f.artifacts, f.ports, () => {})).rejects.toThrow('GitHub unavailable')
    f.records.get('@test/core')!['dist-tags'].latest = '0.2.0'
    f.ports.record = async (target) => {
      f.releases.push(target.name)
    }
    await upload(f.graph, f.plan, f.artifacts, f.ports, () => {})
    expect(f.uploads.filter(name => name === '@test/core')).toHaveLength(1)
    expect(f.latest).toEqual([])
    expect(f.records.get('@test/core')!['dist-tags'].latest).toBe('0.2.0')
  })

  it('只在原 tarball 匹配时修复缺失 latest；内容不同或产物丢失立即停止', async () => {
    const f = await uploading()
    f.records.set('@test/core', { 'versions': { '0.1.0': f.published('@test/core') }, 'dist-tags': {} })
    await upload(f.graph, f.plan, f.artifacts, f.ports, () => {})
    expect(f.latest).toEqual(['@test/core@0.1.0'])
    expect(f.uploads).not.toContain('@test/core')
    writeFileSync(f.artifacts.get('@test/core')!, 'rebuilt different bytes')
    await expect(upload(f.graph, f.plan, f.artifacts, f.ports, () => {})).rejects.toThrow('不匹配')
    rmSync(f.artifacts.get('@test/core')!)
    await expect(upload(f.graph, f.plan, f.artifacts, f.ports, () => {})).rejects.toThrow('缺少原 tarball')
  })

  it('上传前 latest 已前进则阻止过期计划；未锁精确依赖则不记录成功', async () => {
    const f = await uploading()
    f.records.set('@test/core', { 'versions': {}, 'dist-tags': { latest: '0.2.0' } })
    await expect(upload(f.graph, f.plan, f.artifacts, f.ports, () => {})).rejects.toThrow('不会回退')
    expect(f.uploads).toEqual([])
    const bad = f.published('@test/mid')
    bad.dependencies = { '@test/core': '^0.1.0' }
    f.records.set('@test/core', { 'versions': { '0.1.0': f.published('@test/core') }, 'dist-tags': { latest: '0.1.0' } })
    f.records.set('@test/mid', { 'versions': { '0.1.0': bad }, 'dist-tags': { latest: '0.1.0' } })
    await expect(upload(f.graph, f.plan, f.artifacts, f.ports, () => {})).rejects.toThrow('未精确锁定')
    expect(f.releases).not.toContain('@test/mid')
  })
})

describe('gitHub 响应与交付记录', () => {
  async function fakeGithub(initial: Record<string, unknown> = {}) {
    const bin = temp()
    const stateFile = resolve(bin, 'state.json')
    write(bin, 'state.json', { calls: [], ...initial })
    write(bin, 'gh', `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const file = process.env.RELEASE_TEST_GITHUB
const state = JSON.parse(fs.readFileSync(file, 'utf8'))
const args = process.argv.slice(2)
state.calls.push(args)
const option = key => args[args.indexOf(key) + 1]
let output = ''
let error = ''
if (args[0] === 'repo') output = JSON.stringify({ isPrivate: false, viewerPermission: 'WRITE', defaultBranchRef: { name: 'main' } })
if (args[0] === 'api') {
  const endpoint = args.find(a => a.startsWith('repos/'))
  if (endpoint.includes('/runs?')) output = state.active || ''
  else {
    const release = state.releases ? state.releases[decodeURIComponent(endpoint.split('/tags/')[1])] : state.release
    if (release) output = 'HTTP/2.0 200 OK\\n\\n' + JSON.stringify(release)
    else error = 'HTTP 404 Not Found'
  }
}
if (args[0] === 'workflow') state.dispatched = true
if (args[0] === 'run' && args[1] === 'list') output = JSON.stringify(state.dispatched ? [{ databaseId: 42, status: 'queued', displayTitle: state.title, url: 'https://github.com/test/repo/actions/runs/42' }] : [])
if (args[0] === 'run' && args[1] === 'watch' && state.watchFails) error = 'workflow failed'
if (args[0] === 'run' && args[1] === 'view') output = JSON.stringify(state.result)
if (args[0] === 'release' && args[1] === 'create') {
  state.release = { body: fs.readFileSync(option('--notes-file'), 'utf8'), assets: [], draft: false }
  state.releases ||= {}
  state.releases[args[2]] = state.release
}
if (args[0] === 'release' && args[1] === 'upload') {
  const name = path.basename(args[3])
  state.release = state.releases[args[2]]
  state.release.assets.push({ name })
  state.bytes ||= {}
  state.bytes[name] = fs.readFileSync(args[3]).toString('base64')
}
if (args[0] === 'release' && args[1] === 'download') fs.writeFileSync(option('--output'), Buffer.from(state.bytes[option('--pattern')], 'base64'))
fs.writeFileSync(file, JSON.stringify(state))
if (error) { process.stderr.write(error); process.exit(1) }
process.stdout.write(output)
`)
    await command(bin, 'chmod', ['+x', 'gh'])
    vi.stubEnv('PATH', `${bin}:${process.env.PATH}`)
    vi.stubEnv('RELEASE_TEST_GITHUB', stateFile)
    return () => JSON.parse(readFileSync(stateFile, 'utf8')) as { calls: string[][], release: { assets: { name: string }[] } }
  }

  it('创建正文、原包和校验值；再次处理只核对或补缺失附件', async () => {
    const f = await fixture('0.0.0')
    const state = await fakeGithub()
    const target = (await f.plan('0.1.0')).targets[0]
    const file = resolve(temp(), tarballName(target.name, target.version))
    writeFileSync(file, 'original bytes')
    await recordRelease(f.root, 'test/repo', target, 'fixed-commit', file)
    await recordRelease(f.root, 'test/repo', target, 'fixed-commit', file)
    expect(state().calls.filter(args => args[0] === 'release' && args[1] === 'create')).toHaveLength(1)
    expect(state().calls.filter(args => args[0] === 'release' && args[1] === 'upload')).toHaveLength(2)
    expect(state().release.assets.map(a => a.name)).toEqual([tarballName(target.name, target.version), `${tarballName(target.name, target.version)}.sha256`])
    const recovered = resolve(temp(), tarballName(target.name, target.version))
    await downloadEvidence(f.root, 'test/repo', tagFor(target.name, target.version), recovered)
    expect(readFileSync(recovered).equals(readFileSync(file))).toBe(true)
    writeFileSync(file, 'different rebuild')
    await expect(recordRelease(f.root, 'test/repo', target, 'fixed-commit', file)).rejects.toThrow('附件与原产物不符')
  })

  it('没有原附件就拒绝恢复；本地发布遵守整个仓库队列', async () => {
    const f = await fixture()
    await fakeGithub()
    await expect(checkPreviousRecords(f.root, 'test/repo', f.graph(), f.read)).rejects.toThrow('记录未完成')
    await expect(downloadEvidence(f.root, 'test/repo', '@test/a@0.1.0', resolve(temp(), 'missing.tgz'))).rejects.toThrow('不会重新打包')
    await fakeGithub({ active: 'https://github.com/test/repo/actions/runs/7' })
    await expect(noActiveRelease(f.root, 'test/repo')).rejects.toThrow('队列清空')
    await git(f.root, 'remote', 'set-url', 'origin', 'https://github.com/test/repo.git')
    expect(await githubPreflight(f.root, f.graph(), false)).toBe('test/repo')
  })

  it.each([true, false])('完整执行在 tag 的隔离源码上做两项门禁，上传所打的原包，local=%s', async (local) => {
    const f = await fixture('0.0.0')
    const plan = await f.plan('0.1.0')
    for (const target of plan.targets) {
      const pkg = f.graph().packages.get(target.name)!
      editManifest(f.root, pkg.path.split('/').at(-1)!, value => value.version = target.version)
      write(f.root, `${pkg.path}/CHANGELOG.md`, `# Changelog\n\n## Unreleased\n\n## ${target.version}\n\n${target.notes}\n`)
    }
    await git(f.root, 'add', '.')
    await git(f.root, 'commit', '-m', `chore(release): ${plan.tag}`)
    const commit = await git(f.root, 'rev-parse', 'HEAD')
    for (const target of plan.targets)
      await git(f.root, 'tag', tagFor(target.name, target.version))
    await git(f.root, 'push', 'origin', 'main', '--tags')
    editManifest(f.root, 'a', value => value.version = '9.9.9')
    await fakeGithub()
    if (!local) {
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://example.test/oidc')
      vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'test-only')
      vi.stubEnv('GITHUB_SHA', 'a-different-main-commit')
      vi.stubEnv('GITHUB_REF', 'refs/heads/main')
      vi.stubEnv('NODE_AUTH_TOKEN', '')
      vi.stubEnv('NPM_TOKEN', '')
    }
    const originalGit = processes.git
    vi.spyOn(processes, 'git').mockImplementation(async (root, ...args) => args.join(' ') === 'remote get-url origin' ? 'https://github.com/test/repo.git' : originalGit(root, ...args))
    vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(await f.read(decodeURIComponent(url.split('/').at(-1)!)))))
    const originalCommand = processes.command
    const calls: { cwd: string, args: string[] }[] = []
    const npmCalls: string[][] = []
    const packed = new Map<string, Uint8Array>()
    vi.spyOn(processes, 'command').mockImplementation(async (cwd, file, args, live, env) => {
      if (file === 'pnpm') {
        calls.push({ cwd, args })
        expect(cwd).not.toBe(f.root)
        expect(await originalGit(cwd, 'rev-parse', 'HEAD')).toBe(commit)
        expect(JSON.parse(source(cwd, 'packages/a/package.json')).version).toBe('0.1.0')
        if (args.includes('pack')) {
          expect(args).toContain('--config.ignore-scripts=true')
          const pkg = JSON.parse(source(cwd, `${args[1]}/package.json`)) as PublishedVersion
          pkg.dependencies = Object.fromEntries(Object.keys(pkg.dependencies ?? {}).map(name => [name, '0.1.0']))
          const output = args.at(-1)!
          writeFileSync(output, JSON.stringify(pkg))
          packed.set(output, readFileSync(output))
        }
        return ''
      }
      if (file === 'npm') {
        npmCalls.push(args)
        if (args[0] === '--version')
          return '12.2.1'
        if (args[0] === 'publish') {
          expect(args.includes('--provenance')).toBe(!local)
          if (!local)
            expect(env).toEqual({ GITHUB_SHA: commit, GITHUB_REF: `refs/tags/${plan.tag}` })
          expect(readFileSync(args[1]).equals(packed.get(args[1])!)).toBe(true)
          const pkg = JSON.parse(readFileSync(args[1], 'utf8')) as PublishedVersion
          pkg.dist = { integrity: `sha512-${createHash('sha512').update(readFileSync(args[1])).digest('base64')}` }
          f.records.set(pkg.name, { 'versions': { [pkg.version]: pkg }, 'dist-tags': { latest: pkg.version } })
        }
        return ''
      }
      return originalCommand(cwd, file, args, live, env)
    })
    const artifacts = temp()
    await execute(f.root, plan.tag, local, artifacts)
    expect(calls.slice(0, 3).map(c => c.args)).toEqual([['install', '--frozen-lockfile'], ['lint'], ['exec', 'tsc', '--noEmit']])
    expect(calls.filter(c => c.args.includes('build'))).toHaveLength(4)
    expect(calls.filter(c => c.args.includes('pack'))).toHaveLength(3)
    expect(npmCalls.some(args => args[0] === 'whoami')).toBe(local)
    expect(JSON.parse(readFileSync(resolve(artifacts, 'result.json'), 'utf8')).completed).toEqual(plan.targets.map(t => tagFor(t.name, t.version)))
    expect(JSON.parse(source(f.root, 'packages/a/package.json')).version).toBe('9.9.9')
  })

  it.each([true, false])('dispatch 后跟踪最终结果与 npm 状态，success=%s', async (success) => {
    const f = await fixture()
    const plan = await f.plan()
    await fakeGithub({
      title: `Release ${plan.tag}`,
      watchFails: !success,
      result: { status: 'completed', conclusion: success ? 'success' : 'failure', jobs: [{ name: 'release', steps: [{ name: 'publish stage', conclusion: success ? 'success' : 'failure' }] }] },
    })
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(success
      ? { 'versions': { '0.1.1': {} }, 'dist-tags': { latest: '0.1.1' } }
      : { 'versions': {}, 'dist-tags': {} })))
    if (success)
      await expect(dispatch(f.root, 'test/repo', plan)).resolves.toBeUndefined()
    else
      await expect(dispatch(f.root, 'test/repo', plan)).rejects.toThrow('release / publish stage')
  })
})
