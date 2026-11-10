import type { Options } from './arguments'
import process from 'node:process'
import { cancel, intro, isCancel, isCI, multiselect, select, text } from '@clack/prompts'
import { integrationChoices } from '../distribution/integrations'
import { defaultNotesRoot, layoutFromSnapshot, notesLayout } from '../distribution/layout'
import { installationRoot } from '../distribution/manage'
import { readInstallation } from '../distribution/manifest'
import { NotesError } from '../notes/model'
import { readConfig } from '../notes/reader'
import { Repository } from '../notes/snapshot'
import { recoveryView } from '../workflow/recovery'
import { assertNoTransaction } from '../workflow/transaction'
import { notesDirectory } from './arguments'

export class InitCancelled extends Error {}

export interface InitPrompts {
  start: (root: string) => void
  hosts: (initial: string[]) => Promise<string[] | symbol>
  directory: () => Promise<string | symbol>
  language: () => Promise<'zh-CN' | 'en' | symbol>
}

const terminal = { input: process.stdin, output: process.stderr }
const prompts: InitPrompts = {
  start: root => intro(`Agent Notes · ${root}`, terminal),
  hosts: initial => multiselect<string>({ ...terminal, message: 'Project integrations', options: integrationChoices().map(item => ({ value: item.id, label: item.label })), initialValues: initial, required: true }),
  directory: () => text({ ...terminal, message: 'Notes directory', defaultValue: '.agents/notes', placeholder: '.agents/notes', validate: (value) => {
    const checked = notesDirectory.safeParse(value || '.agents/notes')
    return checked.success ? undefined : checked.error.issues[0].message
  } }),
  language: () => select<'zh-CN' | 'en'>({ ...terminal, message: 'Template language', options: [{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }], initialValue: 'zh-CN' }),
}

export function interactiveInit(input: Options, environment = { stdinTTY: process.stdin.isTTY, stderrTTY: process.stderr.isTTY, ci: isCI() || Boolean(process.env.CI && !['0', 'false'].includes(process.env.CI.toLowerCase())) }): boolean {
  return ['install', 'hosts set'].includes(input.command) && Boolean(environment.stdinTTY && environment.stderrTTY)
    && !environment.ci && !input.json && input.interactive !== false
}

function initContext(input: Options, cwd: string): { input: Options, verify: () => void } {
  const root = installationRoot(input.root, cwd, true)
  // Complete recovery requests keep the manager's recover-before-read path.
  if (input.hosts.length && input.notesDir && input.language)
    return { input: { ...input, root }, verify: () => {} }
  if (!input.recover)
    assertNoTransaction(root)
  const view = recoveryView(new Repository(root).snapshot('worktree'))
  const layout = layoutFromSnapshot(view.source) ?? notesLayout(input.notesDir ?? defaultNotesRoot)
  const installation = readInstallation(view.source, layout)
  const hasConfig = Boolean(view.source.read(layout.configPath))
  if (installation && !hasConfig)
    throw new NotesError('CONFIG_CONFLICT', 'Installed configuration is missing; restore it explicitly.', layout.configPath)
  const config = readConfig(view.source, layout)
  if (hasConfig && ((input.notesDir && input.notesDir !== config.notes_dir) || (input.language && input.language !== config.language)))
    throw new NotesError('CONFIG_CONFLICT', 'Existing project configuration is preserved. Requested initialization options disagree with it.', layout.configPath, 2)
  if (input.command === 'install' && installation && input.hosts.length && [...input.hosts].sort().join() !== [...installation.integrations].sort().join())
    throw new NotesError('HOSTS_SET_REQUIRED', 'Use hosts set to change the complete integration set.', layout.installPath, 2)
  return {
    input: { ...input, root, hosts: input.hosts.length ? input.hosts : input.command === 'hosts set' ? [] : installation?.integrations ?? [], notesDir: input.notesDir ?? (hasConfig ? config.notes_dir : undefined), language: input.language ?? (hasConfig ? config.language : undefined) },
    verify: view.verify,
  }
}

function finish(input: Options): Options {
  if (!input.hosts.length) {
    if (input.command === 'hosts set')
      throw new NotesError('INVALID_INPUT', 'hosts set requires a complete nonempty --host set.', undefined, 2)
    input = { ...input, hosts: integrationChoices().filter(item => item.default).map(item => item.id) }
  }
  if (input.hosts.some(id => !integrationChoices().some(item => item.id === id)))
    throw new NotesError('UNKNOWN_INTEGRATION', 'Unknown integration; use tool update before choosing a newer host.', undefined, 2)
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
  if (!complete.hosts.length || !complete.notesDir || !complete.language)
    adapter.start(complete.root!)
  if (!complete.hosts.length) {
    const source = recoveryView(new Repository(complete.root!).snapshot('worktree')).source
    const initial = readInstallation(source)?.integrations ?? integrationChoices().filter(item => item.default).map(item => item.id)
    complete.hosts = await answer(adapter.hosts(initial))
  }
  if (input.command === 'install' && !complete.notesDir)
    complete.notesDir = await answer(adapter.directory())
  if (input.command === 'install' && !complete.language)
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
