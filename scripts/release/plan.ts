import type { Graph, Level, Manifest, Override, Package, Plan, Target } from './model'
import type { Packument, ReadRegistry } from './npm'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bump, compare, intent, section, source, stable, tagFor, upgrade } from './model'
import { newerThanLatest, verifyPublished } from './npm'
import { ancestor, existsRef, git } from './process'

export class PlanningInputError extends Error {
  constructor(
    readonly kind: 'override' | 'version',
    readonly packageName: string,
    message: string,
    readonly minimumVersion?: string,
  ) {
    super(message)
  }
}

export async function manifestAt(root: string, ref: string, path: string): Promise<Manifest | undefined> {
  const exists = await git(root, 'ls-tree', ref, '--', `${path}/package.json`)
  if (!exists)
    return undefined
  return JSON.parse(await git(root, 'show', `${ref}:${path}/package.json`)) as Manifest
}

async function baseline(root: string, pkg: Package, data: Packument): Promise<string | undefined> {
  const versions = Object.keys(data.versions).filter((version) => {
    try {
      stable(version)
      return true
    }
    catch { return false }
  }).sort((a, b) => compare(b, a))
  if (!versions.length)
    return undefined
  const tag = tagFor(pkg.name, versions[0])
  const commit = await existsRef(root, `refs/tags/${tag}`)
  if (!commit || !await ancestor(root, commit, 'HEAD') || (await manifestAt(root, commit, pkg.path))?.version !== versions[0])
    throw new PlanningInputError('override', pkg.name, `${pkg.name} 的已发布版本 ${versions[0]} 缺少可核对源码基线；需要 --override 与说明${!commit ? '；缺少本地 tag，请先运行 git fetch origin main --tags 同步标签' : ''}`)
  return commit
}

function inlinedPaths(graph: Graph, pkg: Package): string[] {
  return pkg.inlinedBuildDependencies.flatMap((name) => {
    const child = graph.packages.get(name)!
    return [child.path, ...inlinedPaths(graph, child)]
  })
}

async function changes(root: string, graph: Graph, pkg: Package, base: string, includeOwn: boolean): Promise<{ level: Level, notes: string[], ambiguous: string[] }> {
  const paths = [...(includeOwn ? [pkg.path] : []), ...inlinedPaths(graph, pkg)]
  if (!paths.length)
    return { level: 0, notes: [], ambiguous: [] }
  const commits = (await git(root, 'rev-list', '--reverse', `${base}..HEAD`)).split('\n').filter(Boolean)
  let level: Level = 0
  const notes: string[] = []
  const ambiguous: string[] = []
  for (const commit of commits) {
    const files = (await git(root, 'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-m', commit)).split('\n').filter(Boolean)
    // Repository documentation and other packages have explicit ownership. Shared
    // configuration and release tooling have no automatic semantic classification.
    const shared = files.filter(path => ![...graph.workspace.values()].some(p => path.startsWith(`${p.path}/`))
      && !/^(?:docs\/|skills\/|prompts\/|README\.md$|LICENSE$|AGENTS\.md$|CLAUDE\.md$)/.test(path))
    const touched = files.some(path => paths.some(p => path.startsWith(`${p}/`)))
    if (!touched && !shared.length)
      continue
    const message = await git(root, 'show', '-s', '--format=%B', commit)
    const heading = message.split('\n')[0]
    const versionOnly = /^chore\(release\): /.test(heading)
      && files.every(path => path === 'pnpm-lock.yaml' || [...graph.workspace.values()].some(p => path === `${p.path}/package.json` || path === `${p.path}/CHANGELOG.md`))
    if (versionOnly)
      continue
    const change = intent(message, pkg.manifest.version)
    if (change !== undefined)
      level = Math.max(level, change) as Level
    if (shared.length || change === undefined) {
      ambiguous.push(`${commit.slice(0, 8)} ${heading}${shared.length ? `（共享路径：${shared.join(', ')}）` : ''}`)
      continue
    }
    notes.push(`- ${heading} (${commit.slice(0, 8)})`)
  }
  return { level, notes, ambiguous }
}

