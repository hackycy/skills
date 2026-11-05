import process from 'node:process'
import { help, parseReleaseArgs } from './input'
import { ReleaseCancelled, reportCancellation } from './interactive'
import { runRelease } from './workflow'

async function main(): Promise<void> {
  const args = parseReleaseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(help)
    return
  }
  await runRelease(args)
}

main().catch((error: unknown) => {
  if (error instanceof ReleaseCancelled) {
    reportCancellation()
    process.exitCode = error.exitCode
    return
  }
  console.error(error instanceof Error ? error.message : error)
  console.error('修复后对已推送目标使用 --tag；基础门禁失败保留改动，绝不自动 reset。详见 AGENTS.md 的 CLI Releases。')
  process.exitCode = 1
})
