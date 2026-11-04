import type { Override } from './model'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { authPreflight, execute } from './execute'
import { checkPreviousRecords, dispatch, githubPreflight, noActiveRelease } from './github'
import { loadGraph, parseTag } from './model'
import { readRegistry } from './npm'
import { createPlan, fixedPlan } from './plan'
import { checkTags, lock, prepare, synchronizedMain } from './prepare'
import { git } from './process'

const help = `发布一个 CLI 及必需的公开运行时依赖：
  pnpm release --package <name> --version <stable-version> --mode ci|local [--dry-run]
  pnpm release --tag <name@version> --mode ci|local [--dry-run]

可选：
  --override <json-file>       { "包名": { "version": "0.1.1", "notes": "说明" } }
  --artifacts-dir <directory>  已有 tag 本地执行时提供保留的原 tarball

dry-run 只读；新版本需要干净且与 origin/main 同步的 main。
实际执行会创建版本 commit、包级 tag 并 atomic push；失败保留现场。
`

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    'package': { type: 'string' },
    'version': { type: 'string' },
    'tag': { type: 'string' },
    'mode': { type: 'string' },
    'override': { type: 'string' },
    'artifacts-dir': { type: 'string' },
    'dry-run': { type: 'boolean' },
    'help': { type: 'boolean', short: 'h' },
  } })
  if (values.help) {
    console.log(help)
    return
  }
  if (!['ci', 'local'].includes(values.mode ?? ''))
    throw new Error('必须显式选择 --mode ci 或 --mode local')
  if (values.tag ? !!(values.package || values.version || values.override) : !(values.package && values.version))
    throw new Error('--package + --version 与 --tag 互斥；已有 tag 不再接受版本覆盖')
  if (values['artifacts-dir'] && (!values.tag || values.mode !== 'local'))
    throw new Error('--artifacts-dir 只用于已有 tag 的本地执行')
  const root = await git(process.cwd(), 'rev-parse', '--show-toplevel')
  const local = values.mode === 'local'
  const dry = values['dry-run'] === true
  const releaseLock = dry ? undefined : await lock(root)
  try {
    if (!dry)
      await git(root, 'fetch', 'origin', 'main', '--tags')
    const name = values.tag ? parseTag(values.tag).name : values.package!
    const graph = loadGraph(root, name, values.tag ? `refs/tags/${values.tag}` : undefined)
    const repo = await githubPreflight(root, graph, local)
    if (local) {
      await authPreflight(root, true)
      await noActiveRelease(root, repo)
    }
    let plan
    if (values.tag) {
      const main = (await git(root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/main')).split(/\s+/)[0]
      plan = await fixedPlan(root, graph, values.tag, main)
    }
    else {
      await synchronizedMain(root)
      await checkPreviousRecords(root, repo, graph, readRegistry)
      const overrides = values.override ? JSON.parse(readFileSync(resolve(values.override), 'utf8')) as Record<string, Override> : {}
      plan = await createPlan(root, graph, name, values.version!, overrides, readRegistry)
      await checkTags(root, plan)
    }
    console.log(JSON.stringify(plan, null, 2))
    if (dry)
      return
    if (!values.tag)
      await prepare(root, graph, plan)
    if (local)
      await execute(root, plan.tag, true, values['artifacts-dir'])
    else
      await dispatch(root, repo, plan)
  }
  finally {
    await releaseLock?.()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  console.error('修复后对已推送目标使用 --tag；基础门禁失败保留改动，绝不自动 reset。详见 AGENTS.md 的 CLI Releases。')
  process.exitCode = 1
})
