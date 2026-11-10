import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localizeBundle, parseSource, sourceIndex, verifyBundle } from '../src/distribution/bundle'
import { integrations } from '../src/distribution/integrations'
import { parseInstallation } from '../src/distribution/manifest'
import { project, receipt, validate } from '../src/distribution/projection'
import { assertPath, base64, boundedRead, canonical, limits } from '../src/distribution/protocol'
import { testBundle } from './distribution-fixtures'

const config = { format: 'agent-notes-config/1', notes_dir: '.agents/notes', language: 'en' } as const

describe('pure projection and bounded protocols', () => {
  it('materializes only once even when a custom root contains the default root', () => {
    const first = localizeBundle(testBundle(), '.agents/notes-two')
    expect(localizeBundle(first, '.agents/notes-two')).toBe(first)
    expect([...first.files.values()].some(bytes => bytes.toString().includes('notes-two-two'))).toBe(false)
    expect(() => localizeBundle(first, '.agents/notes')).toThrow(/different Notes root/)
    expect(first.files.get('cli.mjs')).toEqual(testBundle().files.get('cli.mjs'))
  })

  it('adds the same static layout using one catalog row without caller branches', () => {
    const source = testBundle()
    source.index = sourceIndex('0.1.0', source.files, [...integrations, { id: 'example-agent', label: 'Example', default: false, skillRoot: '.example/skills' }])
    const output = project({ source, config, integrations: ['example-agent'] })
    expect(output.skillRoots).toEqual(['.example/skills/agent-note', '.example/skills/agent-note-maintenance'])
    expect(validate({ kind: 'installation', source, config, installation: receipt(output) }).assets).toEqual(output.assets)
    expect(integrations.some(item => String(item.id) === 'example-agent')).toBe(false)
  })

  it('merges shared bytes, while detecting parent and case collisions', () => {
    const source = testBundle()
    expect(project({ source, config, integrations: ['generic', 'codex'] }).assets).toEqual(project({ source, config, integrations: ['generic'] }).assets)
    for (const path of ['assets/references/writing.md/child.txt', 'assets/references/WRITING.md']) {
      const bad = testBundle('0.1.0', { [path]: 'Collision' })
      expect(() => project({ source: bad, config, integrations: ['generic'] })).toThrow(/collision/i)
    }
  })

  it.each(['duplicate-key', 'unknown-field', 'order', 'BOM', 'CRLF', 'duplicate-path', 'bad-hash', 'legacy'])('rejects source representation %s', (kind) => {
    const source = testBundle()
    const index = JSON.parse(source.index.toString())
    let bytes = source.index
    if (kind === 'duplicate-key')
      bytes = Buffer.from(source.index.toString().replace('"version":', '"version": "0.0.0",\n  "version":'))
    if (kind === 'unknown-field')
      bytes = canonical({ ...index, extra: true })
    if (kind === 'order')
      bytes = canonical({ version: index.version, ...index })
    if (kind === 'BOM')
      bytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), bytes])
    if (kind === 'CRLF')
      bytes = Buffer.from(bytes.toString().replaceAll('\n', '\r\n'))
    if (kind === 'duplicate-path') {
      index.files.push(index.files[0])
      bytes = canonical(index)
    }
    if (kind === 'bad-hash') {
      index.files[0].sha256 = 'bad'
      bytes = canonical(index)
    }
    if (kind === 'legacy') {
      index.format = 'agent-notes-source/0'
      bytes = canonical(index)
    }
    expect(() => parseSource(bytes)).toThrow()
  })

  it('does not let a structurally valid but incomplete receipt authorize writes', () => {
    const source = testBundle()
    const output = project({ source, config, integrations: ['generic'] })
    const state = receipt(output)
    state.assets.pop()
    const decoded = parseInstallation(canonical(state))
    expect(() => validate({ kind: 'installation', source, config, installation: decoded })).toThrow(/exactly equal/)
  })

  it('bounds reads before allocation and checks actual bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'notes-budget-'))
    const path = join(root, 'large')
    try {
      writeFileSync(path, Buffer.alloc(0))
      truncateSync(path, limits.index)
      expect(boundedRead(path, limits.index).length).toBe(limits.index)
      truncateSync(path, limits.index + 1)
      expect(() => boundedRead(path, limits.index)).toThrow(/exceeds/)
      expect(() => parseSource(boundedRead(path, limits.index + 1))).toThrow(/exceeds/)
    }
    finally {
      rmSync(root, { recursive: true })
    }
  })

  it('checks per-file and aggregate source limits independently', () => {
    const single = testBundle('0.1.0', { 'assets/large.txt': 'x'.repeat(limits.sourceFile + 1) })
    expect(() => verifyBundle(single)).toThrow(/exceeds/)
    const total = testBundle('0.1.0', { 'assets/a.txt': 'a'.repeat(limits.sourceFile), 'assets/b.txt': 'b'.repeat(limits.sourceFile) })
    expect(() => verifyBundle(total)).toThrow(/Source total/)
  })

  it('checks catalog and inventory capacity before projection', () => {
    const source = testBundle()
    const catalog = Array.from({ length: 64 }, (_, i) => ({ id: `example-${String(i).padStart(2, '0')}`, label: 'Example', default: i === 0, skillRoot: `.example-${i}/skills` }))
    expect(parseSource(sourceIndex('0.1.0', source.files, catalog)).integrations.length).toBe(64)
    expect(() => parseSource(sourceIndex('0.1.0', source.files, [...catalog, { id: 'extra', label: 'Extra', default: false, skillRoot: '.extra/skills' }]))).toThrow(/exceeds/)
    for (let i = 0; i < 256; i++) source.files.set(`assets/extra-${i}`, Buffer.alloc(0))
    expect(() => parseSource(sourceIndex('0.1.0', source.files))).toThrow(/exceeds/)
  })

  it('rejects invalid base64, traversal, normalization and byte-length overflow', () => {
    expect(base64('eA==')).toEqual(Buffer.from('x'))
    for (const value of ['eA=', 'eB==', ' eA==', '!!!!', 'é']) expect(() => base64(value)).toThrow()
    assertPath('a'.repeat(limits.path))
    for (const path of ['a'.repeat(limits.path + 1), '界'.repeat(342), '../outside', '.git/config', '.GIT/config', 'a/e\u0301', 'C:/file', 'a/CON', 'a/file.']) expect(() => assertPath(path)).toThrow()
  })
})
