import type { Metadata } from '../../src/notes/model'
import { Buffer } from 'node:buffer'
import { stringify } from 'yaml'
import { sha256 } from '../../src/notes/snapshot'
import { body, ids, metadata, write } from '../fixtures'

export const notesRoot = '.agents/notes'
export const manifestPath = `${notesRoot}/archived/manifest.json`
export const configPath = `${notesRoot}/config.json`

export function v2(overrides: Partial<Metadata> = {}, contents = body(overrides.status), extensions?: Record<string, unknown>): string {
  const { read_when: readWhen, format: _format, ...fields } = metadata(overrides)
  return `---\n${stringify({ format: 'agent-note/2', ...fields, readWhen, ...(extensions ? { extensions } : {}) })}---\n${contents}`
}

export function hash(text: string): string {
  return sha256(Buffer.from(text))
}

export function v2Note(root: string, overrides: Partial<Metadata> = {}, slug = 'experimental', contents = body(overrides.status), extensions?: Record<string, unknown>): { path: string, text: string, hash: string } {
  const path = `${notesRoot}/${overrides.status ?? 'implemented'}/architecture/2026-10-21-${slug}.md`
  const text = v2(overrides, contents, extensions)
  write(root, path, text)
  return { path, text, hash: hash(text) }
}

export const v2Golden = `---
format: agent-note/2
id: ${ids[0]}
status:    implemented # Retain status spacing.
scope: { topics: [events, "routing"] } # Retain scope style.
readWhen:      "改变订单发布责任时。" # Retain guidance comment.
extensions:
  vendor: {nested: ["值", true, null]} # Retain opaque bytes.
---
${body().replace('Event ownership', '事件发布权').replace('Problem', '问题').replace('Decision', '决策').replace('Alternatives considered', '考虑过的替代方案').replace('Consequences', '后果').replace('Verification', '验证')}`
