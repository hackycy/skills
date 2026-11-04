import type { Graph, Plan, Target } from './model'
import type { ReadRegistry } from './npm'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { compare, tagFor, tarballName } from './model'
import { readRegistry } from './npm'
import { command, existsRef, git } from './process'

interface Run { databaseId: number, status: string, url: string, displayTitle: string }
interface Release { body: string, assets: { name: string }[], isDraft: boolean }

export async function repository(root: string): Promise<string> {
  const remote = await git(root, 'remote', 'get-url', 'origin')
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)
  if (!match)
    throw new Error('origin 必须是 GitHub 仓库的 HTTPS 或 SSH URL')
  return match[1]
}

export async function githubPreflight(root: string, graph: Graph, local: boolean): Promise<string> {
  const repo = await repository(root)
  await command(root, 'gh', ['auth', 'status'])
  const info = JSON.parse(await command(root, 'gh', ['repo', 'view', repo, '--json', 'isPrivate,viewerPermission,defaultBranchRef'])) as {
    isPrivate: boolean
    viewerPermission: string
    defaultBranchRef: { name: string }
  }
  if (info.defaultBranchRef.name !== 'main' || !['ADMIN', 'MAINTAIN', 'WRITE'].includes(info.viewerPermission))
    throw new Error('发布需要 main 默认分支及仓库写权限')
  if (!local && info.isPrivate)
    throw new Error('CI provenance 需要公开 GitHub 仓库')
  for (const pkg of graph.publishOrder) {
    if (pkg.manifest.repository?.url !== `git+https://github.com/${repo}.git`)
      throw new Error(`repository 元数据与 origin 不符：${pkg.name}`)
  }
  return repo
}

export async function noActiveRelease(root: string, repo: string): Promise<void> {
  for (const status of ['queued', 'in_progress', 'waiting', 'pending', 'requested']) {
    const rows = await command(root, 'gh', ['api', '--paginate', `repos/${repo}/actions/workflows/release.yml/runs?per_page=100&status=${status}`, '--jq', '.workflow_runs[] | .html_url'])
    if (rows.trim())
      throw new Error(`本地发布前须等仓库内发布队列清空：\n${rows}`)
  }
}

export async function checkPreviousRecords(root: string, repo: string, graph: Graph, read: ReadRegistry): Promise<void> {
  for (const pkg of graph.publishOrder) {
    const version = pkg.manifest.version
    const tag = tagFor(pkg.name, version)
    const data = await read(pkg.name)
    if (!data.versions[version] || !await existsRef(root, `refs/tags/${tag}`))
      continue
    const info = await releaseInfo(root, repo, tag)
    const filename = tarballName(pkg.name, version)
    if (!info || info.isDraft || !info.assets.some(a => a.name === filename) || !info.assets.some(a => a.name === `${filename}.sha256`))
      throw new Error(`${tag} 已上传 npm，但 GitHub Release 记录未完成；先用原发布的根 CLI --tag 补记，或人工处理原包`)
  }
}

async function runs(root: string, repo: string): Promise<Run[]> {
  return JSON.parse(await command(root, 'gh', ['run', 'list', '--repo', repo, '--workflow', 'release.yml', '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,status,url,displayTitle'])) as Run[]
}

