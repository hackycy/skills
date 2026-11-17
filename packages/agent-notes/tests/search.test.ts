import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { manage } from '../src/distribution/manage'
import { testBundle } from './distribution-fixtures'
import { project, write } from './fixtures'

const roots: string[] = []
const marker = 'archive-search-regression-marker'
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('repository archive search', () => {
  it.each(['.agents/notes', 'docs/decisions'])('excludes only the archive when traversing a parent of %s', (notesDir) => {
    const root = project()
    roots.push(root)
    rmSync(join(root, '.agents/notes'), { recursive: true })
    write(root, '.rgignore', '/ignored-by-project/\r\n')
    const result = manage({ command: 'install', root, hosts: ['generic'], notesDir, dryRun: false, recover: false }, root, testBundle())
    expect(result.result, JSON.stringify(result)).toBe('ok')
    const visible = ['src/probe.txt', 'other/archived/probe.txt', `${notesDir}/archived-copy/probe.txt`, ...['proposed', 'implemented', 'rejected'].map(status => `${notesDir}/${status}/probe.txt`)]
    const archived = `${notesDir}/archived/probe.txt`
    for (const path of [...visible, archived, 'ignored-by-project/probe.txt'])
      write(root, path, `${marker}\n`)
    const search = (path: string, flags: string[] = [], cwd = root): string[] => {
      const found = spawnSync('rg', ['--no-config', ...flags, '-l', '-F', marker, path], { cwd, encoding: 'utf8' })
      expect(found.error, 'Search regression tests require ripgrep on PATH.').toBeUndefined()
      expect(found.status, found.stderr).toBe(0)
      return found.stdout.trim().split('\n').map(path => path.replace(/^\.\//, '')).sort()
    }
    expect(search('.', ['--hidden'])).toEqual([...visible].sort())
    expect(search(notesDir, ['--hidden'])).toEqual(visible.filter(path => path.startsWith(`${notesDir}/`)).sort())
    if (!notesDir.startsWith('.'))
      expect(search('.')).toEqual([...visible].sort())
    expect(search(`${notesDir}/archived`, ['--hidden'])).toEqual([archived])
    expect(search(archived, ['--hidden'])).toEqual([archived])
    expect(search('.', ['--hidden'], join(root, notesDir, 'archived'))).toEqual(['probe.txt'])
    expect(search('.', ['--hidden', '--no-ignore'])).toContain(archived)
  })
})
