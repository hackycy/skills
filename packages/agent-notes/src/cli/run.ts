import type { Target } from '../distribution/manifest'
import type { Diagnostic, NoteIndex } from '../notes/model'
import type { Snapshot } from '../notes/snapshot'
import type { WriteCommand } from '../workflow/input'
import process from 'node:process'
import { context } from '../discovery/context'
import { matchesPath, matchReasons } from '../discovery/scope'
import { manage } from '../distribution/manage'
import { checkHistory } from '../notes/history'
import { checkLinks } from '../notes/markdown'
import { diagnostic, NotesError } from '../notes/model'
import { readIndex } from '../notes/reader'
import { supersededBy } from '../notes/relations'
import { findRoot, Repository, safePath } from '../notes/snapshot'
import { currentDiagnostics, isRuntime } from '../notes/validation'
import { executeWrite } from '../workflow/execute'
import { writeCommands } from '../workflow/input'
import { assertNoTransaction } from '../workflow/transaction'

export interface Result {
  command: string
  result: 'ok' | 'failed' | 'invalid-input' | 'needs-decision'
  scope: { root?: string, snapshot?: string, base?: string | null, head?: string | null }
  data: Record<string, unknown>
  diagnostics: Diagnostic[]
  review: Diagnostic[]
}

interface Options {
  command: 'context' | 'show' | 'check' | 'init' | 'upgrade' | 'status' | WriteCommand
  root?: string
  id?: string
  paths: string[]
  topics: string[]
  targets: Target[]
  notesDir?: string
  language?: 'zh-CN' | 'en'
  json: boolean
  includeArchived: boolean
  staged: boolean
  maintenance: boolean
  base?: string
  head?: string
  input?: string
  to?: string
  dryRun: boolean
  recover: boolean
}

export const help = `agent-notes — engineering decision Notes (implementation preview)

  init --target <agents|claude> [--target <agents|claude>] [--notes-dir <path>] [--language <zh-CN|en>]
  upgrade [--dry-run] [--recover]
  status
  context [--paths <paths...>] [--topic <topic>] [--include-archived]
  show <id>
  check [--staged] [--base <commit>] [--head <commit>] [--maintenance]
  create --input <json-file|->
  update <id> --input <json-file|->
  transition <id> --to <implemented|rejected> --input <json-file|->
  archive <id> --input <json-file|-> [--base <commit>]
  prune <id> --input <json-file|-> [--base <commit>]

All commands: --root <project> --json
Write commands: --dry-run (no writes), --recover (recover an interrupted write before retrying)
Daily commands use the installed project runtime. init locates the Git root or current directory.
Without an installation, daily commands require --root; .agents/notes is the default.
--head requires --base and cannot be combined with --staged.
Exit codes: 0 passed; 1 failed; 2 invalid input; 3 missing decision material.`

