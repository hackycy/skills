import type { Result } from '../cli/run'
import type { WriteOptions } from './input'
import type { TransactionHooks } from './transaction'
import { observeRuntime } from '../distribution/bundle'
import { checkHistory } from '../notes/history'
import { diagnostic, NotesError } from '../notes/model'
import { readIndex } from '../notes/reader'
import { Repository, sha256 } from '../notes/snapshot'
import { currentDiagnostics, isRuntime, validateCurrent } from '../notes/validation'
import { readInput } from './input'
import { planWrite } from './plan'
import { assertNoTransaction, commitTransaction, recoverTransaction, verifyObservations } from './transaction'

export function executeWrite(root: string, options: WriteOptions, stdin?: string, hooks: TransactionHooks = {}): Result {
  const result: Result = { command: options.command, result: 'ok', scope: { root, snapshot: 'worktree' }, data: {}, diagnostics: [], review: [] }
  try {
    const recovered = options.recover ? recoverTransaction(root) : false
    result.data.recovered = recovered
    assertNoTransaction(root)
    const repository = new Repository(root)
    const base = repository.revision(options.base ?? 'HEAD', Boolean(options.base) || ['archive', 'prune'].includes(options.command))
    result.scope.base = base ?? null
    const source = repository.snapshot('worktree')
    observeRuntime(source)
    const index = readIndex(source)
    const baseline = base ? repository.snapshot('commit', base) : undefined
    const previous = baseline ? readIndex(baseline) : undefined
    const initial = ['archive', 'prune'].includes(options.command) ? validateCurrent(source, index) : currentDiagnostics(index)
    if (previous)
      initial.push(...currentDiagnostics(previous))
    initial.push(...checkHistory(source, index, baseline, previous).diagnostics)
    if (initial.length) {
      result.diagnostics.push(...initial)
    }
    else {
      const input = readInput(source, options.input, stdin)
      const plan = planWrite(source, index, options, input, baseline)
      const overlay = source.overlay(plan.changes)
      const next = readIndex(overlay)
      result.diagnostics.push(...validateCurrent(overlay, next))
      const history = checkHistory(overlay, next, baseline, previous)
      result.diagnostics.push(...history.diagnostics)
      // Protect uncommitted rejected/archive history, too; Git may predate its creation.
      const operationHistory = checkHistory(overlay, next, source, index)
      result.diagnostics.push(...operationHistory.diagnostics)
      result.review.push(...plan.review, ...history.review)
      result.data = {
        ...plan.data,
        recovered,
        changes: [...plan.changes].map(([path, bytes]) => {
          const before = source.read(path)
          return {
            path,
            action: bytes === null ? 'delete' : before ? 'update' : 'create',
            before_hash: before ? sha256(before) : null,
            after_hash: bytes ? sha256(bytes) : null,
            ...(options.dryRun ? { before: before?.toString('utf8') ?? null, after: bytes?.toString('utf8') ?? null } : {}),
          }
        }),
      }
      if (!result.diagnostics.length && !options.dryRun && plan.changes.size) {
        const inventory = source.paths().filter(path => !isRuntime(path) && (/\.md$/i.test(path) || path.startsWith(`${index.config.notes_dir}/`)))
        commitTransaction(source, plan.changes, (applied) => {
          if (repository.revision(options.base ?? 'HEAD', Boolean(base)) !== base)
            throw new NotesError('CONCURRENT_CHANGE', 'The selected Git baseline changed during preflight; rerun.')
          const fresh = repository.snapshot('worktree')
          fresh.includeDirectory(index.config.notes_dir)
          const freshInventory = fresh.paths().filter(path => !isRuntime(path) && (/\.md$/i.test(path) || path.startsWith(`${index.config.notes_dir}/`)))
          const expectedInventory = new Set(inventory)
          if (applied) {
            for (const [path, bytes] of plan.changes) {
              if (bytes !== null)
                expectedInventory.add(path)
              else if (!fresh.entries.has(path))
                expectedInventory.delete(path)
            }
          }
          if (JSON.stringify(freshInventory) !== JSON.stringify([...expectedInventory].sort()))
            throw new NotesError('CONCURRENT_CHANGE', 'The Notes or Markdown inventory changed during preflight; rerun before repairing references.')
          verifyObservations(source, fresh, applied ? plan.changes : undefined)
        }, hooks)
      }
    }
    if (result.diagnostics.length)
      result.result = result.diagnostics.some(item => item.code === 'UNSUPPORTED_FORMAT') ? 'invalid-input' : 'failed'
  }
  catch (error) {
    result.diagnostics.push(diagnostic(error))
    result.result = error instanceof NotesError && error.exitCode === 3
      ? 'needs-decision'
      : error instanceof NotesError && error.exitCode === 2 ? 'invalid-input' : 'failed'
  }
  return result
}
