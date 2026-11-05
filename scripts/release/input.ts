import type { Override } from './model'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { parseTag, stable } from './model'

export interface ReleaseArguments {
  package?: string
  version?: string
  tag?: string
  mode?: string
  override?: string
  artifactsDir?: string
  dryRun?: boolean
  help?: boolean
}

interface CommonInput {
  mode: 'ci' | 'local'
  dryRun: boolean
  artifactsDir?: string
  overrides: Record<string, Override>
}

export type ReleaseInput = CommonInput & (
  { kind: 'new', package: string, version: string }
  | { kind: 'tag', tag: string }
)

export const help = `发布一个 CLI 及必需的公开运行时依赖：
  pnpm release
  pnpm release --package <name> [--version <stable-version>] [--mode ci|local] [--dry-run]
  pnpm release --tag <name@version> [--mode ci|local] [--dry-run]

本地终端缺参时交互补齐，发布方式默认选中 local；完整命令直接执行。
CI 或非终端不交互，必须提供 --package + --version 或 --tag，以及 --mode。
ci 表示交给 GitHub Actions 发布，local 表示本机发布，与是否允许交互无关。

可选：
  --override <json-file>       { "包名": { "version": "0.1.1", "notes": "说明" } }
  --artifacts-dir <directory>  已有 tag 本地执行时提供保留的原 tarball

向导支持直接填写覆盖；展示计划后可选择发布、仅预览或取消，默认仅预览。
--dry-run 只读且不能转为发布；预览使用本地 tag，不 fetch。
新版本需要干净且与 origin/main 同步的 main。
实际执行会创建版本 commit、包级 tag 并 atomic push；失败保留现场。
`

export function parseReleaseArgs(args: string[]): ReleaseArguments {
  const { values } = parseArgs({ args, options: {
    'package': { type: 'string' },
    'version': { type: 'string' },
    'tag': { type: 'string' },
    'mode': { type: 'string' },
    'override': { type: 'string' },
    'artifacts-dir': { type: 'string' },
    'dry-run': { type: 'boolean' },
    'help': { type: 'boolean', short: 'h' },
  } })
  return { ...values, artifactsDir: values['artifacts-dir'], dryRun: values['dry-run'] }
}

export function validateArguments(input: ReleaseArguments): void {
  for (const key of ['package', 'version', 'tag', 'mode', 'override', 'artifactsDir'] as const) {
    if (input[key] !== undefined && !input[key]!.trim())
      throw new Error(`${key === 'artifactsDir' ? '--artifacts-dir' : `--${key}`} 不能为空`)
  }
  if (input.mode !== undefined && !['ci', 'local'].includes(input.mode))
    throw new Error('--mode 必须为 ci 或 local')
  if (input.tag && (input.package || input.version || input.override))
    throw new Error('--package + --version 与 --tag 互斥；已有 tag 不再接受版本覆盖')
  if (input.artifactsDir && (input.package || input.version || input.override || input.mode === 'ci'))
    throw new Error('--artifacts-dir 只用于已有 tag 的本地执行')
  if (input.version)
    stable(input.version)
  if (input.tag)
    parseTag(input.tag)
}

export function missingArguments(input: ReleaseArguments): string[] {
  return [
    ...(!input.mode ? ['--mode ci|local'] : []),
    ...(input.tag
      ? []
      : input.artifactsDir
        ? ['--tag']
        : [
            ...(!input.package ? ['--package（或使用 --tag）'] : []),
            ...(!input.version ? ['--version'] : []),
          ]),
  ]
}

export function requireComplete(input: ReleaseArguments): void {
  const missing = missingArguments(input)
  if (missing.length)
    throw new Error(`缺少参数：${missing.join('、')}。CI 或非终端无法交互。\n示例：pnpm release --package <name> --version 0.1.0 --mode local\n或：pnpm release --tag '<name@version>' --mode ci`)
}

export function readOverrides(input: ReleaseArguments): Record<string, Override> {
  if (!input.override)
    return {}
  const value: unknown = JSON.parse(readFileSync(resolve(input.override), 'utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('--override 必须是包名到 { version, notes } 的 JSON 对象')
  const overrides = value as Record<string, Override>
  for (const [name, item] of Object.entries(overrides)) {
    if (typeof item?.version !== 'string' || typeof item.notes !== 'string' || !item.notes.trim())
      throw new Error(`覆盖必须提供版本和非空说明：${name}`)
    stable(item.version)
    if (name === input.package && input.version && item.version !== input.version)
      throw new Error('CLI 覆盖版本须与 --version 一致')
  }
  return overrides
}

export function completeArguments(input: ReleaseArguments): ReleaseInput {
  requireComplete(input)
  const common: CommonInput = {
    mode: input.mode as CommonInput['mode'],
    dryRun: input.dryRun === true,
    artifactsDir: input.artifactsDir,
    overrides: readOverrides(input),
  }
  return input.tag
    ? { ...common, kind: 'tag', tag: input.tag }
    : { ...common, kind: 'new', package: input.package!, version: input.version! }
}