export function options(args: string[]): Options {
  const command = args[0]
  if (!['context', 'show', 'check', 'init', 'upgrade', 'status', ...writeCommands].includes(command))
    throw new NotesError('INVALID_INPUT', 'Unknown command. Use --help for supported commands.', undefined, 2)
  const isWrite = writeCommands.includes(command)
  const needsId = command === 'show' || (isWrite && command !== 'create')
  const result: Options = { command: command as Options['command'], paths: [], topics: [], targets: [], json: false, includeArchived: false, staged: false, maintenance: false, dryRun: false, recover: false }
  const seen = new Set<string>()
  const allowed = new Set(['--root', '--json', ...(command === 'init'
    ? ['--target', '--notes-dir', '--language', '--dry-run', '--recover']
    : command === 'upgrade'
      ? ['--dry-run', '--recover']
      : command === 'check'
        ? ['--base', '--head', '--staged', '--maintenance']
        : command === 'context'
          ? ['--paths', '--topic', '--include-archived']
          : isWrite ? ['--input', '--dry-run', '--recover', ...(command === 'transition' ? ['--to'] : []), ...(['archive', 'prune'].includes(command) ? ['--base'] : [])] : [])])
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--') && needsId && !result.id) {
      result.id = arg
      continue
    }
    if (!allowed.has(arg) || (seen.has(arg) && !['--paths', '--topic', '--target'].includes(arg)))
      throw new NotesError('INVALID_INPUT', `Unknown, misplaced or duplicate argument: ${arg}`, undefined, 2)
    seen.add(arg)
    if (['--root', '--base', '--head', '--topic', '--paths', '--input', '--to', '--target', '--notes-dir', '--language'].includes(arg)) {
      const value = args[++i]
      if (!value || value.startsWith('--'))
        throw new NotesError('INVALID_INPUT', `Missing value for ${arg}.`, undefined, 2)
      if (arg === '--paths') {
        result.paths.push(value)
        while (args[i + 1] && !args[i + 1].startsWith('--'))
          result.paths.push(args[++i])
      }
      else if (arg === '--topic') {
        result.topics.push(value)
      }
      else if (arg === '--target') {
        if (!['agents', 'claude'].includes(value) || result.targets.includes(value as Target))
          throw new NotesError('INVALID_INPUT', 'Targets must be distinct: agents and/or claude.', undefined, 2)
        result.targets.push(value as Target)
      }
      else if (arg === '--notes-dir') {
        result.notesDir = value
      }
      else if (arg === '--language') {
        if (!['zh-CN', 'en'].includes(value))
          throw new NotesError('INVALID_INPUT', 'Language must be zh-CN or en.', undefined, 2)
        result.language = value as 'zh-CN' | 'en'
      }
      else {
        result[arg.slice(2) as 'root' | 'base' | 'head' | 'input' | 'to'] = value
      }
    }
    else if (arg === '--json') {
      result.json = true
    }
    else if (arg === '--include-archived') {
      result.includeArchived = true
    }
    else if (arg === '--staged') {
      result.staged = true
    }
    else if (arg === '--maintenance') {
      result.maintenance = true
    }
    else if (arg === '--dry-run') {
      result.dryRun = true
    }
    else if (arg === '--recover') {
      result.recover = true
    }
  }
  if ((result.head && (!result.base || result.staged)) || (needsId && !result.id))
    throw new NotesError('INVALID_INPUT', 'show requires an ID; --head requires --base and excludes --staged.', undefined, 2)
  if (result.paths.some(path => !safePath(path) || /[*?]/.test(path)) || result.topics.some(topic => !topic.trim()))
    throw new NotesError('INVALID_INPUT', 'Supply concrete project-relative paths and nonempty topics.', undefined, 2)
  if ((isWrite && (!result.input || (result.dryRun && result.recover)))
    || (command === 'transition' && !['implemented', 'rejected'].includes(result.to ?? ''))) {
    throw new NotesError('INVALID_INPUT', 'Writes require --input; transition requires --to implemented|rejected; --dry-run excludes --recover.', undefined, 2)
  }
  if ((result.command === 'init' && !result.targets.length) || (result.dryRun && result.recover))
    throw new NotesError('INVALID_INPUT', 'init requires an explicit --target; --dry-run excludes --recover.', undefined, 2)
  return result
}

function changedFiles(target: Snapshot, baseline: Snapshot, index: NoteIndex, before: NoteIndex): string[] {
  // Ask Git for changed paths without executing external diff/textconv drivers or
  // loading every source file and binary into the Notes reader's memory cache.
  const paths = new Set(target.repository.changedPaths(target.kind, baseline.revision!, target.revision))
  for (const path of target.paths()) {
    if (!baseline.entries.has(path))
      paths.add(path)
  }
  // Governed Notes are also read directly, including ignored/untracked files.
  for (const [id, note] of index.notes) {
    const previous = before.notes.get(id)
    if (previous?.hash !== note.hash || previous.path !== note.path) {
      paths.add(note.path)
      if (previous)
        paths.add(previous.path)
    }
  }
  for (const [id, note] of before.notes) {
    if (!index.notes.has(id))
      paths.add(note.path)
  }
  return [...paths].filter(path => !isRuntime(path)).sort()
}

function maintenance(index: NoteIndex, target: Snapshot): Diagnostic[] {
  const review: Diagnostic[] = []
  for (const note of index.notes.values()) {
    if (note.lifecycle === 'archived')
      continue
    const unmatched = (note.metadata.scope.paths ?? []).filter(pattern => !target.paths().some(path => matchesPath(pattern, path) && target.exists(path)))
    if (unmatched.length)
      review.push({ code: 'SCOPE_MAINTENANCE', path: note.path, note_id: note.metadata.id, message: `Scope patterns have no current files; verify whether paths drifted or describe future work: ${unmatched.join(', ')}` })
    if (supersededBy(index, note.metadata.id).some(edge => edge.effective))
      review.push({ code: 'SUPERSESSION_MAINTENANCE', path: note.path, note_id: note.metadata.id, message: 'Review remaining guidance after supersession; full replacement alone does not establish complete absorption or permit deletion.' })
  }
  return review
}

