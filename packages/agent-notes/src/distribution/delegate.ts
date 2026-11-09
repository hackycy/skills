import type { Options } from '../cli/arguments'
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { runtimeArguments } from '../cli/arguments'
import { NotesError } from '../notes/model'
import { findRoot, Repository, sha256 } from '../notes/snapshot'
import { assertNoTransaction, recoverTransaction } from '../workflow/transaction'
import { managerVersion } from './bundle'
import { layoutFromSnapshot, notesLayout } from './layout'
import { readInstallation } from './manifest'
import { repairCommand } from './source'

/** Only the current installed runtime may execute; Git snapshot files are data. */
export function delegate(input: Options, executable: string): number | undefined {
  if (!['context', 'show', 'check', 'create', 'update', 'transition', 'archive', 'prune'].includes(input.command))
    return undefined
  const root = findRoot(input.root, process.cwd())
  if (input.recover)
    recoverTransaction(root)
  if (!input.staged && !input.head)
    assertNoTransaction(root)
  const source = new Repository(root).snapshot('worktree')
  const layout = layoutFromSnapshot(source) ?? notesLayout()
  const installation = readInstallation(source, layout)
  if (!installation)
    return undefined
  const asset = installation.assets.find(asset => asset.path === layout.runtimeCli)!
  const bytes = source.read(asset.path)
  if (!bytes || sha256(bytes) !== asset.sha256)
    throw new NotesError('ASSET_INTEGRITY', `The locked runtime is missing or modified. Run ${repairCommand(installation.version)} using the complete npm package.`, asset.path)
  const runtime = join(root, layout.runtimeCli)
  if (realpathSync(executable) === realpathSync(runtime)) {
    if (installation.version !== managerVersion)
      throw new NotesError('CONCURRENT_CHANGE', 'The running tool version differs from the installed runtime. Retry after upgrade completes.', asset.path)
    return undefined
  }
  const child = spawnSync(process.execPath, [runtime, ...runtimeArguments(input)], { stdio: 'inherit' })
  if (child.error || child.signal || child.status === null)
    throw new NotesError('RUNTIME_FAILED', child.error?.message ?? `Project runtime terminated: ${child.signal}`)
  return child.status
}
