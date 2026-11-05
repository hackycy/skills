import type { Graph, Plan, Target } from './model'
import type { Packument, ReadRegistry } from './npm'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { downloadEvidence, githubPreflight, noActiveRelease, recordRelease, repository } from './github'
import { compare, loadGraph, parseTag, registry, tagFor, tarballName, toolchain } from './model'
import { newerThanLatest, readRegistry, verifyIntegrity, verifyPublished, visible } from './npm'
import { fixedPlan } from './plan'
import { gates } from './prepare'
import { command, existsRef, git } from './process'

export interface UploadPorts {
  read: ReadRegistry
  wait: (name: string, version: string) => Promise<Packument>
  publish: (file: string) => Promise<void>
  latest: (name: string, version: string) => Promise<void>
  record: (target: Target, file: string) => Promise<void>
  beforePublish: () => Promise<void>
  verified?: (target: Target) => void
}

export async function upload(graph: Graph, plan: Plan, artifacts: Map<string, string>, ports: UploadPorts, progress: (message: string) => void): Promise<void> {
  const versions = new Map(graph.publishOrder.map(p => [p.name, p.manifest.version]))
  // Targets never disappear just because an earlier upload succeeded.
  for (const pkg of graph.publishOrder) {
    const target = plan.targets.find(t => t.name === pkg.name)
    let data = await ports.read(pkg.name)
    if (!target) {
      if (!data.versions[pkg.manifest.version])
        throw new Error(`复用依赖不可查询：${tagFor(pkg.name, pkg.manifest.version)}`)
      verifyPublished(pkg, data.versions[pkg.manifest.version], versions)
      continue
    }
    const file = artifacts.get(pkg.name)
    if (!file || !existsSync(file))
      throw new Error(`缺少原 tarball：${pkg.name}`)
    for (let attempt = 0; !data.versions[target.version] && attempt < 2; attempt++) {
      newerThanLatest(data, pkg.name, target.version)
      for (const name of Object.keys({ ...pkg.manifest.dependencies, ...pkg.manifest.optionalDependencies })) {
        const version = versions.get(name)
        if (version && !(await ports.read(name)).versions[version])
          throw new Error(`消费者上传前依赖尚不可查询：${name}@${version}`)
      }
      await ports.beforePublish()
      // Check again immediately before the irreversible upload.
      data = await ports.read(pkg.name)
      if (data.versions[target.version])
        break
      newerThanLatest(data, pkg.name, target.version)
      progress(`npm publish ${tagFor(pkg.name, target.version)}（${attempt + 1}/2）`)
      let publishError: unknown
      try {
        await ports.publish(file)
      }
      catch (error) { publishError = error }
      data = await ports.wait(pkg.name, target.version)
      if (!data.versions[target.version] && attempt === 1)
        throw new Error(`npm 仍无 ${tagFor(pkg.name, target.version)}：${String(publishError ?? '上传后不可查询')}`)
    }
    const published = data.versions[target.version]
    if (!published)
      throw new Error(`npm 目标缺失：${tagFor(pkg.name, target.version)}`)
    verifyIntegrity(file, published)
    verifyPublished(pkg, published, versions)
    ports.verified?.(target)
    progress(`npm 已核对 ${tagFor(pkg.name, target.version)}`)
    const latest = data['dist-tags'].latest
    if (!latest || compare(latest, target.version) < 0) {
      // Re-read to avoid repairing an obsolete latest from a stale response.
      data = await ports.read(pkg.name)
      const current = data['dist-tags'].latest
      verifyIntegrity(file, data.versions[target.version])
      if (!current || compare(current, target.version) < 0) {
        await ports.beforePublish()
        await ports.latest(pkg.name, target.version)
        const after = await ports.read(pkg.name)
        if (!after['dist-tags'].latest || compare(after['dist-tags'].latest, target.version) < 0)
          throw new Error(`npm latest 修复未生效：${pkg.name}`)
      }
    }
    progress(`GitHub Release ${tagFor(pkg.name, target.version)}`)
    await ports.record(target, file)
  }
}

