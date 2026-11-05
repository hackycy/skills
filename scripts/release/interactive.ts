import type { ReleaseArguments, ReleaseInput } from './input'
import type { Graph, Manifest, Package, Plan, Registration } from './model'
import { statSync } from 'node:fs'
import process from 'node:process'
import { cancel, intro, isCI, multiselect, note, outro, select, text } from '@clack/prompts'
import { readOverrides } from './input'
import { bump, compare, loadGraph, parseTag, source, upgrade } from './model'
import { PlanningInputError } from './plan'
import { git } from './process'

interface Choice { value: string, label: string, hint?: string }
interface TextOptions { defaultValue?: string, validate?: (value: string) => string | undefined }
export interface ReleasePrompts {
  start: (root: string) => void
  info: (message: string) => void
  select: (message: string, options: Choice[], initialValue: string) => Promise<string | symbol>
  text: (message: string, options?: TextOptions) => Promise<string | symbol>
  multiselect: (message: string, options: Choice[]) => Promise<string[] | symbol>
  finish: (message: string) => void
}

export interface TerminalEnvironment { stdinTTY?: boolean, stderrTTY?: boolean, ci: boolean }
export function terminalEnvironment(): TerminalEnvironment {
  return {
    stdinTTY: process.stdin.isTTY,
    stderrTTY: process.stderr.isTTY,
    ci: isCI() || Boolean(process.env.CI && !['0', 'false'].includes(process.env.CI.toLowerCase())),
  }
}

export const prompts: ReleasePrompts = {
  start: root => intro(`发布 · ${root}`, { output: process.stderr }),
  info: message => note(message, undefined, { output: process.stderr }),
  select: (message, options, initialValue) => select({ input: process.stdin, output: process.stderr, message, options, initialValue }),
  text: (message, options) => text({ input: process.stdin, output: process.stderr, message, ...options, validate: value => options?.validate?.(value ?? '') }),
  multiselect: (message, options) => multiselect({ input: process.stdin, output: process.stderr, message, options, required: false }),
  finish: message => outro(message, { output: process.stderr }),
}

export class ReleaseCancelled extends Error {
  readonly exitCode = 130
}

async function answer<T>(result: Promise<T | symbol>): Promise<T> {
  const value = await result
  if (typeof value === 'symbol')
    throw new ReleaseCancelled('已取消发布。')
  return value
}

export function reportCancellation(): void {
  cancel('已取消发布。', { output: process.stderr })
}

export interface WizardState {
  input: ReleaseInput
  explicitVersion: boolean
  explicitOverrides: Set<string>
}

