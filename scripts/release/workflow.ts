import type { ReleaseArguments, ReleaseInput } from './input'
import type { ReleasePrompts, TerminalEnvironment, WizardState } from './interactive'
import type { Graph, Plan } from './model'
import process from 'node:process'
import { authPreflight, execute } from './execute'
import { checkPreviousRecords, dispatch, githubPreflight, noActiveRelease } from './github'
import { completeArguments, missingArguments, requireComplete, validateArguments } from './input'
import { chooseAction, collectReleaseInput, prompts, repairPlanningInput, showPlan, terminalEnvironment, withTerminalWidth } from './interactive'
import { loadGraph, parseTag } from './model'
import { readRegistry } from './npm'
import { createPlan, fixedPlan } from './plan'
import { checkTags, lock, prepare, synchronizedMain } from './prepare'
import { existsRef, git } from './process'

interface Analysis { graph: Graph, repo: string, plan: Plan, commit: string }

async function analyze(root: string, input: ReleaseInput, state?: WizardState, adapter = prompts): Promise<Analysis> {
  const ref = input.kind === 'tag' ? `refs/tags/${input.tag}` : 'HEAD'
  const commit = await existsRef(root, ref)
  if (!commit)
    throw new Error(`缺少本地源码 ${ref}；请先运行 git fetch origin main --tags 同步标签`)
  const name = input.kind === 'tag' ? parseTag(input.tag).name : input.package
  const graph = loadGraph(root, name, input.kind === 'tag' ? ref : undefined)
  const local = input.mode === 'local'
  const repo = await githubPreflight(root, graph, local)
  if (local) {
    await authPreflight(root, true)
    await noActiveRelease(root, repo)
  }
  let plan: Plan
  if (input.kind === 'tag') {
    const main = (await git(root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/main')).split(/\s+/)[0]
    plan = await fixedPlan(root, graph, input.tag, main)
  }
  else {
    await synchronizedMain(root)
    await checkPreviousRecords(root, repo, graph, readRegistry)
    while (true) {
      try {
        plan = await createPlan(root, graph, name, input.version, input.overrides, readRegistry)
        break
      }
      catch (error) {
        if (!state || !await repairPlanningInput(state, graph, error, adapter))
          throw error
      }
    }
    await checkTags(root, plan)
  }
  if (await existsRef(root, ref) !== commit)
    throw new Error('生成计划期间源码 commit 已变化，请重新运行')
  return { graph, repo, plan, commit }
}

async function publish(root: string, input: ReleaseInput, analysis: Analysis): Promise<void> {
  try {
    if (input.kind === 'new')
      await prepare(root, analysis.graph, analysis.plan)
    if (input.mode === 'local')
      await execute(root, analysis.plan.tag, true, input.artifactsDir)
    else
      await dispatch(root, analysis.repo, analysis.plan)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\n定版或发布已开始，请保留改动及产物；仅对已推送目标使用 --tag 重试，尚未推送时先核对工作区和本地 tag，绝不自动 reset。详见 AGENTS.md 的 CLI Releases。`, { cause: error })
  }
}

interface ReleaseOptions {
  cwd?: string
  environment?: TerminalEnvironment
  adapter?: ReleasePrompts
  printPlan?: (plan: Plan) => void
}

export async function runRelease(args: ReleaseArguments, options: ReleaseOptions = {}): Promise<void> {
  validateArguments(args)
  const environment = options.environment ?? terminalEnvironment()
  const interactive = missingArguments(args).length > 0 && !environment.ci && !!environment.stdinTTY && !!environment.stderrTTY
  if (!interactive)
    requireComplete(args)
  const adapter = options.adapter ?? prompts
  const printPlan = options.printPlan ?? (plan => console.log(JSON.stringify(plan, null, 2)))
  const root = await git(options.cwd ?? process.cwd(), 'rev-parse', '--show-toplevel')
  if (!interactive) {
    const input = completeArguments(args)
    const releaseLock = input.dryRun ? undefined : await lock(root)
    try {
      if (!input.dryRun)
        await git(root, 'fetch', 'origin', 'main', '--tags')
      const analysis = await analyze(root, input)
      printPlan(analysis.plan)
      if (!input.dryRun)
        await publish(root, input, analysis)
    }
    finally { await releaseLock?.() }
    return
  }
  await withTerminalWidth(adapter, async () => {
    const state = await collectReleaseInput(args, root, adapter)
    const input = state.input
    let preview = await analyze(root, input, state, adapter)
    const display = (analysis: Analysis) => {
      printPlan(analysis.plan)
      showPlan(input, analysis.plan, analysis.commit, adapter)
    }
    display(preview)
    if (input.dryRun) {
      adapter.finish('预览完成，未执行发布。')
      return
    }
    let action = await chooseAction(adapter)
    if (action !== 'publish') {
      adapter.finish(action === 'cancel' ? '已取消发布。' : '预览完成，未执行发布。')
      return
    }
    const releaseLock = await lock(root)
    try {
      // Only an explicit publish action may fetch or acquire the release lock.
      // Rebuild the plan from current source and registry data under that lock.
      while (true) {
        await git(root, 'fetch', 'origin', 'main', '--tags')
        const current = await analyze(root, input, state, adapter)
        if (current.commit === preview.commit && JSON.stringify(current.plan) === JSON.stringify(preview.plan)) {
          await publish(root, input, current)
          adapter.finish('发布完成。')
          return
        }
        adapter.info('源码 commit 或发布计划已变化，请重新检查。')
        display(current)
        action = await chooseAction(adapter)
        if (action !== 'publish') {
          adapter.finish(action === 'cancel' ? '已取消发布。' : '预览完成，未执行发布。')
          return
        }
        preview = current
      }
    }
    finally { await releaseLock() }
  })
}