export function run(args: string[], cwd = process.cwd(), stdin?: string): Result {
  const output: Result = { command: args[0] ?? '', result: 'ok', scope: {}, data: {}, diagnostics: [], review: [] }
  try {
    const input = options(args)
    if (input.command === 'init' || input.command === 'upgrade' || input.command === 'status')
      return manage({ ...input, command: input.command }, cwd)
    const root = findRoot(input.root, cwd)
    if (writeCommands.includes(input.command))
      return executeWrite(root, { command: input.command as WriteCommand, id: input.id, input: input.input!, to: input.to as 'implemented' | 'rejected' | undefined, dryRun: input.dryRun, recover: input.recover, base: input.base }, stdin)
    if (!input.head && !input.staged)
      assertNoTransaction(root)
    const repository = new Repository(root)
    const head = input.head ? repository.revision(input.head)! : undefined
    const base = input.command === 'check' ? repository.revision(input.base ?? 'HEAD', Boolean(input.base)) : undefined
    const target = repository.snapshot(head ? 'commit' : input.staged ? 'index' : 'worktree', head)
    output.scope = { root, snapshot: target.kind, base: base ?? null, head: head ?? null }
    const index = readIndex(target)
    output.diagnostics.push(...currentDiagnostics(index))
    if (input.command === 'show') {
      const note = index.notes.get(input.id!)
      if (!note)
        throw new NotesError('NOTE_NOT_FOUND', `No Note with ID ${input.id}.`, undefined, 2)
      output.data = { id: note.metadata.id, path: note.path, hash: note.hash, text: note.text, superseded_by: supersededBy(index, note.metadata.id) }
    }
    else if (input.command === 'context') {
      if (!output.diagnostics.length)
        output.data.notes = context(index, input.paths, input.topics, input.includeArchived)
      if (!input.paths.length && !input.topics.length)
        output.review.push({ code: 'SCOPE_REQUIRED', message: 'Only global pointers and their dependencies are returned. Provide --paths or --topic for the task scope.' })
    }
    else {
      const baseline = base ? repository.snapshot('commit', base) : undefined
      const before = baseline ? readIndex(baseline) : undefined
      if (before)
        output.diagnostics.push(...currentDiagnostics(before).map(item => ({ ...item, message: `Baseline: ${item.message}` })))
      const historical = checkHistory(target, index, baseline, before)
      output.diagnostics.push(...historical.diagnostics)
      output.review.push(...historical.review)
      const frozenPaths = new Set([...index.notes.values()].filter(note => note.lifecycle === 'archived').map(note => note.path))
      output.diagnostics.push(...checkLinks(target, target.paths().filter(path => /\.md$/i.test(path) && !frozenPaths.has(path) && !isRuntime(path))))
      if (baseline) {
        const changes = changedFiles(target, baseline, index, before!)
        const codeChanges = changes.filter(path => !path.startsWith(`${index.config.notes_dir}/`) && !path.startsWith(`${before!.config.notes_dir}/`) && !path.startsWith('.agent-notes/'))
        output.data.changed_paths = changes
        output.data.affected_notes = [...index.notes.values()].filter(note => note.lifecycle !== 'archived').flatMap((note) => {
          const reasons = matchReasons(note.metadata.scope, codeChanges, [])
          return reasons.length ? [{ id: note.metadata.id, path: note.path, reasons, changed: before?.notes.get(note.metadata.id)?.hash !== note.hash }] : []
        })
        if (codeChanges.length)
          output.review.push({ code: 'CHANGE_RATIONALE_REVIEW', message: 'Review base→target changes for durable rationale and same-PR Notes. Mechanical/local UI changes may need no Note; scope matches alone do not prove a writing obligation.' })
      }
      if (input.maintenance)
        output.review.push(...maintenance(index, target))
      output.data.notes_checked = index.notes.size
      output.data.structural_check = output.diagnostics.length ? 'failed' : 'passed'
    }
    if (output.diagnostics.length)
      output.result = output.diagnostics.some(item => item.code === 'UNSUPPORTED_FORMAT') ? 'invalid-input' : 'failed'
  }
  catch (error) {
    output.diagnostics.push(diagnostic(error))
    output.result = error instanceof NotesError && error.exitCode === 2 ? 'invalid-input' : 'failed'
  }
  return output
}

export function exitCode(result: Result): number {
  return { 'ok': 0, 'failed': 1, 'invalid-input': 2, 'needs-decision': 3 }[result.result]
}

export function render(result: Result): string {
  const lines = [`${result.command}: ${result.result}`, `snapshot: ${result.scope.snapshot ?? 'unavailable'}; base: ${result.scope.base ?? 'none'}${result.scope.head ? `; head: ${result.scope.head}` : ''}`]
  if (result.command === 'show' && typeof result.data.text === 'string') {
    lines.push(`${result.data.path} (${result.data.hash})`, result.data.text)
  }
  else if (result.command === 'context' && Array.isArray(result.data.notes)) {
    for (const note of result.data.notes)
      lines.push(`${note.id} — ${note.title} [${note.lifecycle}]`, `  ${note.path}`, `  read_when: ${note.read_when}`, `  matches: ${note.reasons.join(', ')}`, `  supersession: ${JSON.stringify({ supersedes: note.supersedes, superseded_by: note.superseded_by })}`)
    if (!result.data.notes.length)
      lines.push('No matching Notes.')
  }
  else {
    lines.push(JSON.stringify(result.data, null, 2))
  }
  for (const item of result.diagnostics)
    lines.push(`ERROR ${item.code}${item.path ? ` ${item.path}` : ''}: ${item.message}`)
  for (const item of result.review)
    lines.push(`REVIEW ${item.code}${item.path ? ` ${item.path}` : ''}: ${item.message}`)
  return lines.join('\n')
}
