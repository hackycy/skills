import type { CAC } from 'cac'
import { cac } from 'cac'
import { z } from 'zod'
import { NotesError } from '../notes/model'
import { safePath } from '../notes/snapshot'
import { writeCommands } from '../workflow/input'

const commands = ['context', 'show', 'check', 'init', 'upgrade', 'status', 'create', 'update', 'transition', 'archive', 'prune'] as const
const nonempty = z.string().refine(value => Boolean(value.trim()), 'Supply a nonempty value.')
export const notesDirectory = nonempty.refine(value => safePath(value) && !/[\s*?[\]#!]/.test(value)
  && !/(?:^|\/)(?:\.git|node_modules)(?:\/|$)/i.test(value)
  && !/^\.agent-notes(?:\/|$)/i.test(value), 'Supply a literal project-relative Notes directory without whitespace or Git wildcards.')
const repeated = <T extends z.ZodType>(schema: T): z.ZodType<z.output<T>[]> => z.union([schema, z.array(schema)]).optional().transform(value => value === undefined ? [] : Array.isArray(value) ? value : [value])
const flag = z.boolean().optional().default(false)
const schema = z.strictObject({
  command: z.enum(commands),
  id: nonempty.optional(),
  root: nonempty.optional(),
  paths: repeated(nonempty.refine(value => safePath(value) && !/[*?]/.test(value), 'Supply concrete project-relative paths.')),
  topic: repeated(nonempty),
  target: repeated(z.enum(['agents', 'claude'])).refine(values => new Set(values).size === values.length, 'Targets must be distinct: agents and/or claude.'),
  notesDir: notesDirectory.optional(),
  language: z.enum(['zh-CN', 'en']).optional(),
  json: flag,
  includeArchived: flag,
  staged: flag,
  maintenance: flag,
  dryRun: flag,
  recover: flag,
  interactive: z.boolean().optional(),
  base: nonempty.optional(),
  head: nonempty.optional(),
  input: nonempty.optional(),
  to: z.enum(['implemented', 'rejected']).optional(),
}).superRefine((value, ctx) => {
  const issue = (message: string): void => ctx.addIssue({ code: 'custom', message })
  if ((value.command === 'show' || (writeCommands.includes(value.command) && value.command !== 'create')) && !value.id)
    issue(`${value.command} requires an ID.`)
  if (value.head && (!value.base || value.staged))
    issue('--head requires --base and excludes --staged.')
  if (value.dryRun && value.recover)
    issue('--dry-run excludes --recover.')
  if (writeCommands.includes(value.command) && !value.input)
    issue('Writes require --input.')
  if (value.command === 'transition' && !value.to)
    issue('transition requires --to implemented|rejected.')
}).transform(({ topic, target, ...value }) => ({ ...value, topics: topic, targets: target }))

export type Options = z.output<typeof schema>
export interface ParsedArguments {
  command: string
  json: boolean
  input?: Options
  help?: string
  error?: unknown
}

function declarations(): CAC {
  const cli = cac('agent-notes')
    .option('--root <project>', 'Project root')
    .option('--json', 'Output one Result object')
    .help()
  // Capture help through cac's callback; never let it print into JSON output.
  cli.showHelpOnExit = false
  cli.globalCommand.ignoreOptionDefaultValue()
  const init = cli.command('init', 'Install runtime and static skill entries')
    .option('--target <agents|claude>', 'Installation target (repeat for both)')
    .option('--notes-dir <path>', 'Notes directory (default: .agents/notes)')
    .option('--language <zh-CN|en>', 'Template language (default: zh-CN)')
    .option('--no-interactive', 'Disable initialization questions')
  const upgrade = cli.command('upgrade', 'Replace or repair installed assets')
  cli.command('status', 'Inspect installation and asset integrity')
  cli.command('context', 'Find relevant Note pointers')
    .option('--paths <paths...>', 'Concrete project-relative paths (repeatable)')
    .option('--topic <topic>', 'Exact topic (repeatable)')
    .option('--include-archived', 'Include archived Notes')
  cli.command('show <id>', 'Read a Note and its hash')
  cli.command('check', 'Validate Notes and history')
    .option('--base <commit>', 'History baseline')
    .option('--head <commit>', 'Target commit; requires --base, excludes --staged')
    .option('--staged', 'Read the Git index')
    .option('--maintenance', 'Report maintenance candidates')
  const writes = writeCommands.map(name => cli.command(`${name}${name === 'create' ? '' : ' <id>'}`, `${name} a Note`)
    .option('--input <json-file|->', 'Complete operation materials; - reads stdin'))
  writes.find(command => command.name === 'transition')!.option('--to <implemented|rejected>', 'Target status')
  for (const command of writes.filter(command => ['archive', 'prune'].includes(command.name)))
    command.option('--base <commit>', 'Trusted history baseline')
  for (const command of [init, upgrade, ...writes]) {
    command.option('--dry-run', 'Preview without writes')
      .option('--recover', 'Recover an interrupted transaction before executing')
  }
  return cli
}

const valuePrefix = 'agent-notes:literal:'
/** Preserve the published multi-value --paths syntax and literal numeric values (mri otherwise coerces them). */
function normalize(args: string[], cli: ReturnType<typeof declarations>): string[] {
  const declared = [...cli.globalCommand.options, ...cli.commands.flatMap(command => command.options)]
  const names = new Map(declared.flatMap(option => [...option.rawName.matchAll(/(?:^|,)\s*(-[\w-]+)/g)].map(match => [match[1], option] as const)))
  const seen = new Set<string>()
  const normalized: string[] = []
  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    if (token === '--') {
      normalized.push(...args.slice(index))
      break
    }
    if (!token.startsWith('-') || token === '-') {
      normalized.push(token)
      continue
    }
    const equal = token.indexOf('=')
    const name = equal < 0 ? token : token.slice(0, equal)
    const option = names.get(name)
    if (!option || (seen.has(option.name) && !['paths', 'topic', 'target'].includes(option.name)))
      throw new NotesError('INVALID_INPUT', `Unknown, misplaced or duplicate argument: ${name}`, undefined, 2)
    seen.add(option.name)
    if (!option.required) {
      if (equal >= 0)
        throw new NotesError('INVALID_INPUT', `${name} is a switch and does not accept a value.`, undefined, 2)
      normalized.push(token)
      continue
    }
    const value = equal < 0 ? args[++index] : token.slice(equal + 1)
    if (!value || value.startsWith('--'))
      throw new NotesError('INVALID_INPUT', `Missing value for ${name}.`, undefined, 2)
    normalized.push(name, `${valuePrefix}${value}`)
    if (name === '--paths') {
      while (args[index + 1] && !args[index + 1].startsWith('--'))
        normalized.push(name, `${valuePrefix}${args[++index]}`)
    }
  }
  return normalized
}