export async function authPreflight(root: string, local: boolean): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'linux')
    throw new Error('发布工具只支持 macOS/Linux')
  if (Number(process.versions.node.split('.')[0]) !== 24)
    throw new Error(`发布工具需要 Node 24（CI 固定 ${toolchain.node}）；产品运行下限不变`)
  const npm = await command(root, 'npm', ['--version'])
  // npm 12.2 is needed for CI's OIDC dist-tag writes. Local publishing uses
  // npm's web login and 2FA, supported by the npm 11 bundled with Node 24.
  const minimum = local ? '11.0.0' : '12.2.0'
  if (compare(npm, minimum) < 0)
    throw new Error(`${local ? '本机发布' : 'CI 发布'}需要 npm >=${minimum}（当前 ${npm}）${local ? '' : `，CI 固定 ${toolchain.npm} 以支持 OIDC dist-tag`}；可运行 npm install --global npm@${toolchain.npm} --ignore-scripts 后重试原命令`)
  if (local) {
    await command(root, 'npm', ['whoami', '--registry', registry])
  }
  else {
    if (process.env.GITHUB_ACTIONS !== 'true')
      throw new Error('CI 执行器只允许在 GitHub Actions 中使用 OIDC')
    if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
      throw new Error('缺少 OIDC：workflow 需要 id-token: write；不能用 npm whoami 校验 OIDC')
    if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN)
      throw new Error('CI 发布仅使用 OIDC；请移除 npm 发布 token')
  }
}

