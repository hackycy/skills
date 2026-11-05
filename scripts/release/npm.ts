import type { Package } from './model'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import { compare, registry } from './model'

export interface PublishedVersion {
  name: string
  version: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  dist: { integrity?: string }
}
export interface Packument {
  'versions': Record<string, PublishedVersion>
  'dist-tags': Record<string, string>
}
export type ReadRegistry = (name: string) => Promise<Packument>

export const readRegistry: ReadRegistry = async (name) => {
  const response = await fetch(`${registry}/${encodeURIComponent(name)}`, {
    headers: { 'accept': 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 404)
    return { 'versions': {}, 'dist-tags': {} }
  if (!response.ok)
    throw new Error(`npm 查询 ${name} 失败：HTTP ${response.status}`)
  const data = await response.json() as Packument
  if (!data.versions || !data['dist-tags'])
    throw new Error(`npm 元数据无效：${name}`)
  return data
}

export function newerThanLatest(data: Packument, name: string, version: string): void {
  const latest = data['dist-tags'].latest
  if (latest && compare(version, latest) <= 0)
    throw new Error(`${name}@${version} 必须高于 npm latest ${latest}，不会回退 latest`)
}

export function verifyPublished(pkg: Package, published: PublishedVersion, versions: Map<string, string>): void {
  if (published.name !== pkg.name || published.version !== pkg.manifest.version)
    throw new Error(`npm 包身份不符：${pkg.name}`)
  for (const field of ['dependencies', 'optionalDependencies'] as const) {
    for (const name of Object.keys(pkg.manifest[field] ?? {})) {
      if (versions.has(name) && published[field]?.[name] !== versions.get(name))
        throw new Error(`npm 依赖未精确锁定：${pkg.name} → ${name}@${versions.get(name)}`)
    }
  }
}

export function verifyIntegrity(file: string, published: PublishedVersion): void {
  const integrity = published.dist?.integrity
  const actual = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`
  if (!integrity?.split(/\s+/).includes(actual))
    throw new Error(`原 tarball 与 npm integrity 不匹配或缺少证据：${file}`)
}

export async function visible(name: string, version: string, read: ReadRegistry = readRegistry): Promise<Packument> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const data = await read(name)
    if (data.versions[version] || attempt === 29)
      return data
    await setTimeout(2000)
  }
  throw new Error('不可达')
}