function validation(check: () => void): string | undefined {
  try {
    check()
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export async function chooseVersion(pkg: Pick<Package, 'name' | 'manifest'>, adapter: ReleasePrompts, minimum = bump(pkg.manifest.version, 1)): Promise<string> {
  const previous = pkg.manifest.version
  if (previous === '0.0.0') {
    adapter.info(`${pkg.name} 首次发布：0.0.0 → 0.1.0`)
    return '0.1.0'
  }
  const options = ([1, 2, 3] as const).map((level, index) => ({ value: bump(previous, level), label: `${['patch', 'minor', 'major'][index]} → ${bump(previous, level)}` })).filter(option => compare(option.value, minimum) >= 0)
  options.push({ value: 'custom', label: '自定义版本' })
  const selected = await answer(adapter.select(`${pkg.name} 目标版本（当前 ${previous}，最低 ${minimum}）`, options, options[0].value))
  const validate = (value: string) => validation(() => {
    upgrade(previous, value)
    if (compare(value, minimum) < 0)
      throw new Error(`版本不能低于 ${minimum}`)
  })
  const version = selected === 'custom'
    ? await answer(adapter.text('输入稳定版本号', { defaultValue: minimum, validate }))
    : selected
  const error = validate(version)
  if (error)
    throw new Error(error)
  return version
}

function cliChoices(root: string): Choice[] {
  const registrations = JSON.parse(source(root, 'scripts/release/packages.json')) as Registration[]
  return registrations.filter(pkg => pkg.role === 'cli').map((pkg) => {
    const manifest = JSON.parse(source(root, `${pkg.path}/package.json`)) as Manifest
    return { value: pkg.name, label: pkg.name, hint: `当前 ${manifest.version}` }
  })
}

async function chooseTag(root: string, adapter: ReleasePrompts): Promise<string> {
  const names = new Set(cliChoices(root).map(option => option.value))
  const tags = (await git(root, 'tag', '--list')).split('\n').filter((tag) => {
    try {
      return names.has(parseTag(tag).name)
    }
    catch { return false }
  }).sort((a, b) => {
    const left = parseTag(a)
    const right = parseTag(b)
    return left.name.localeCompare(right.name) || compare(right.version, left.version)
  })
  const selected = tags.length
    ? await answer(adapter.select('选择已有 CLI tag', [...tags.map(tag => ({ value: tag, label: tag })), { value: 'manual', label: '手动输入 tag' }], tags[0]))
    : 'manual'
  return selected === 'manual'
    ? answer(adapter.text('输入已有 CLI tag', { validate: value => validation(() => { parseTag(value) }) }))
    : selected
}

async function fillOverride(state: WizardState, graph: Graph, name: string, adapter: ReleasePrompts, minimum?: string): Promise<void> {
  const pkg = graph.packages.get(name)!
  const version = state.input.kind === 'new' && name === state.input.package
    ? state.input.version
    : await chooseVersion(pkg, adapter, minimum)
  const notes = await answer(adapter.text(`${name} 审核说明${pkg.role === 'cli' ? '（正式发布说明仍取自 CHANGELOG）' : '（用于发布说明）'}`, {
    validate: value => value.trim() ? undefined : '审核说明不能为空',
  }))
  if (!notes.trim())
    throw new Error('审核说明不能为空')
  state.input.overrides[name] = { version, notes: notes.trim() }
}

export async function collectReleaseInput(args: ReleaseArguments, root: string, adapter: ReleasePrompts): Promise<WizardState> {
  const overrides = readOverrides(args)
  adapter.start(root)
  const kind = args.tag || args.artifactsDir
    ? 'tag'
    : args.package || args.version || args.override
      ? 'new'
      : await answer(adapter.select('选择发布任务', [{ value: 'new', label: '准备新版本' }, { value: 'tag', label: '继续已有 tag' }], 'new'))
  let input: ReleaseInput
  const common = { dryRun: args.dryRun === true, overrides, artifactsDir: args.artifactsDir }
  if (kind === 'tag') {
    input = { ...common, kind: 'tag', tag: args.tag ?? await chooseTag(root, adapter), mode: 'local' }
  }
  else {
    let name = args.package
    if (!name) {
      const choices = cliChoices(root)
      if (!choices.length)
        throw new Error('没有已登记的 CLI，请检查 scripts/release/packages.json')
      if (choices.length === 1) {
        name = choices[0].value
        adapter.info(`已选择 ${name}（${choices[0].hint}）`)
      }
      else {
        name = await answer(adapter.select('选择发布 CLI', choices, choices[0].value))
      }
    }
    const graph = loadGraph(root, name)
    const version = args.version ?? overrides[name]?.version ?? await chooseVersion(graph.packages.get(name)!, adapter)
    upgrade(graph.packages.get(name)!.manifest.version, version)
    input = { ...common, kind: 'new', package: name, version, mode: 'local' }
  }
  input.mode = args.mode as ReleaseInput['mode'] | undefined ?? (args.artifactsDir
    ? 'local'
    : await answer(adapter.select('选择发布方式', [
      { value: 'local', label: '本机发布', hint: '需要 npm 登录和 2FA' },
      { value: 'ci', label: 'GitHub Actions 发布', hint: '本地定版后交给 CI' },
    ], 'local')) as ReleaseInput['mode'])
  const state: WizardState = { input, explicitVersion: !!args.version || (input.kind === 'new' && !!overrides[input.package]), explicitOverrides: new Set(Object.keys(overrides)) }
  if (input.kind === 'new') {
    const graph = loadGraph(root, input.package)
    const choices = graph.publishOrder.filter(pkg => !state.explicitOverrides.has(pkg.name)).map(pkg => ({ value: pkg.name, label: pkg.name, hint: `当前 ${pkg.manifest.version}` }))
    if (choices.length && await answer(adapter.select('是否手动覆盖包的版本和审核说明？', [{ value: 'no', label: '跳过，按现有规则分析' }, { value: 'yes', label: '填写覆盖' }], 'no')) === 'yes') {
      for (const name of await answer(adapter.multiselect('选择需要覆盖的包', choices)))
        await fillOverride(state, graph, name, adapter)
    }
  }
  else if (input.mode === 'local' && !input.artifactsDir) {
    input.artifactsDir = (await answer(adapter.text('原始产物目录（留空沿用现有恢复逻辑）', {
      validate: value => value.trim()
        ? validation(() => {
            if (!statSync(value.trim()).isDirectory())
              throw new Error('请输入已有目录')
          })
        : undefined,
    }))).trim() || undefined
  }
  return state
}

export async function repairPlanningInput(state: WizardState, graph: Graph, error: unknown, adapter: ReleasePrompts): Promise<boolean> {
  if (!(error instanceof PlanningInputError) || state.explicitOverrides.has(error.packageName))
    return false
  const input = state.input
  if (input.kind !== 'new')
    return false
  if (error.kind === 'version') {
    const cli = error.packageName === input.package
    if (cli ? state.explicitVersion : !input.overrides[error.packageName])
      return false
    adapter.info(error.message)
    const version = await chooseVersion(graph.packages.get(error.packageName)!, adapter, error.minimumVersion)
    if (cli)
      input.version = version
    if (input.overrides[error.packageName])
      input.overrides[error.packageName].version = version
  }
  else {
    adapter.info(error.message)
    await fillOverride(state, graph, error.packageName, adapter)
  }
  return true
}

export function showPlan(input: ReleaseInput, plan: Plan, commit: string, adapter: ReleasePrompts): void {
  adapter.info([
    `发布方式：${input.mode === 'local' ? '本机发布' : 'GitHub Actions'}`,
    `源码 commit：${commit}`,
    `目标 tag：${plan.tag}`,
    ...plan.targets.map(target => `${target.name}：${target.previous} → ${target.version}\n${target.notes}`),
    `复用依赖：${plan.reuse.map(pkg => `${pkg.name}@${pkg.version}`).join('、') || '无'}`,
    `构建：${plan.build.join(' → ')}`,
    input.kind === 'new' ? '发布将更新版本与 CHANGELOG、创建 commit/tag 并推送，然后执行发布。' : '发布将继续此固定 tag 的发布及记录。',
  ].join('\n\n'))
}

export function chooseAction(adapter: ReleasePrompts): Promise<string> {
  return answer(adapter.select('下一步', [{ value: 'publish', label: '发布' }, { value: 'preview', label: '仅预览' }, { value: 'cancel', label: '取消' }], 'preview'))
}

export async function withTerminalWidth<T>(adapter: ReleasePrompts, run: () => Promise<T>): Promise<T> {
  // Clack wraps against stdout even when prompts are rendered to stderr.
  const columns = process.stdout.columns
  if (adapter === prompts && !columns)
    process.stdout.columns = process.stderr.columns || 80
  try {
    return await run()
  }
  finally {
    if (adapter === prompts && !columns) {
      if (columns === undefined)
        Reflect.deleteProperty(process.stdout, 'columns')
      else process.stdout.columns = columns
    }
  }
}
