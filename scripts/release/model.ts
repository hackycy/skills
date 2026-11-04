import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { matchesGlob, resolve } from 'node:path'
import { parse } from 'yaml'

export type Role = 'cli' | 'runtime' | 'build'
export type Level = 0 | 1 | 2 | 3
export interface Registration {
  name: string
  path: string
  role: Role
  build: string
  inlinedBuildDependencies: string[]
}
export interface Manifest {
  name: string
  version: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  publishConfig?: { access?: string, registry?: string, tag?: string }
  repository?: { url?: string, directory?: string }
  bin?: Record<string, string>
  files?: string[]
}
export interface Package extends Registration { manifest: Manifest }
export interface Graph {
  packages: Map<string, Package>
  workspace: Map<string, { path: string, manifest: Manifest }>
  buildOrder: Package[]
  publishOrder: Package[]
}
export interface Target {
  name: string
  previous: string
  version: string
  notes: string
}
export interface Plan {
  cli: string
  tag: string
  targets: Target[]
  build: string[]
  reuse: { name: string, version: string }[]
}
export interface Override { version: string, notes: string }

export const registry = 'https://registry.npmjs.org'
export const toolchain = { node: '24.16.0', npm: '12.2.1' }

export function stable(version: string): number[] {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version))
    throw new Error(`仅支持稳定 SemVer：${version}`)
  const parts = version.split('.').map(Number)
  if (parts.some(v => !Number.isSafeInteger(v)))
    throw new Error(`版本数值过大：${version}`)
  return parts
}

export function compare(a: string, b: string): number {
  const av = stable(a)
  const bv = stable(b)
  return av.map((v, i) => Math.sign(v - bv[i])).find(v => v !== 0) ?? 0
}

export function bump(version: string, level: Level): string {
  const [major, minor, patch] = stable(version)
  if (version === '0.0.0')
    return '0.1.0'
  return level === 3 ? `${major + 1}.0.0` : level === 2 ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
}

export function upgrade(previous: string, version: string, level: Level = 1): void {
  stable(version)
  if (previous === '0.0.0' && version !== '0.1.0')
    throw new Error('首次发布必须为 0.1.0')
  if (compare(version, previous) <= 0 || compare(version, bump(previous, level)) < 0)
    throw new Error(`${version} 不满足 ${previous} 的最低升级要求 ${bump(previous, level)}`)
}

export function intent(message: string, version: string): Level | undefined {
  const header = /^(\w+)(?:\([^)]+\))?(!)?:\s+\S/.exec(message)
  if (!header)
    return undefined
  const zero = stable(version)[0] === 0
  if (header[2] || /^BREAKING[ -]CHANGE:\s*\S/m.test(message))
    return zero ? 2 : 3
  if (header[1] === 'feat')
    return zero ? 1 : 2
  if (header[1] === 'fix')
    return 1
  return undefined
}

export function tagFor(name: string, version: string): string {
  if (!/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/.test(name))
    throw new Error(`非法包名：${name}`)
  stable(version)
  return `${name}@${version}`
}