export async function execute(root: string, tag: string, local: boolean, originalArtifacts?: string): Promise<void> {
  const { name } = parseTag(tag)
  const repo = await repository(root)
  await git(root, 'fetch', 'origin', 'main', '--tags')
  const commit = await existsRef(root, `refs/tags/${tag}`)
  if (!commit)
    throw new Error(`未找到 tag：${tag}`)
  const remoteTag = await git(root, 'ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`)
  if (remoteTag.split(/\s+/)[0] !== await git(root, 'rev-parse', `refs/tags/${tag}`))
    throw new Error(`本地与远程 tag 不一致：${tag}`)
  const graphAtTag = loadGraph(root, name, commit)
  const plan = await fixedPlan(root, graphAtTag, tag, 'refs/remotes/origin/main')
  await githubPreflight(root, graphAtTag, local)
  for (const target of plan.targets) {
    const packageTag = `refs/tags/${tagFor(target.name, target.version)}`
    const remote = await git(root, 'ls-remote', '--exit-code', 'origin', packageTag)
    if (remote.split(/\s+/)[0] !== await git(root, 'rev-parse', packageTag))
      throw new Error(`包级 tag 与远程不符：${packageTag}`)
  }
  console.log(JSON.stringify(plan, null, 2))
  await authPreflight(root, local)
  if (local)
    await noActiveRelease(root, repo)
  const artifactsDir = originalArtifacts ? resolve(originalArtifacts) : resolve(root, '.cache/release', randomUUID())
  mkdirSync(artifactsDir, { recursive: true })
  console.log(`原始产物目录：${artifactsDir}`)
  const checkout = mkdtempSync(resolve(tmpdir(), 'skills-release-'))
  const work = resolve(checkout, 'source')
  let stage = '隔离检出'
  const completed: string[] = []
  const npmVerified = new Set<string>()
  const report = () => writeFileSync(resolve(artifactsDir, 'result.json'), JSON.stringify({ tag, commit, stage, npmVerified: [...npmVerified], completed }, null, 2))
  const progress = (message: string) => {
    stage = message
    console.log(message)
    report()
  }
  try {
    await git(root, 'clone', '--shared', '--no-checkout', '--', root, work)
    await git(work, 'remote', 'set-url', 'origin', `https://github.com/${repo}.git`)
    await git(work, 'checkout', '--detach', commit)
    if (await git(work, 'rev-parse', 'HEAD') !== commit)
      throw new Error('隔离检出与固定 commit 不符')
    progress('安装 frozen lockfile')
    await command(work, 'pnpm', ['install', '--frozen-lockfile'], true)
    if (await git(work, 'status', '--porcelain'))
      throw new Error('安装修改了固定源码；停止发布')
    progress('基础门禁：lint、类型检查')
    await gates(work)
    const graph = loadGraph(work, name)
    const versions = new Map(graph.publishOrder.map(p => [p.name, p.manifest.version]))
    const artifacts = new Map<string, string>()
    const pending: Target[] = []
    progress('检查固定目标与原 tarball 证据')
    for (const target of plan.targets) {
      const file = resolve(artifactsDir, tarballName(target.name, target.version))
      const data = await readRegistry(target.name)
      if (data.versions[target.version]) {
        await downloadEvidence(work, repo, tagFor(target.name, target.version), file)
        verifyIntegrity(file, data.versions[target.version])
        verifyPublished(graph.packages.get(target.name)!, data.versions[target.version], versions)
      }
      else {
        newerThanLatest(data, target.name, target.version)
        if (existsSync(file))
          throw new Error(`${file} 尚无 npm integrity 可核对；请将已上传包的原产物复制到新目录后重试，不覆盖旧产物`)
        pending.push(target)
      }
      artifacts.set(target.name, file)
    }
    for (const reuse of plan.reuse) {
      const data = await readRegistry(reuse.name)
      if (!data.versions[reuse.version])
        throw new Error(`复用版本不存在：${tagFor(reuse.name, reuse.version)}`)
      verifyPublished(graph.packages.get(reuse.name)!, data.versions[reuse.version], versions)
    }
    if (pending.length) {
      for (const pkg of graph.buildOrder) {
        progress(`构建 ${pkg.name}`)
        await command(work, 'pnpm', ['--dir', pkg.path, 'run', pkg.build], true)
      }
      for (const target of pending) {
        const file = artifacts.get(target.name)!
        progress(`打包 ${target.name}`)
        await command(work, 'pnpm', ['--dir', graph.packages.get(target.name)!.path, '--config.ignore-scripts=true', 'pack', '--out', file], true)
      }
    }
    if (await git(work, 'rev-parse', 'HEAD') !== commit || await git(work, 'status', '--porcelain'))
      throw new Error('门禁或构建修改了固定源码；停止发布')
    await upload(graph, plan, artifacts, {
      read: readRegistry,
      wait: visible,
      // npm provenance reads resolved source material from these variables. The
      // workflow itself runs on main; its immutable workflow identity is retained.
      publish: file => command(work, 'npm', ['publish', file, '--access', 'public', '--tag', 'latest', '--registry', registry, '--ignore-scripts', ...(local ? [] : ['--provenance'])], true, local ? {} : { GITHUB_SHA: commit, GITHUB_REF: `refs/tags/${tag}` }).then(() => {}),
      latest: (name, version) => command(work, 'npm', ['dist-tag', 'add', `${name}@${version}`, 'latest', '--registry', registry], true).then(() => {}),
      beforePublish: async () => {
        if (local)
          await noActiveRelease(root, repo)
      },
      verified: (target) => {
        npmVerified.add(tagFor(target.name, target.version))
        report()
      },
      record: async (target, file) => {
        await recordRelease(work, repo, target, commit, file)
        completed.push(tagFor(target.name, target.version))
        report()
      },
    }, progress)
    progress('完成')
  }
  catch (error) {
    report()
    throw new Error(`发布停止于：${stage}\nnpm 已核对：${[...npmVerified].join(', ') || '无'}\n交付记录完成：${completed.join(', ') || '无'}\n原始产物：${artifactsDir}\n${String(error)}\n固定目标保持不变；不要移动 tag；源码修复后发新版本须显式覆盖未完成目标。`)
  }
  finally {
    if (process.env.GITHUB_STEP_SUMMARY)
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `\n发布 ${tag}\n\n阶段：${stage}\n\nnpm 已核对：${[...npmVerified].join(', ') || '无'}\n\n交付记录完成：${completed.join(', ') || '无'}\n`, { flag: 'a' })
    rmSync(checkout, { recursive: true, force: true })
  }
}
