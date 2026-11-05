import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { isCancel, isCI, select } from '@clack/prompts'
import { versionBump } from 'bumpp'
import { x } from 'tinyexec'

const help = `本机发布一个 CLI：
  pnpm release
  pnpm release --package <name> [--version <version>]
  pnpm release --package <name> --version <version> --yes

省略包名时交互选择，省略版本时使用 bumpp 交互；--yes 跳过 bumpp 确认。
CI 或非终端必须提供 --package、--version 和 --yes。
顺序：更新版本 → npm publish（含 prepack）→ 提交和 tag → 推送 origin。
tag 格式为 <包名>@<版本>；仅发布所选 CLI，使用包现有的 npm 发布配置。
`

interface CliPackage {
  name: string
  version: string
  private?: boolean
  bin?: string | Record<string, string>
  path: string
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    package: { type: 'string' },
    version: { type: 'string' },
    yes: { type: 'boolean', short: 'y' },
    help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) {
    console.log(help)
    return
  }
  const interactive = !isCI() && !!process.stdin.isTTY && !!process.stdout.isTTY
  if (!interactive && (!values.package || !values.version || !values.yes))
    throw new Error('CI 或非终端必须提供 --package、--version 和 --yes')

  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const root = git('rev-parse', '--show-toplevel')
  process.chdir(root)
  const packages = globSync('packages/*/package.json').sort().map((file) => {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Omit<CliPackage, 'path'>
    return { ...manifest, path: dirname(file) }
  }).filter(pkg => pkg.name && !pkg.private && (typeof pkg.bin === 'string' ? pkg.bin.length : Object.keys(pkg.bin ?? {}).length))
  if (!packages.length)
    throw new Error('packages/ 下没有可发布的 CLI（公开且声明 bin）')
  const name = values.package ?? (packages.length === 1
    ? packages[0].name
    : await select({
        message: '选择发布 CLI',
        options: packages.map(pkg => ({ value: pkg.name, label: pkg.name, hint: pkg.version })),
      }))
  if (isCancel(name)) {
    console.log('已取消发布。')
    process.exitCode = 130
    return
  }
  const pkg = packages.find(pkg => pkg.name === name)
  if (!pkg)
    throw new Error(`不可发布的 CLI：${name}`)
  if (git('status', '--porcelain'))
    throw new Error('发布需要干净工作树，请先提交或 stash 当前改动')

  let published = false
  let stage = '版本更新'
  try {
    const result = await versionBump({
      cwd: root,
      files: [`${pkg.path}/package.json`],
      release: values.version,
      commit: `chore(release): ${pkg.name}@%s`,
      tag: `${pkg.name}@%s`,
      push: false,
      confirm: !values.yes,
      ignoreScripts: true,
      printCommits: false,
      execute: async () => {
        stage = 'npm publish'
        await x('npm', ['publish'], { throwOnError: true, nodeOptions: { cwd: pkg.path, stdio: 'inherit' } })
        published = true
        stage = 'Git 提交'
      },
      progress: ({ event }) => {
        if (event === 'git commit')
          stage = 'Git tag'
      },
    })
    stage = 'Git 推送'
    await x('git', ['push', '--atomic', 'origin', 'HEAD', `refs/tags/${result.tag}`], { throwOnError: true, nodeOptions: { stdio: 'inherit' } })
    console.log(`发布完成：${pkg.name}@${result.newVersion}`)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${stage}失败：${message}${published ? '\nnpm publish 已成功返回，请手动补齐 Git 操作，不要重新执行发布。' : '\n发布未完成，请保留并检查当前改动。'}`, { cause: error })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
