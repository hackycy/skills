import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { visible } from './npm'

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }))

afterEach(() => {
  vi.clearAllMocks()
})

const empty = { 'versions': {}, 'dist-tags': {} }
const published = { 'versions': { '0.1.0': { name: '@test/a', version: '0.1.0', dist: {} } }, 'dist-tags': { latest: '0.1.0' } }

it('公开传播超过旧查询窗口后仍可确认版本', async () => {
  let queries = 0
  const read = vi.fn(async () => ++queries < 12 ? empty : published)
  await expect(visible('@test/a', '0.1.0', read)).resolves.toEqual(published)
  expect(read).toHaveBeenCalledTimes(12)
})

it('版本一直不可见时有界等待，不将暂存状态认作已发布', async () => {
  const read = vi.fn(async () => empty)
  await expect(visible('@test/a', '0.1.0', read)).resolves.toEqual(empty)
  expect(read).toHaveBeenCalledTimes(30)
  expect(vi.mocked(setTimeout).mock.calls.reduce((total, [delay]) => total + (delay ?? 0), 0)).toBe(58_000)
})

it('已公开版本立即返回', async () => {
  await expect(visible('@test/a', '0.1.0', async () => published)).resolves.toEqual(published)
  expect(setTimeout).not.toHaveBeenCalled()
})
