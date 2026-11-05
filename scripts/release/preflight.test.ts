import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authPreflight } from './execute'
import * as processes from './process'

beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://example.test/oidc')
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'test-only')
  vi.stubEnv('NODE_AUTH_TOKEN', '')
  vi.stubEnv('NPM_TOKEN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('本机发布预检兼容 Node 24 自带的 npm 11.17.0', async () => {
  const command = vi.spyOn(processes, 'command').mockImplementation(async (_root, file, args) => {
    expect(file).toBe('npm')
    return args[0] === '--version' ? '11.17.0' : 'release-user'
  })
  await expect(authPreflight(process.cwd(), true)).resolves.toBeUndefined()
  expect(command).toHaveBeenCalledWith(process.cwd(), 'npm', ['whoami', '--registry', 'https://registry.npmjs.org'])
})

it.each(['11.0.0', '12.2.1'])('本机模式支持 npm %s，并检查 npm 登录', async (version) => {
  const command = vi.spyOn(processes, 'command').mockImplementation(async (_root, _file, args) => args[0] === '--version' ? version : 'release-user')
  await authPreflight(process.cwd(), true)
  expect(command).toHaveBeenCalledWith(process.cwd(), 'npm', ['whoami', '--registry', 'https://registry.npmjs.org'])
})

it('本机低于 npm 11 时提示当前版本及升级命令', async () => {
  const command = vi.spyOn(processes, 'command').mockResolvedValue('10.9.0')
  await expect(authPreflight(process.cwd(), true)).rejects.toThrow(/本机发布需要 npm >=11\.0\.0.*当前 10\.9\.0/)
  await expect(authPreflight(process.cwd(), true)).rejects.toThrow('npm install --global npm@12.2.1 --ignore-scripts')
  expect(command.mock.calls.every(([, , args]) => args[0] === '--version')).toBe(true)
})

it.each(['11.17.0', '12.1.9'])('在 CI 中仍拒绝不支持 OIDC dist-tag 的 npm %s', async (version) => {
  const command = vi.spyOn(processes, 'command').mockResolvedValue(version)
  await expect(authPreflight(process.cwd(), false)).rejects.toThrow('CI 发布需要 npm >=12.2.0')
  expect(command).toHaveBeenCalledOnce()
})

it.each(['12.2.0', '12.2.1'])('在 CI 中 npm %s 使用 OIDC，不检查 npm whoami', async (version) => {
  const command = vi.spyOn(processes, 'command').mockResolvedValue(version)
  await authPreflight(process.cwd(), false)
  expect(command).toHaveBeenCalledOnce()
})
