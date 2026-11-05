import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('./cli.ts', import.meta.url))
const argv = [process.execPath, '--import', import.meta.resolve('tsx'), cli]
const roots: string[] = []
const complete = ['--package', '@test/a', '--version', '0.2.0', '--yes']
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function write(file: string, value: string | object): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
}

function executable(file: string, value: string): void {
  write(file, value)
  chmodSync(file, 0o755)
}

function fixture(single = false) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'release test-')))
  roots.push(base)
  const root = join(base, 'repo')
  const remote = join(base, 'remote.git')
  const log = join(base, 'npm.jsonl')
  const bin = join(base, 'bin')
  write(join(root, 'package.json'), { private: true, version: '0.0.0' })
  write(join(root, 'pnpm-lock.yaml'), '# unchanged lockfile\n')
  write(join(root, 'packages/a/package.json'), { name: '@test/a', version: '0.1.0', bin: { a: 'dist/cli.mjs' } })
  if (!single)
    write(join(root, 'packages/b/package.json'), { name: '@test/b', version: '0.1.0', bin: 'dist/cli.mjs' })
  write(join(root, 'packages/private/package.json'), { name: '@test/private', version: '0.1.0', private: true, bin: 'cli.mjs' })
  write(join(root, 'packages/library/package.json'), { name: '@test/library', version: '0.1.0' })
  write(join(root, 'packages/a/CHANGELOG.md'), '# Historical notes\n')
  executable(join(bin, 'npm'), `${[
    `#!${process.execPath}`,
    'const { appendFileSync, readFileSync } = require("node:fs")',
    'const { execFileSync } = require("node:child_process")',
    'const manifest = JSON.parse(readFileSync("package.json", "utf8"))',
    'const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()',
    'appendFileSync(process.env.RELEASE_TEST_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), name: manifest.name, version: manifest.version, head: git("rev-parse", "HEAD"), tags: git("tag", "--list") }) + "\\n")',
    'if (process.env.RELEASE_TEST_NPM_FAIL) process.exit(1)',
  ].join('\n')}\n`)
  git(root, 'init', '--initial-branch=release-work')
  git(root, 'config', 'user.name', 'Release Test')
  git(root, 'config', 'user.email', 'release@example.com')
  git(root, 'config', 'commit.gpgSign', 'false')
  git(root, 'config', 'tag.gpgSign', 'false')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'feat: fixture')
  git(root, 'init', '--bare', remote)
  git(root, 'remote', 'add', 'origin', remote)
  git(root, 'push', '-u', 'origin', 'release-work')
  git(root, 'tag', 'unrelated')
  const start = git(root, 'rev-parse', 'HEAD')
  const env = { ...gitEnv, CI: '1', PATH: `${bin}:${process.env.PATH}`, RELEASE_TEST_LOG: log }
  return { root, remote, log, start, env }
}

function run(f: ReturnType<typeof fixture>, args = complete, env = {}) {
  return spawnSync(argv[0], [...argv.slice(1), ...args], { cwd: f.root, env: { ...f.env, ...env }, encoding: 'utf8', timeout: 15_000 })
}

function events(f: ReturnType<typeof fixture>) {
  return existsSync(f.log) ? readFileSync(f.log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
}

function unchanged(f: ReturnType<typeof fixture>): void {
  expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.start)
  expect(git(f.remote, 'rev-parse', 'refs/heads/release-work')).toBe(f.start)
  expect(git(f.root, 'status', '--porcelain')).toBe('')
  expect(events(f)).toEqual([])
}

afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe.skipIf(process.platform === 'win32')('本机 CLI 发布', () => {
  it('只更新所选 CLI，npm 成功后提交、打 tag 并推送当前分支和本次 tag', () => {
    const f = fixture()
    const result = run(f)
    expect(result.status, result.stderr).toBe(0)
    expect(events(f)).toEqual([expect.objectContaining({
      args: ['publish'],
      name: '@test/a',
      version: '0.2.0',
      head: f.start,
      tags: 'unrelated',
    })])
    expect(events(f)[0].cwd).toBe(join(f.root, 'packages/a'))
    expect(git(f.root, 'show', '--format=%s', '--name-only', 'HEAD')).toBe('chore(release): @test/a@0.2.0\n\npackages/a/package.json')
    expect(git(f.root, 'status', '--porcelain')).toBe('')
    const commit = git(f.root, 'rev-parse', 'HEAD')
    expect(git(f.remote, 'rev-parse', 'refs/heads/release-work')).toBe(commit)
    expect(git(f.remote, 'rev-parse', 'refs/tags/@test/a@0.2.0^{commit}')).toBe(commit)
    expect(git(f.remote, 'tag', '--list')).toBe('@test/a@0.2.0')
    for (const file of ['package.json', 'pnpm-lock.yaml', 'packages/b/package.json', 'packages/a/CHANGELOG.md'])
      expect(git(f.root, 'diff', f.start, 'HEAD', '--', file)).toBe('')
  })

  it('帮助无副作用，旧参数和非交互缺参明确报错', () => {
    const f = fixture()
    expect(run(f, ['--help']).stdout).toContain('npm publish')
    for (const args of [[], complete.slice(2), ['--package', '@test/a', '--yes'], complete.slice(0, -1)])
      expect(run(f, args).stderr).toContain('必须提供 --package、--version 和 --yes')
    for (const args of [['--mode', 'local'], ['--tag', '@test/a@0.2.0'], ['--override', 'x'], ['--artifacts-dir', 'x'], ['--dry-run']]) {
      const result = run(f, [...complete, ...args])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Unknown option')
    }
    unchanged(f)
  })

  it.each(['@test/private', '@test/library', '@test/missing'])('拒绝不可发布的包 %s', (name) => {
    const f = fixture()
    const result = run(f, ['--package', name, '--version', '0.2.0', '--yes'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('不可发布的 CLI')
    unchanged(f)
  })

  it.each([false, true])('拒绝脏工作树（已暂存：%s）', (staged) => {
    const f = fixture()
    write(join(f.root, 'change.txt'), 'pending\n')
    if (staged)
      git(f.root, 'add', 'change.txt')
    expect(run(f).stderr).toContain('需要干净工作树')
    expect(events(f)).toEqual([])
    expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.start)
  })

  it('版本错误交给 bumpp，发生在 npm 发布之前', () => {
    const f = fixture()
    const result = run(f, ['--package', '@test/a', '--version', 'invalid', '--yes'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('版本更新失败')
    unchanged(f)
  })

  it('npm 失败后保留版本编辑，不提交、不打 tag、不推送', () => {
    const f = fixture()
    const result = run(f, complete, { RELEASE_TEST_NPM_FAIL: '1' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('npm publish失败')
    expect(events(f)).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(f.root, 'packages/a/package.json'), 'utf8')).version).toBe('0.2.0')
    expect(git(f.root, 'status', '--porcelain')).toBe('M packages/a/package.json')
    expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.start)
    expect(git(f.root, 'tag', '--list')).toBe('unrelated')
    expect(git(f.remote, 'rev-parse', 'refs/heads/release-work')).toBe(f.start)
  })

  it.each(['commit', 'tag', 'push'])('npm 成功后 %s 失败，报告具体 Git 阶段且不重复发布', (stage) => {
    const f = fixture()
    if (stage === 'commit')
      executable(join(f.root, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n')
    if (stage === 'tag')
      git(f.root, 'tag', '@test/a@0.2.0')
    if (stage === 'push')
      executable(join(f.remote, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n')
    const result = run(f)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`${({ commit: 'Git 提交', tag: 'Git tag', push: 'Git 推送' })[stage]}失败`)
    expect(result.stderr).toContain('npm publish 已成功返回，请手动补齐 Git 操作')
    expect(events(f)).toHaveLength(1)
    expect(git(f.remote, 'rev-parse', 'refs/heads/release-work')).toBe(f.start)
    expect(git(f.remote, 'tag', '--list')).toBe('')
    expect(git(f.root, 'rev-parse', 'HEAD') === f.start).toBe(stage === 'commit')
    if (stage === 'push')
      expect(git(f.root, 'tag', '--list')).toContain('@test/a@0.2.0')
  })
})

// Give both bumpp and the package selector a real terminal without touching npm.
const terminalDriver = [
  'import errno, fcntl, json, os, pty, select, struct, subprocess, sys, termios, time',
  'request = json.load(sys.stdin)',
  'master, slave = pty.openpty()',
  'fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 120, 0, 0))',
  'child = subprocess.Popen(request["argv"], cwd=request["root"], env=request["env"], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)',
  'os.close(slave)',
  'output, pending, actions = bytearray(), bytearray(), list(request["actions"])',
  'deadline = time.monotonic() + 20',
  'try:',
  '  while True:',
  '    if time.monotonic() > deadline: raise TimeoutError(output.decode(errors="replace"))',
  '    if not select.select([master], [], [], 0.1)[0]: continue',
  '    try: data = os.read(master, 65536)',
  '    except OSError as error:',
  '      if error.errno != errno.EIO: raise',
  '      data = b""',
  '    if not data: break',
  '    output.extend(data)',
  '    pending.extend(data)',
  '    if actions and actions[0]["expect"].encode() in pending:',
  '      os.write(master, actions.pop(0)["send"].encode())',
  '      pending.clear()',
  '  if actions: raise RuntimeError("Unreached actions: " + str(actions) + output.decode(errors="replace"))',
  '  print(json.dumps({"status": child.wait(timeout=2), "output": output.decode(errors="replace")}))',
  'finally:',
  '  if child.poll() is None:',
  '    child.kill()',
  '    child.wait()',
  '  os.close(master)',
].join('\n')

function terminal(f: ReturnType<typeof fixture>, args: string[], actions: { expect: string, send: string }[]) {
  const result = spawnSync('python3', ['-c', terminalDriver], {
    input: JSON.stringify({ root: f.root, argv: [...argv, ...args], actions, env: { ...f.env, CI: '', TERM: 'xterm-256color', NO_COLOR: '1' } }),
    encoding: 'utf8',
    timeout: 25_000,
  })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}

describe.skipIf(process.platform === 'win32')('真实终端交互', () => {
  it('从多个公开 CLI 中选择，支持字符串 bin', () => {
    const f = fixture()
    const result = terminal(f, ['--version', '0.2.0', '--yes'], [{ expect: '选择发布 CLI', send: '\x1B[B\r' }])
    expect(result.status, result.output).toBe(0)
    expect(events(f)[0]).toMatchObject({ name: '@test/b', version: '0.2.0' })
  })

  it('自动选中唯一 CLI，省略版本时使用 bumpp 原生版本选择', () => {
    const f = fixture(true)
    const result = terminal(f, ['--yes'], [{ expect: 'Current version', send: '\r' }])
    expect(result.status, result.output).toBe(0)
    expect(events(f)[0]).toMatchObject({ name: '@test/a', version: '0.1.1' })
  })

  it.each(['\x1B', '\x03'])('取消包选择无副作用（%j）', (key) => {
    const f = fixture()
    expect(terminal(f, [], [{ expect: '选择发布 CLI', send: key }]).status).toBe(130)
    unchanged(f)
  })

  it('拒绝 bumpp 确认无副作用', () => {
    const f = fixture(true)
    expect(terminal(f, ['--version', '0.2.0'], [{ expect: 'Bump?', send: 'n\r' }]).status).toBe(1)
    unchanged(f)
  })
})
