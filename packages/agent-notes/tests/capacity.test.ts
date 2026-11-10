import { Buffer } from 'node:buffer'
import fs, { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { localizeBundle, parseSource, sourceIndex, verifyBundle } from '../src/distribution/bundle'
import { backupPlan } from '../src/distribution/manage'
import { parseInstallation } from '../src/distribution/manifest'
import { project as projection, receipt } from '../src/distribution/projection'
import { base64, boundedRead, canonical, json, limits } from '../src/distribution/protocol'
import { Repository } from '../src/notes/snapshot'
import { commitTransaction, preflightTransaction } from '../src/workflow/transaction'
import { testBundle } from './distribution-fixtures'
import { project } from './fixtures'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function snapshot() {
  const root = project()
  roots.push(root)
  return new Repository(root).snapshot('worktree')
}
// Transport budget tests deliberately use a no-op domain validator. Production
// distribution callers also require the independently tested exact projection.
const transport = { context: null, cleanup: [], validate() {} }
const config = { format: 'agent-notes-config/1', notes_dir: '.agents/notes', language: 'en' } as const

describe('independent capacity boundaries', () => {
  it('accepts exact index/manifest raw limits and rejects one more byte', () => {
    const source = testBundle()
    const index = parseSource(source.index)
    index.integrations[0].label += 'x'.repeat(limits.index - canonical(index).length)
    expect(parseSource(canonical(index)).integrations[0].label.length).toBeGreaterThan(0)
    index.integrations[0].label += 'x'
    expect(() => parseSource(canonical(index))).toThrow(/exceeds/)

    const state = receipt(projection({ source, config, integrations: ['generic'] }))
    state.version = `${'1'.repeat(limits.installation - canonical(state).length + state.version.length - 4)}.0.0`
    expect(canonical(state).length).toBe(limits.installation)
    expect(parseInstallation(canonical(state)).version).toBe(state.version)
    state.version = `1${state.version}`
    expect(() => parseInstallation(canonical(state))).toThrow(/exceeds/)
  })

  it('accepts 256 source files and 1024 receipt entries, rejecting the next item', () => {
    const source = testBundle()
    while (source.files.size < limits.sources)
      source.files.set(`assets/extra-${String(source.files.size).padStart(4, '0')}`, Buffer.alloc(0))
    source.index = sourceIndex('0.1.0', source.files)
    expect(verifyBundle(source).files.length).toBe(limits.sources)
    source.files.set('assets/overflow', Buffer.alloc(0))
    expect(() => parseSource(sourceIndex('0.1.0', source.files))).toThrow(/exceeds/)
    const state = receipt(projection({ source: testBundle(), config, integrations: ['generic'] }))
    state.assets = Array.from({ length: limits.assets }, (_, i) => ({ path: `file-${String(i).padStart(4, '0')}`, kind: 'file', sha256: '0'.repeat(64) }))
    expect(parseInstallation(canonical(state)).assets.length).toBe(limits.assets)
    state.assets.push({ path: 'overflow', kind: 'file', sha256: '0'.repeat(64) })
    expect(() => parseInstallation(canonical(state))).toThrow(/exceeds/)
  })

  it('accepts exact single/aggregate source bytes and rejects independent excess', () => {
    const source = testBundle()
    const baseline = [...source.files.values()].reduce((total, bytes) => total + bytes.length, 0)
    source.files.set('assets/large.bin', Buffer.alloc(limits.sourceFile))
    source.files.set('assets/remainder.bin', Buffer.alloc(limits.sourceTotal - baseline - limits.sourceFile))
    source.index = sourceIndex('0.1.0', source.files)
    expect(verifyBundle(source).files.length).toBe(source.files.size)
    source.files.set('assets/remainder.bin', Buffer.alloc(limits.sourceTotal - baseline - limits.sourceFile + 1))
    source.index = sourceIndex('0.1.0', source.files)
    expect(() => verifyBundle(source)).toThrow(/Source total/)
    source.files.delete('assets/remainder.bin')
    source.files.set('assets/large.bin', Buffer.alloc(limits.sourceFile + 1))
    source.index = sourceIndex('0.1.0', source.files)
    expect(() => verifyBundle(source)).toThrow(/exceeds/)
  })

  it('accepts the maximum complete projection and refuses the next generated asset', () => {
    const source = testBundle()
    for (let i = 0; i < 10; i++)
      source.files.set(`assets/skills/agent-note/resource-${i}.bin`, Buffer.alloc(0))
    while (source.files.size < 253)
      source.files.set(`assets/resource-${String(source.files.size).padStart(4, '0')}.bin`, Buffer.alloc(0))
    const catalog = Array.from({ length: limits.integrations }, (_, i) => ({ id: `example-${String(i).padStart(2, '0')}`, label: 'Example', default: i === 0, skillRoot: `.example-${i}/skills` }))
    source.index = sourceIndex('0.1.0', source.files, catalog)
    expect(projection({ source, config, integrations: catalog.map(item => item.id) }).assets.length).toBe(limits.assets)
    source.files.set('assets/one-more.bin', Buffer.alloc(0))
    source.index = sourceIndex('0.1.0', source.files, catalog)
    expect(() => projection({ source, config, integrations: catalog.map(item => item.id) })).toThrow(/Projected assets/)
  })

  it('decodes a maximum endpoint without regexp stack overflow and rejects +1 before decoding', () => {
    const bytes = Buffer.alloc(limits.endpoint, 120)
    expect(base64(bytes.toString('base64')).equals(bytes)).toBe(true)
    expect(() => base64(Buffer.alloc(limits.endpoint + 1).toString('base64'))).toThrow(/exceeds/)
    expect(() => base64('eA==', 0)).toThrow(/exceeds/)
    expect(() => base64('eA==', 1)).not.toThrow()
  })

  it('accepts 4096 changes/directory actions and rejects either independent excess', () => {
    const source = snapshot()
    const changes = new Map(Array.from({ length: limits.entries }, (_, i) => [`notes-${i}/file.md`, Buffer.alloc(0)]))
    expect(() => preflightTransaction(source, changes, transport)).not.toThrow()
    changes.set('overflow.md', Buffer.alloc(0))
    expect(() => preflightTransaction(source, changes, transport)).toThrow(/Journal entries/)
    changes.delete('overflow.md')
    changes.delete('notes-0/file.md')
    changes.set('one/two/three/file.md', Buffer.alloc(0))
    expect(() => preflightTransaction(source, changes, transport)).toThrow(/Directory actions/)
  }, 30_000)

  it('checks cumulative decoded payload before encoding the next legal endpoint', () => {
    const source = snapshot()
    const bytes = Buffer.alloc(limits.endpoint, 120)
    const changes = new Map(Array.from({ length: 4 }, (_, i) => [`file-${i}.md`, bytes]))
    expect(() => preflightTransaction(source, changes, transport)).not.toThrow()
    changes.set('extra.md', Buffer.from('x'))
    expect(() => preflightTransaction(source, changes, transport)).toThrow(/decoded endpoints/)
    expect(() => commitTransaction(source, changes, () => {})).toThrow(/decoded endpoints/)
    changes.clear()
    changes.set('oversize.md', Buffer.alloc(limits.endpoint + 1))
    expect(() => preflightTransaction(source, changes, transport)).toThrow(/After endpoint/)
    expect(() => commitTransaction(source, changes, () => {})).toThrow(/After endpoint/)
  }, 30_000)

  it('rejects raw journal excess before JSON decoding', () => {
    const exact = canonical('x'.repeat(limits.journal - 3))
    expect(exact.length).toBe(limits.journal)
    expect(typeof json(exact, limits.journal)).toBe('string')
    expect(() => json(Buffer.alloc(limits.journal + 1), limits.journal)).toThrow(/exceeds/)
    expect(() => json(Buffer.from([0xFF]), limits.index)).toThrow(/encoded data|encoding|UTF-8/i)
  })

  it('budgets full backup copies and summaries together without truncation', () => {
    const directory = '.agents/notes/local/backups/00000000-0000-0000-0000-000000000000'
    const endpoints = Array.from({ length: 4 }, (_, i) => ({ path: `skill-${i}.md`, before: Buffer.alloc(limits.endpoint), after: Buffer.alloc(0) }))
    expect(() => backupPlan(directory, endpoints)).toThrow(/Necessary backups/)
    endpoints[3].before = Buffer.alloc(limits.endpoint - 4000)
    const below = backupPlan(directory, endpoints).reduce((sum, [, bytes]) => sum + bytes.length, 0)
    endpoints[3].before = Buffer.alloc(endpoints[3].before.length + limits.backup - below)
    const exact = backupPlan(directory, endpoints)
    expect(exact.reduce((sum, [, bytes]) => sum + bytes.length, 0)).toBe(limits.backup)
    expect(exact.filter(([path]) => path.includes('/summaries/')).every(([, bytes]) => bytes.length < limits.summary)).toBe(true)
    endpoints[3].before = Buffer.alloc(endpoints[3].before.length + 1)
    expect(() => backupPlan(directory, endpoints)).toThrow(/Necessary backups/)
  })

  it('rejects invalid UTF-8 before localizing textual resources', () => {
    const source = testBundle()
    source.files.set('assets/references/writing.md', Buffer.from([0xFF]))
    source.index = sourceIndex('0.1.0', source.files)
    expect(() => localizeBundle(source, config.notes_dir)).toThrow(/UTF-8/)
  })

  it('bounds bytes actually read when a file grows after its size check', () => {
    const root = mkdtempSync(join(tmpdir(), 'notes-growing-'))
    roots.push(root)
    const path = join(root, 'growing')
    writeFileSync(path, 'x'.repeat(16))
    const original = fs.fstatSync
    fs.fstatSync = new Proxy(original, { apply(target, receiver, args) {
      const result = Reflect.apply(target, receiver, args)
      appendFileSync(path, 'x')
      return result
    } })
    syncBuiltinESMExports()
    try {
      expect(() => boundedRead(path, 16)).toThrow(/exceeds/)
    }
    finally {
      fs.fstatSync = original
      syncBuiltinESMExports()
    }
  })
})