export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`
}

export function parseTag(tag: string): { name: string, version: string } {
  const index = tag.lastIndexOf('@')
  const name = tag.slice(0, index)
  const version = tag.slice(index + 1)
  if (tagFor(name, version) !== tag)
    throw new Error(`非法包级 tag：${tag}`)
  return { name, version }
}

export function source(root: string, path: string, ref?: string): string {
  return ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }) : readFileSync(resolve(root, path), 'utf8')
}

export function loadGraph(root: string, cli: string, ref?: string): Graph {
  const rootManifest = JSON.parse(source(root, 'package.json', ref)) as Manifest
  if (rootManifest.private !== true)
    throw new Error('根 package.json 必须保持 private')
  const registrations = JSON.parse(source(root, 'scripts/release/packages.json', ref)) as Registration[]
  const workspaceConfig = parse(source(root, 'pnpm-workspace.yaml', ref)) as { packages: string[] }
  const patterns = workspaceConfig.packages.filter(p => !p.startsWith('!')).map(p => `${p}/package.json`)
  const excluded = ['**/node_modules/**', ...workspaceConfig.packages.filter(p => p.startsWith('!')).map(p => `${p.slice(1)}/**`)]
  const paths = ref
    ? execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { cwd: root, encoding: 'utf8' }).split('\n').filter(path => patterns.some(p => matchesGlob(path, p)) && !excluded.some(p => matchesGlob(path, p)))
    : globSync(patterns, {
        cwd: root,
        exclude: excluded,
      })
  const workspace: Graph['workspace'] = new Map()
  for (const path of paths) {
    const manifest = JSON.parse(source(root, path, ref)) as Manifest
    if (workspace.has(manifest.name))
      throw new Error(`重复 workspace 包名：${manifest.name}`)
    workspace.set(manifest.name, { path: path.replace(/\/package\.json$/, ''), manifest })
  }
  const packages = new Map<string, Package>()
  for (const registration of registrations) {
    const item = workspace.get(registration.name)
    if (!item || item.path !== registration.path || packages.has(registration.name))
      throw new Error(`发布登记与 workspace 不一致：${registration.name}`)
    if (!['cli', 'runtime', 'build'].includes(registration.role) || !Array.isArray(registration.inlinedBuildDependencies))
      throw new Error(`发布登记无效：${registration.name}`)
    if (!registration.build || !item.manifest.scripts?.[registration.build])
      throw new Error(`缺少构建入口：${registration.name}`)
    stable(item.manifest.version)
    if (registration.role === 'build' ? item.manifest.private !== true : item.manifest.private === true)
      throw new Error(`private 与发行角色冲突：${registration.name}`)
    if (registration.role !== 'build') {
      tagFor(registration.name, item.manifest.version)
      const config = item.manifest.publishConfig
      if (config?.access !== 'public' || config.registry !== registry || config.tag !== 'latest')
        throw new Error(`必须显式配置 public、npm 官方 registry 和 latest：${registration.name}`)
      if (!item.manifest.repository?.url || item.manifest.repository.directory !== registration.path || !item.manifest.files?.length)
        throw new Error(`缺少 repository/directory/files：${registration.name}`)
      if (registration.role === 'cli' && !Object.keys(item.manifest.bin ?? {}).length)
        throw new Error(`CLI 缺少 bin：${registration.name}`)
    }
    packages.set(registration.name, { ...registration, manifest: item.manifest })
  }
  if (packages.get(cli)?.role !== 'cli')
    throw new Error(`未登记的 CLI：${cli}`)

  function edges(pkg: Package, production: boolean): Package[] {
    for (const name of Object.keys(pkg.manifest.peerDependencies ?? {})) {
      if (workspace.has(name))
        throw new Error(`首版不支持内部 peerDependencies：${pkg.name} → ${name}`)
    }
    const result: Package[] = []
    const fields = production ? ['dependencies', 'optionalDependencies'] as const : ['dependencies', 'optionalDependencies', 'devDependencies'] as const
    for (const field of fields) {
      for (const [name, specifier] of Object.entries(pkg.manifest[field] ?? {})) {
        if (!workspace.has(name)) {
          if (/^(?:workspace:|link:|file:)/.test(specifier))
            throw new Error(`未登记的本地依赖：${pkg.name} → ${name}`)
          continue
        }
        const dependency = packages.get(name)
        if (!dependency)
          throw new Error(`未登记的 workspace 依赖：${name}`)
        if (specifier !== 'workspace:*')
          throw new Error(`内部依赖必须为 workspace:*：${pkg.name} → ${name}`)
        if (field !== 'devDependencies' && dependency.role === 'build')
          throw new Error(`private 生产依赖：${pkg.name} → ${name}`)
        if (production && dependency.role !== 'runtime')
          throw new Error(`生产依赖必须是内部运行时发行包：${pkg.name} → ${name}`)
        result.push(dependency)
      }
    }
    for (const name of pkg.inlinedBuildDependencies) {
      if (!result.some(p => p.name === name) && !production)
        throw new Error(`内联关系必须是直接 workspace 构建依赖：${pkg.name} → ${name}`)
      if (packages.get(name)?.role !== 'build')
        throw new Error(`内联依赖必须为 private 构建包：${name}`)
    }
    return result
  }
  function sort(production: boolean): Package[] {
    const done = new Set<string>()
    const visiting = new Set<string>()
    const order: Package[] = []
    function visit(pkg: Package): void {
      if (visiting.has(pkg.name))
        throw new Error(`workspace 循环依赖：${pkg.name}`)
      if (done.has(pkg.name))
        return
      visiting.add(pkg.name)
      edges(pkg, production).forEach(visit)
      visiting.delete(pkg.name)
      done.add(pkg.name)
      order.push(pkg)
    }
    visit(packages.get(cli)!)
    return order
  }
  return { packages, workspace, buildOrder: sort(false), publishOrder: sort(true) }
}

export function section(changelog: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...changelog.matchAll(new RegExp(`^## ${escaped}(?: \\([^\\n]*\\))?\\s*$`, 'gm'))]
  if (matches.length !== 1)
    throw new Error(`CHANGELOG 必须有唯一的 ## ${heading}`)
  const start = matches[0].index! + matches[0][0].length
  const rest = changelog.slice(start)
  const end = rest.search(/^## /m)
  const body = (end < 0 ? rest : rest.slice(0, end)).trim()
  const meaningful = body.replace(/<!--[\s\S]*?-->/g, '').split('\n').some(line => line.trim().replace(/^[-*+]$/, '').trim())
  if (!meaningful)
    throw new Error(`CHANGELOG 的 ${heading} 不能为空`)
  return body
}