function helpText(cli: ReturnType<typeof declarations>): string {
  let result = ''
  const captured = Symbol('help captured')
  cli.globalCommand.helpCallback = (sections) => {
    result = sections.map(section => section.title ? `${section.title}:\n${section.body}` : section.body).join('\n\n')
    throw captured
  }
  try {
    cli.outputHelp()
  }
  catch (error) {
    if (error !== captured)
      throw error
  }
  return result
}

export function parseArguments(args: string[]): ParsedArguments {
  const cli = declarations()
  // Parse output context independently so even malformed arguments retain JSON mode.
  const context = declarations()
  try {
    context.parse(['node', 'agent-notes', ...args], { run: false })
  }
  catch { /* Conflicting dotted properties can fail inside mri; validate them below. */ }
  const switches = args.slice(0, !args.includes('--') ? args.length : args.indexOf('--'))
  const parsed: ParsedArguments = { command: context.matchedCommandName ?? String(context.args[0] ?? ''), json: switches.includes('--json') }
  try {
    cli.parse(['node', 'agent-notes', ...normalize(args, cli)], { run: false })
    const command = cli.matchedCommand
    const active = command ?? cli.globalCommand
    active.checkUnknownOptions()
    active.checkOptionValue()
    if ((!command && cli.args.length) || (cli.options['--'] as string[]).length)
      throw new Error('Unknown command or misplaced positional arguments. Use --help.')
    const { help, h: _alias, '--': _rest, ...values } = cli.options
    if (help !== undefined && typeof help !== 'boolean')
      throw new Error('Invalid --help option.')
    if (help || !args.length) {
      active.checkUnusedArgs()
      parsed.help = helpText(cli)
      return parsed
    }
    if (!command)
      throw new Error('Supply a command. Use --help.')
    command.checkUnusedArgs()
    const decode = (value: unknown): unknown => Array.isArray(value) ? value.map(decode) : typeof value === 'string' && value.startsWith(valuePrefix) ? value.slice(valuePrefix.length) : value
    const result = schema.safeParse({ ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, decode(value)])), command: command.name, id: cli.args[0] })
    if (!result.success)
      throw new Error(result.error.issues.map(issue => `${issue.path.join('.') || 'arguments'}: ${issue.message}`).join(' '))
    parsed.input = result.data
    parsed.json = result.data.json
  }
  catch (error) {
    parsed.error = error instanceof NotesError ? error : new NotesError('INVALID_INPUT', error instanceof Error ? error.message : String(error), undefined, 2)
  }
  return parsed
}

export function options(args: string[]): Options {
  const parsed = parseArguments(args)
  if (parsed.error)
    throw parsed.error
  if (!parsed.input)
    throw new NotesError('INVALID_INPUT', 'Expected command options, received help.', undefined, 2)
  return parsed.input
}

/** Older locked runtimes understand this canonical command-first, separated-value syntax. */
export function runtimeArguments(input: Options): string[] {
  const args: string[] = [input.command]
  if (input.id !== undefined)
    args.push(input.id)
  for (const [key, flag] of Object.entries({ root: 'root', base: 'base', head: 'head', input: 'input', to: 'to', notesDir: 'notes-dir', language: 'language' }) as [keyof Options, string][]) {
    if (input[key] !== undefined)
      args.push(`--${flag}`, String(input[key]))
  }
  for (const [flag, values] of [['paths', input.paths], ['topic', input.topics], ['target', input.targets]] as const) {
    for (const value of values)
      args.push(`--${flag}`, value)
  }
  for (const [key, flag] of Object.entries({ json: 'json', includeArchived: 'include-archived', staged: 'staged', maintenance: 'maintenance', dryRun: 'dry-run', recover: 'recover' }) as [keyof Options, string][]) {
    if (input[key])
      args.push(`--${flag}`)
  }
  return args
}