export async function dispatch(root: string, repo: string, plan: Plan): Promise<void> {
  const before = new Set((await runs(root, repo)).map(r => r.databaseId))
  await command(root, 'gh', ['workflow', 'run', 'release.yml', '--repo', repo, '--ref', 'main', '--field', `tag=${plan.tag}`], true)
  let run: Run | undefined
  for (let attempt = 0; attempt < 24; attempt++) {
    const matches = (await runs(root, repo)).filter(r => !before.has(r.databaseId) && r.displayTitle === `Release ${plan.tag}`)
    if (matches.length > 1)
      throw new Error(`出现多个相同 tag 的 workflow，无法唯一跟踪：${matches.map(r => r.url).join(', ')}`)
    if (matches.length) {
      run = matches[0]
      break
    }
    await setTimeout(2500)
  }
  if (!run)
    throw new Error(`dispatch 已发送，但未定位到运行；检查 GitHub Actions，使用 --tag ${plan.tag} 前先排除重复任务`)
  console.log(`Workflow: ${run.url}`)
  let watchError: unknown
  try {
    await command(root, 'gh', ['run', 'watch', String(run.databaseId), '--repo', repo, '--exit-status'], true)
  }
  catch (error) { watchError = error }
  const result = JSON.parse(await command(root, 'gh', ['run', 'view', String(run.databaseId), '--repo', repo, '--json', 'conclusion,status,jobs,url'])) as {
    conclusion: string
    status: string
    jobs: { name: string, conclusion: string, steps: { name: string, conclusion: string }[] }[]
  }
  let missing = false
  for (const target of plan.targets) {
    const data = await readRegistry(target.name)
    const exists = !!data.versions[target.version]
    const latest = data['dist-tags'].latest
    console.log(`npm ${tagFor(target.name, target.version)}: ${exists ? '已存在' : '未上传'}; latest=${latest ?? '缺失'}`)
    if (!exists || !latest || compare(latest, target.version) < 0)
      missing = true
  }
  if (result.status !== 'completed' || result.conclusion !== 'success' || missing) {
    const failed = result.jobs.flatMap(job => job.steps.filter(s => s.conclusion === 'failure').map(s => `${job.name} / ${s.name}`))
    throw new Error(`CI 发布未完成：${run.url}\n失败阶段：${failed.join(', ') || result.conclusion || result.status}${watchError ? `\n${String(watchError)}` : ''}`)
  }
  console.log(`发布完成：${run.url}`)
}

async function releaseInfo(root: string, repo: string, tag: string): Promise<Release | undefined> {
  // Inspect the HTTP status explicitly: auth/network failures are not "missing".
  const response = await command(root, 'gh', ['api', '--include', `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`]).catch(async (error: unknown) => {
    // gh prints the status to stderr on 404; preserve every other error.
    if (error instanceof Error && /HTTP 404\b/.test(error.message))
      return undefined
    throw error
  })
  if (!response)
    return undefined
  const offset = response.indexOf('{')
  const value = JSON.parse(response.slice(offset)) as { body: string, assets: { name: string }[], draft: boolean }
  return { body: value.body, assets: value.assets, isDraft: value.draft }
}

export async function downloadEvidence(root: string, repo: string, tag: string, file: string): Promise<void> {
  if (existsSync(file))
    return
  const info = await releaseInfo(root, repo, tag)
  if (!info || info.isDraft || !info.assets.some(a => a.name === basename(file)))
    throw new Error(`${tag} 已在 npm，但缺少原 tarball；提供 --artifacts-dir，或人工处理。不会重新打包`)
  await command(root, 'gh', ['release', 'download', tag, '--repo', repo, '--pattern', basename(file), '--output', file])
}

export async function recordRelease(root: string, repo: string, target: Target, commit: string, file: string): Promise<void> {
  const tag = tagFor(target.name, target.version)
  const notesFile = `${file}.notes.md`
  writeFileSync(notesFile, `${target.notes}\n`)
  const checksum = `${file}.sha256`
  writeFileSync(checksum, `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${basename(file)}\n`)
  let info = await releaseInfo(root, repo, tag)
  if (!info) {
    await command(root, 'gh', ['release', 'create', tag, '--repo', repo, '--verify-tag', '--target', commit, '--title', tag, '--notes-file', notesFile], true)
    info = { body: target.notes, assets: [], isDraft: false }
  }
  if (info.isDraft || info.body.trim() !== target.notes.trim())
    throw new Error(`已有 GitHub Release 的正文或状态不符，需要人工核对：${tag}`)
  for (const asset of [file, checksum]) {
    if (info.assets.some(a => a.name === basename(asset))) {
      const existing = resolve(`${asset}.github`)
      await command(root, 'gh', ['release', 'download', tag, '--repo', repo, '--pattern', basename(asset), '--output', existing, '--clobber'])
      if (!readFileSync(existing).equals(readFileSync(asset)))
        throw new Error(`已有 Release 附件与原产物不符：${tag}/${basename(asset)}`)
    }
    else {
      await command(root, 'gh', ['release', 'upload', tag, asset, '--repo', repo], true)
    }
  }
}
