import type { Metadata } from '../src/notes/model'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { stringify } from 'yaml'
import { sha256 } from '../src/notes/snapshot'

export const ids = [
  'an-98e9a99f-81c9-4e06-901f-aedb1429d493',
  'an-83869376-c1c7-43c5-a6f5-450c7fe4ee4f',
  'an-019b1195-adb7-4a41-b9cd-d73066b39efa',
]

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agent-notes-')))
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'Notes Test')
  git(root, 'config', 'user.email', 'notes@example.invalid')
  git(root, 'config', 'commit.gpgsign', 'false')
  git(root, 'config', 'core.autocrlf', 'false')
  write(root, '.agent-notes/config.json', JSON.stringify({ format: 'agent-notes-config/1', notes_dir: '.agents/notes', language: 'zh-CN' }))
  return root
}

export function write(root: string, path: string, text: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

export function commit(root: string): string {
  git(root, 'add', '.')
  git(root, 'commit', '--no-verify', '-qm', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}

export function metadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    format: 'agent-note/1',
    id: ids[0],
    status: 'implemented',
    scope: { paths: ['src/orders/**'], topics: ['events'] },
    read_when: 'When changing event ownership.',
    ...overrides,
  }
}

export function body(status = 'implemented'): string {
  return status === 'implemented'
    ? `# Event ownership

## Problem
Publishing from two owners creates duplicate events.

## Decision
The order aggregate owns publication.

## Alternatives considered
Infrastructure publication hides the business transaction boundary.

## Consequences
Other entry points must delegate publication to the aggregate.

## Verification
The duplicate delivery regression test passed for both order entry points.
`
    : `# Event ownership

## Problem
Publishing from two owners creates duplicate events.

## Proposal
The order aggregate should own publication.

## Alternatives considered
Infrastructure publication hides the business transaction boundary.

## Acceptance criteria
Both entry points must emit exactly one event per order.

## Risks
Legacy entry points might bypass the aggregate.
`
}

export function document(meta = metadata(), contents = body(meta.status)): string {
  return `---\n${stringify(meta)}---\n${contents}`
}

export function note(root: string, meta = metadata(), slug = 'event-ownership', contents = body(meta.status)): string {
  const path = `.agents/notes/${meta.archive ? 'archived' : meta.status}/architecture/2026-10-21-${slug}.md`
  write(root, path, document(meta, contents))
  return path
}

export function archive(root: string, path: string, meta = metadata()): string {
  const before = readFileSync(join(root, path))
  const destination = path.replace('/implemented/', '/archived/')
  mkdirSync(dirname(join(root, destination)), { recursive: true })
  renameSync(join(root, path), join(root, destination))
  const after = document({ ...meta, archive: { date: '2026-10-21', reason: 'Retained history after this boundary was removed.' } }, body(meta.status))
  write(root, destination, after)
  write(root, '.agents/notes/archived/manifest.json', JSON.stringify({
    format: 'agent-note-archive/1',
    entries: { [meta.id]: { path: destination.slice('.agents/notes/'.length), sha256: sha256(Buffer.from(after)), source: { path: path.slice('.agents/notes/'.length), sha256: sha256(before) } } },
  }))
  return destination
}
