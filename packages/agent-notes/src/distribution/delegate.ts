import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { options } from '../cli/run'
import { NotesError } from '../notes/model'
import { findRoot, Repository, sha256 } from '../notes/snapshot'
import { assertNoTransaction, recoverTransaction } from '../workflow/transaction'
import { managerVersion } from './bundle'
import { readInstallation } from './manifest'

/** Only the current installed runtime may execute; Git snapshot files are data. */
export function delegate(args: string[], executable: string): number | undefined {
  if (!['context', 'show', 'check', 'create', 'update', 'transition', 'archive', 'prune'].includes(args[0]))
    return undefined
  const input = options(args)
  const root = findRoot(input.root, process.cwd())
  if (args.includes('--recover'))
    recoverTransaction(root)
  if (!args.includes('--staged') && !args.includes('--head'))
    assertNoTransaction(root)
  const source = new Repository(root).snapshot('worktree')
  const installation = readInstallation(source)
  if (!installation)
    return undefined
  const asset = installation.assets.find(asset => asset.path === '.agent-notes/runtime/cli.mjs')!
  const bytes = source.read(asset.path)
  if (!bytes || sha256(bytes) !== asset.sha256)
    throw new NotesError('ASSET_INTEGRITY', 'The locked runtime is missing or modified. Run upgrade using a complete npm package to repair it.', asset.path)
  const runtime = join(root, asset.path)
  if (realpathSync(executable) === realpathSync(runtime)) {
    if (installation.version !== managerVersion)
      throw new NotesError('CONCURRENT_CHANGE', 'The running tool version differs from the installed runtime. Retry after upgrade completes.', asset.path)
    return undefined
  }
  const child = spawnSync(process.execPath, [runtime, ...args], { stdio: 'inherit' })
  if (child.error || child.signal || child.status === null)
    throw new NotesError('RUNTIME_FAILED', child.error?.message ?? `Project runtime terminated: ${child.signal}`)
  return child.status
}
