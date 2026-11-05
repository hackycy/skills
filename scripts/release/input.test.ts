import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { completeArguments, missingArguments, parseReleaseArgs, readOverrides, requireComplete, validateArguments } from './input'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function overrideFile(value: unknown): string {
  const directory = mkdtempSync(resolve(tmpdir(), 'release-input-'))
  directories.push(directory)
  const file = resolve(directory, 'override.json')
  writeFileSync(file, JSON.stringify(value))
  return file
}

describe('发布参数', () => {
  it('保留所有现有选项和帮助入口，拒绝未知参数', () => {
    expect(parseReleaseArgs(['--tag', '@test/a@0.1.0', '--mode', 'local', '--artifacts-dir', './artifacts', '--dry-run'])).toMatchObject({ tag: '@test/a@0.1.0', mode: 'local', artifactsDir: './artifacts', dryRun: true })
    expect(parseReleaseArgs(['-h']).help).toBe(true)
    expect(() => parseReleaseArgs(['--unknown'])).toThrow()
  })

  it.each([
    { mode: 'invalid' },
    { mode: '' },
    { version: '1.0.0-beta.1' },
    { tag: '@test/a@01.0.0' },
    { tag: '@test/a@1.0.0', package: '@test/a' },
    { tag: '@test/a@1.0.0', version: '1.0.0' },
    { tag: '@test/a@1.0.0', override: 'override.json' },
    { artifactsDir: 'artifacts', mode: 'ci' },
    { artifactsDir: 'artifacts', package: '@test/a' },
    { artifactsDir: 'artifacts', override: 'override.json' },
  ])('在补参前拒绝非法或互斥参数：%j', (input) => {
    expect(() => validateArguments(input)).toThrow()
  })

  it('区分新版本、已有 tag 和缺参，非交互不补默认 mode', () => {
    expect(missingArguments({ package: '@test/a' })).toEqual(['--mode ci|local', '--version'])
    expect(missingArguments({ tag: '@test/a@0.1.0', mode: 'ci' })).toEqual([])
    expect(missingArguments({ artifactsDir: 'artifacts' })).toEqual(['--mode ci|local', '--tag'])
    expect(() => requireComplete({})).toThrow(/--mode.*--package.*--version/s)
    expect(() => requireComplete({})).toThrow('pnpm release --tag')
    expect(() => completeArguments({ package: '@test/a', version: '0.1.0' })).toThrow('--mode')
    expect(completeArguments({ package: '@test/a', version: '0.1.0', mode: 'local' })).toEqual({ kind: 'new', package: '@test/a', version: '0.1.0', mode: 'local', dryRun: false, artifactsDir: undefined, overrides: {} })
  })

  it('读取原 JSON 覆盖格式，并拒绝错误形状、空说明及 CLI 版本冲突', () => {
    const overrides = { '@test/a': { version: '0.1.1', notes: '- 审核说明' } }
    expect(readOverrides({ override: overrideFile(overrides) })).toEqual(overrides)
    for (const value of [null, [], { '@test/a': { version: '0.1.1', notes: ' ' } }, { '@test/a': { version: 'next', notes: '说明' } }])
      expect(() => readOverrides({ override: overrideFile(value) })).toThrow()
    expect(() => readOverrides({ package: '@test/a', version: '0.2.0', override: overrideFile(overrides) })).toThrow('CLI 覆盖版本')
  })
})
