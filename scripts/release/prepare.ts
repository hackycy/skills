import type { Graph, Plan } from './model'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { versionBump } from 'bumpp'
import { tagFor } from './model'
import { command, existsRef, git } from './process'

export async function lock(root: string): Promise<() => Promise<void>> {
  const common = await git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  const path = resolve(common, 'release.lock')
  try {
    await mkdir(path)
  }
  catch { throw new Error(`发布锁已存在：${path}；核对其中 owner.json 的进程后再人工清理`) }
  await writeFile(resolve(path, 'owner.json'), JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString() }, null, 2))
  return () => rm(path, { recursive: true })
}

export async function synchronizedMain(root: string): Promise<void> {
  if (await git(root, 'status', '--porcelain'))
    throw new Error('准备新版本需要干净工作树（包括未跟踪文件）')
  if (await git(root, 'branch', '--show-current') !== 'main')
    throw new Error('准备新版本必须位于 main')
  const remote = await git(root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/main')
  if (remote.split(/\s+/)[0] !== await git(root, 'rev-parse', 'HEAD'))
    throw new Error('main 与远程不同步；先同步，不会自动 merge、reset 或 force push')
}

export async function checkTags(root: string, plan: Plan): Promise<void> {
  for (const target of plan.targets) {
    const tag = tagFor(target.name, target.version)
    if (await existsRef(root, `refs/tags/${tag}`) || await git(root, 'ls-remote', 'origin', `refs/tags/${tag}`))
      throw new Error(`已有本地或远程 tag ${tag}；使用 --tag，不移动 tag`)
  }
}

export async function gates(root: string): Promise<void> {
  await command(root, 'pnpm', ['lint'], true)
  await command(root, 'pnpm', ['exec', 'tsc', '--noEmit'], true)
}

export async function prepare(root: string, graph: Graph, plan: Plan): Promise<string> {
  await synchronizedMain(root)
  await checkTags(root, plan)
  const start = await git(root, 'rev-parse', 'HEAD')
  const files = new Set(['pnpm-lock.yaml'])
  for (const target of plan.targets) {
    const pkg = graph.packages.get(target.name)!
    const manifest = `${pkg.path}/package.json`
    await versionBump({
      cwd: root,
      files: [manifest],
      release: target.version,
      currentVersion: target.previous,
      commit: false,
      tag: false,
      push: false,
      install: false,
      all: false,
      recursive: false,
      ignoreScripts: true,
      execute: undefined,
      confirm: false,
      interface: false,
    })
    const changelog = `${pkg.path}/CHANGELOG.md`
    let text: string
    try {
      text = readFileSync(resolve(root, changelog), 'utf8')
    }
    catch { text = '# Changelog\n\n## Unreleased\n' }
    if (new RegExp(`^## ${target.version.replaceAll('.', '\\.')}\\b`, 'm').test(text))
      throw new Error(`CHANGELOG 已有目标版本：${changelog}`)
    if (pkg.role === 'cli') {
      text = text.replace(/^## Unreleased\s*$/m, `## Unreleased\n\n## ${target.version}`)
    }
    else {
      if (!/^## Unreleased\s*$/m.test(text))
        throw new Error(`内部包 CHANGELOG 缺少 ## Unreleased：${changelog}`)
      const start = text.search(/^## Unreleased\s*$/m)
      const after = text.slice(start).replace(/^## Unreleased\s*/, '')
      const next = after.search(/^## /m)
      text = `${text.slice(0, start)}## Unreleased\n\n## ${target.version}\n\n${target.notes}\n\n${next < 0 ? '' : after.slice(next)}`
    }
    writeFileSync(resolve(root, changelog), text)
    files.add(manifest)
    files.add(changelog)
  }
  // workspace:* is retained in source; pnpm pack resolves it to the exact new
  // manifest version. Re-resolve the lockfile without running lifecycle scripts.
  await command(root, 'pnpm', ['install', '--lockfile-only', '--ignore-scripts'], true)
  await gates(root)
  if (await git(root, 'rev-parse', 'HEAD') !== start)
    throw new Error('定版期间 HEAD 已变化；保留改动，停止提交')
  const changed = (await git(root, 'status', '--porcelain', '--untracked-files=all')).split('\n').filter(Boolean)
  if (changed.some(line => !files.has(line.slice(3))))
    throw new Error('定版期间出现计划外改动；保留现场，停止提交')
  // Recheck the remote before creating immutable local identities.
  const remote = await git(root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/main')
  if (remote.split(/\s+/)[0] !== start)
    throw new Error('远程 main 在定版期间前进；保留改动，先人工同步')
  await checkTags(root, plan)
  await git(root, 'add', '--', ...files)
  // Release gates are exactly lint + tsc. The repository's development hook
  // runs an install and eslint --fix; do not let it mutate the fixed release.
  await command(root, 'git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', `chore(release): ${plan.tag}`], true)
  const commit = await git(root, 'rev-parse', 'HEAD')
  for (const target of plan.targets)
    await git(root, 'tag', tagFor(target.name, target.version), commit)
  await command(root, 'git', ['push', '--atomic', 'origin', 'HEAD:refs/heads/main', ...plan.targets.map(t => `refs/tags/${tagFor(t.name, t.version)}:refs/tags/${tagFor(t.name, t.version)}`)], true)
  return commit
}
