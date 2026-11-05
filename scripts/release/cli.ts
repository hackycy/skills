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
  process.exitCode = 1
})
