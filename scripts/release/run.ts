import process from 'node:process'
import { parseArgs } from 'node:util'
import { execute } from './execute'
import { lock } from './prepare'
import { git } from './process'

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    'tag': { type: 'string' },
    'artifacts-dir': { type: 'string' },
  } })
  if (!values.tag || process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('此入口仅供 main 上的 workflow_dispatch；维护者请用 pnpm release')
  const root = await git(process.cwd(), 'rev-parse', '--show-toplevel')
  const releaseLock = await lock(root)
  try {
    await execute(root, values.tag, false, values['artifacts-dir'])
  }
  finally { await releaseLock() }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