export async function createPlan(root: string, graph: Graph, cli: string, version: string, overrides: Record<string, Override>, read: ReadRegistry): Promise<Plan> {
  const targets: Target[] = []
  const reuse: Plan['reuse'] = []
  const selected = new Set(graph.publishOrder.map(p => p.name))
  for (const [name, value] of Object.entries(overrides)) {
    if (!selected.has(name) || typeof value?.notes !== 'string' || !value.notes.trim() || typeof value.version !== 'string')
      throw new Error(`覆盖必须属于发布闭包且提供非空说明：${name}`)
    stable(value.version)
    if (name === cli && value.version !== version)
      throw new Error('CLI 覆盖版本须与 --version 一致')
  }
  const versions = new Map<string, string>()
  for (const pkg of graph.publishOrder) {
    const data = await read(pkg.name)
    const previous = pkg.manifest.version
    const prepared = await existsRef(root, `refs/tags/${tagFor(pkg.name, previous)}`)
    const unfinished = !!prepared && !data.versions[previous]
    if (unfinished && !overrides[pkg.name])
      throw new Error(`发现尚未完成目标 ${tagFor(pkg.name, previous)}；先使用 --tag 处理，不能再次升版`)
    if (unfinished && (!await ancestor(root, prepared!, 'HEAD') || (await manifestAt(root, prepared!, pkg.path))?.version !== previous))
      throw new Error(`未完成目标缺少可核对源码：${pkg.name}`)
    let base: string | undefined
    let missingBaseline = false
    try {
      base = await baseline(root, pkg, data)
    }
    catch (error) {
      if (!(error instanceof PlanningInputError) || error.kind !== 'override' || !overrides[pkg.name])
        throw error
      missingBaseline = true
    }
    if (base && (await manifestAt(root, base, pkg.path))!.version !== previous && !unfinished)
      throw new Error(`${pkg.name} 的源码版本 ${previous} 与最后发布基线不一致；先处理未完成版本`)
    if (!base && unfinished)
      base = prepared
    const own = pkg.name !== cli
    const delta = base ? await changes(root, graph, pkg, base, own) : { level: 0 as Level, notes: [], ambiguous: [] }
    if (delta.ambiguous.length && !overrides[pkg.name])
      throw new PlanningInputError('override', pkg.name, `${pkg.name} 无法自动判断变更意图，需要 --override 与说明：\n${delta.ambiguous.join('\n')}`)
    const dependencyNotes: string[] = []
    for (const field of ['dependencies', 'optionalDependencies'] as const) {
      for (const name of Object.keys(pkg.manifest[field] ?? {})) {
        const dependencyVersion = versions.get(name)
        if (!dependencyVersion)
          continue
        const published = data.versions[previous]
        if (published?.[field]?.[name] !== dependencyVersion) {
          delta.level = Math.max(1, delta.level) as Level
          dependencyNotes.push(`- ${name} → ${dependencyVersion}（精确依赖）`)
        }
      }
    }
    const first = !Object.keys(data.versions).length
    if (first && previous !== '0.0.0' && !unfinished)
      throw new Error(`${pkg.name} 首发源码版本须为 0.0.0；先核对 npm 包名和权限`)
    const isTarget = pkg.name === cli || first || missingBaseline || delta.level > 0 || !!overrides[pkg.name]
    if (!isTarget) {
      const published = data.versions[previous]
      if (!published)
        throw new Error(`复用依赖不存在：${pkg.name}@${previous}`)
      versions.set(pkg.name, previous)
      verifyPublished(pkg, published, versions)
      reuse.push({ name: pkg.name, version: previous })
      continue
    }
    const publishedVersions = Object.keys(data.versions).filter(v => /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(v)).sort((a, b) => compare(b, a))
    const semanticBase = base ? (await manifestAt(root, base, pkg.path))!.version : missingBaseline && publishedVersions[0] ? publishedVersions[0] : previous
    const semanticMinimum = delta.level ? bump(semanticBase, delta.level) : bump(previous, 1)
    const automatic = compare(semanticMinimum, bump(previous, 1)) > 0 ? semanticMinimum : bump(previous, 1)
    const next = pkg.name === cli ? version : overrides[pkg.name]?.version ?? automatic
    try {
      upgrade(previous, next)
    }
    catch (error) {
      throw new PlanningInputError('version', pkg.name, error instanceof Error ? error.message : String(error), automatic)
    }
    if (compare(next, semanticMinimum) < 0)
      throw new PlanningInputError('version', pkg.name, `${pkg.name} 版本 ${next} 低于已识别变更要求 ${semanticMinimum}`, automatic)
    newerThanLatest(data, pkg.name, next)
    if (data.versions[next])
      throw new Error(`${pkg.name}@${next} 已在 npm；不能重新准备`)
    const tag = tagFor(pkg.name, next)
    if (await existsRef(root, `refs/tags/${tag}`))
      throw new Error(`已有 tag ${tag}；请使用 --tag，不移动 tag`)
    const notes = pkg.name === cli
      ? section(readFileSync(resolve(root, pkg.path, 'CHANGELOG.md'), 'utf8'), 'Unreleased')
      : [overrides[pkg.name]?.notes ?? (first ? '- 首次公开发布。' : delta.notes.join('\n')), ...dependencyNotes].filter(Boolean).join('\n')
    if (!notes.trim())
      throw new Error(`${pkg.name} 缺少发布说明`)
    const changelog = resolve(root, pkg.path, 'CHANGELOG.md')
    if (existsSync(changelog)) {
      const text = readFileSync(changelog, 'utf8')
      if (!/^## Unreleased\s*$/m.test(text) || new RegExp(`^## ${next.replaceAll('.', '\\.')}\\b`, 'm').test(text))
        throw new Error(`${pkg.name} CHANGELOG 缺少 Unreleased 或已包含目标版本`)
    }
    targets.push({ name: pkg.name, previous, version: next, notes })
    versions.set(pkg.name, next)
  }
  return { cli, tag: tagFor(cli, version), targets, reuse, build: graph.buildOrder.map(p => p.name) }
}

export async function fixedPlan(root: string, graph: Graph, tag: string, main: string): Promise<Plan> {
  const commit = await existsRef(root, `refs/tags/${tag}`)
  if (!commit || !await ancestor(root, commit, main))
    throw new Error(`tag 必须可从远程 main 到达：${tag}`)
  const parents = (await git(root, 'rev-list', '--parents', '-n', '1', commit)).split(' ').slice(1)
  if (parents.length !== 1)
    throw new Error('版本 commit 必须恰有一个父 commit')
  const parent = parents[0]
  const rootBefore = JSON.parse(await git(root, 'show', `${parent}:package.json`)) as Manifest
  const rootAfter = JSON.parse(await git(root, 'show', `${commit}:package.json`)) as Manifest
  if (rootAfter.private !== true || rootBefore.version !== rootAfter.version)
    throw new Error('根包须保持 private 且版本不变')
  const selected = new Set(graph.publishOrder.map(p => p.name))
  const targets: Target[] = []
  const reuse: Plan['reuse'] = []
  for (const [name, item] of graph.workspace) {
    const previous = (await manifestAt(root, parent, item.path))?.version ?? '0.0.0'
    if (previous !== item.manifest.version) {
      const pkg = graph.packages.get(name)
      if (!pkg || !selected.has(name) || pkg.role === 'build')
        throw new Error(`版本 commit 包含计划外包的版本变化：${name}`)
      upgrade(previous, pkg.manifest.version)
      const packageTag = tagFor(name, pkg.manifest.version)
      if (await existsRef(root, `refs/tags/${packageTag}`) !== commit)
        throw new Error(`本次包级 tag 未固定到同一 commit：${packageTag}`)
      const changelog = source(root, `${item.path}/CHANGELOG.md`, commit)
      if ([...changelog.matchAll(/^## Unreleased\s*$/gm)].length !== 1)
        throw new Error(`定版后须保留唯一 Unreleased 入口：${name}`)
      const notes = section(changelog, item.manifest.version)
      targets.push({ name, previous, version: item.manifest.version, notes })
    }
    else if (selected.has(name)) {
      reuse.push({ name, version: item.manifest.version })
    }
  }
  const cli = graph.publishOrder.at(-1)!
  if (tag !== tagFor(cli.name, cli.manifest.version) || !targets.some(t => t.name === cli.name))
    throw new Error('根 tag 必须是本次升版的选中 CLI')
  // A fixed version commit only contains the files the preparation step owns.
  const allowed = new Set(['pnpm-lock.yaml', ...targets.flatMap(t => [`${graph.packages.get(t.name)!.path}/package.json`, `${graph.packages.get(t.name)!.path}/CHANGELOG.md`])])
  const changed = (await git(root, 'diff', '--name-only', parent, commit)).split('\n')
  if (changed.some(path => !allowed.has(path)))
    throw new Error('版本 commit 含有定版文件之外的改动；请先提交实现，再单独定版')
  return {
    cli: cli.name,
    tag,
    targets: graph.publishOrder.flatMap(p => targets.filter(t => t.name === p.name)),
    reuse,
    build: graph.buildOrder.map(p => p.name),
  }
}
