import type { Target } from '../distribution/manifest'
import type { Options } from './arguments'
import process from 'node:process'
import { cancel, intro, isCancel, isCI, multiselect, select, text } from '@clack/prompts'
import { installationRoot } from '../distribution/manage'
import { readInstallation } from '../distribution/manifest'
import { NotesError } from '../notes/model'
import { readConfig } from '../notes/reader'
import { Repository } from '../notes/snapshot'
import { assertNoTransaction, recoveryView } from '../workflow/transaction'
import { notesDirectory } from './arguments'

export class InitCancelled extends Error {}

export interface InitPrompts {
  start: (root: string) => void
  targets: () => Promise<Target[] | symbol>
  directory: () => Promise<string | symbol>
  language: () => Promise<'zh-CN' | 'en' | symbol>
}

const terminal = { input: process.stdin, output: process.stderr }
const prompts: InitPrompts = {
  start: root => intro(`Agent Notes · ${root}`, terminal),
  targets: () => multiselect<Target>({ ...terminal, message: 'Installation targets', options: [{ value: 'agents', label: 'Agents (.agents)' }, { value: 'claude', label: 'Claude (.claude)' }], initialValues: ['agents'], required: true }),
  directory: () => text({ ...terminal, message: 'Notes directory', defaultValue: '.agents/notes', placeholder: '.agents/notes', validate: (value) => {
    const checked = notesDirectory.safeParse(value || '.agents/notes')
    return checked.success ? undefined : checked.error.issues[0].message
  } }),
  language: () => select<'zh-CN' | 'en'>({ ...terminal, message: 'Template language', options: [{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }], initialValue: 'zh-CN' }),
}

export function interactiveInit(input: Options, environment = { stdinTTY: process.stdin.isTTY, stderrTTY: process.stderr.isTTY, ci: isCI() || Boolean(process.env.CI && !['0', 'false'].includes(process.env.CI.toLowerCase())) }): boolean {
  return input.command === 'init' && Boolean(environment.stdinTTY && environment.stderrTTY)
    && !environment.ci && !input.json && input.interactive !== false
}

function initContext(input: Options, cwd: string): { input: Options, verify: () => void } {
  const root = installationRoot(input.root, cwd, true)
  // Complete recovery requests keep the manager's recover-before-read path.
  if (input.targets.length && input.notesDir && input.language)
    return { input: { ...input, root }, verify: () => {} }
  if (!input.recover)
    assertNoTransaction(root)
  const view = recoveryView(new Repository(root).snapshot('worktree'))
  const installation = readInstallation(view.source)
  const hasConfig = Boolean(view.source.read('.agent-notes/config.json'))
  if (installation && !hasConfig)
    throw new NotesError('CONFIG_CONFLICT', 'Installed configuration is missing; restore it explicitly.', '.agent-notes/config.json')
  const config = readConfig(view.source)
  if (hasConfig && ((input.notesDir && input.notesDir !== config.notes_dir) || (input.language && input.language !== config.language)))
    throw new NotesError('CONFIG_CONFLICT', 'Existing project configuration is preserved. Requested initialization options disagree with it.', '.agent-notes/config.json', 2)
  if (installation && input.targets.length && [...input.targets].sort().join() !== [...installation.targets].sort().join())
    throw new NotesError('TARGET_CONFLICT', 'Changing installation targets is not supported by v1.', '.agent-notes/install.json', 2)
  return {
    input: { ...input, root, targets: input.targets.length ? input.targets : installation?.targets ?? [], notesDir: input.notesDir ?? (hasConfig ? config.notes_dir : undefined), language: input.language ?? (hasConfig ? config.language : undefined) },
    verify: view.verify,
  }
}

function finish(input: Options): Options {
  if (!input.targets.length)
    throw new NotesError('INVALID_INPUT', 'New installations require --target agents and/or --target claude when interaction is disabled.', undefined, 2)
  return { ...input, notesDir: input.notesDir ?? '.agents/notes', language: input.language ?? 'zh-CN' }
}

/** Deterministic path for scripts and synchronous callers; shares context and defaults with the wizard. */
export function completeInit(input: Options, cwd: string): Options {
  const context = initContext(input, cwd)
  const complete = finish(context.input)
  context.verify()
  return complete
}

async function collectInit(input: Options, cwd: string, adapter: InitPrompts): Promise<Options> {
  const context = initContext(input, cwd)
  const complete = context.input
  const answer = async <T>(value: Promise<T | symbol>): Promise<T> => {
    const result = await value
    if (isCancel(result) || typeof result === 'symbol')
      throw new InitCancelled('Initialization cancelled.')
    return result
  }
  if (!complete.targets.length || !complete.notesDir || !complete.language)
    adapter.start(complete.root!)
  if (!complete.targets.length)
    complete.targets = await answer(adapter.targets())
  if (!complete.notesDir)
    complete.notesDir = await answer(adapter.directory())
  if (!complete.language)
    complete.language = await answer(adapter.language())
  const resolved = finish(complete)
  context.verify()
  return resolved
}

export async function promptInit(input: Options, cwd: string, adapter: InitPrompts = prompts): Promise<Options> {
  // Clack's core wraps using stdout.columns even when its output is stderr.
  // Supply a width for piped stdout, and restore the stream after the questions.
  const columns = process.stdout.columns
  if (adapter === prompts && !columns)
    process.stdout.columns = process.stderr.columns || 80
  try {
    return await collectInit(input, cwd, adapter)
  }
  finally {
    if (adapter === prompts && !columns) {
      if (columns === undefined)
        Reflect.deleteProperty(process.stdout, 'columns')
      else process.stdout.columns = columns
    }
  }
}

export function reportCancellation(): void {
  cancel('Initialization cancelled.', terminal)
}
