import type { Metadata } from '../notes/model'
import type { Snapshot } from '../notes/snapshot'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { parseDocument, stringify } from 'yaml'
import { NotesError } from '../notes/model'
import { jsonYaml, parseJson } from '../notes/reader'
import { safePath } from '../notes/snapshot'

export type WriteCommand = 'create' | 'update' | 'transition' | 'archive' | 'prune'
export const writeCommands: string[] = ['create', 'update', 'transition', 'archive', 'prune']
export const classes = ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing']
export interface WriteOptions {
  command: WriteCommand
  id?: string
  input: string
  to?: 'implemented' | 'rejected'
  dryRun: boolean
  recover: boolean
  base?: string
}

export function object(value: unknown, keys: string[], description: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    throw new NotesError('INVALID_INPUT', `${description} must be an object with only: ${keys.join(', ')}.`, undefined, 2)
  return value as Record<string, unknown>
}

export function requiredText(value: unknown, name: string, decision = false): string {
  if (typeof value !== 'string' || !value.trim())
    throw new NotesError(decision ? 'NEEDS_DECISION' : 'INVALID_INPUT', `Provide ${name}.`, undefined, decision ? 3 : 2)
  return value
}

export function expectedHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/.test(value))
    throw new NotesError('INVALID_INPUT', 'expected_hash must be the SHA-256 returned by show.', undefined, 2)
  return value
}

export function file(snapshot: Snapshot, value: unknown): { path: string, bytes: Buffer } {
  const path = requiredText(value, 'a project-relative input/document path')
  if (!safePath(path))
    throw new NotesError('INVALID_INPUT', 'Input paths are relative to the project root and cannot traverse outside it.', path, 2)
  const bytes = snapshot.read(path)
  if (!bytes)
    throw new NotesError('INPUT_NOT_FOUND', 'Input file does not exist.', path, 2)
  return { path, bytes }
}

export function readInput(snapshot: Snapshot, input: string, stdin?: string): Record<string, unknown> {
  const bytes = input === '-' ? Buffer.from(stdin ?? readFileSync(0, 'utf8')) : file(snapshot, input).bytes
  try {
    return object(parseJson(bytes, input), ['class', 'status', 'document', 'rationale', 'expected_hash', 'reason', 'metadata', 'owner', 'coverage', 'references'], 'Operation input')
  }
  catch (error) {
    if (error instanceof NotesError)
      throw new NotesError(error.code, error.message, error.path, 2)
    throw error
  }
}

export interface Draft { metadata: Record<string, unknown>, body: string }

export function draft(snapshot: Snapshot, path: unknown): Draft {
  const input = file(snapshot, path)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes)
  }
  catch { throw new NotesError('INVALID_ENCODING', 'Draft must contain valid UTF-8.', input.path, 2) }
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const parts = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)
  if (!parts)
    throw new NotesError('INVALID_FRONTMATTER', 'Draft must start with YAML frontmatter.', input.path, 2)
  const metadata = jsonYaml(parts[1], input.path)
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new NotesError('INVALID_METADATA', 'Draft metadata must be a mapping.', input.path, 2)
  return { metadata: metadata as Record<string, unknown>, body: text.slice(parts[0].length) }
}

export function serialize(metadata: Metadata | Record<string, unknown>, body: string): Buffer {
  return Buffer.from(`---\n${stringify(metadata)}---\n${body}`)
}

/** Preserve the body exactly when only routing or lifecycle metadata changes. */
export function patchMetadata(text: string, changes: Record<string, unknown>): Buffer {
  const parts = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)!
  const document = parseDocument(parts[1])
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined)
      document.delete(key)
    else
      document.set(key, value)
  }
  return Buffer.from(`---\n${document.toString()}---\n${text.slice(parts[0].length)}`)
}

/** Archive adds metadata without reserializing any existing YAML or body bytes. */
export function archiveBytes(text: string, date: string, reason: string): Buffer {
  const parts = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)!
  return Buffer.from(`---\n${parts[1]}\n${stringify({ archive: { date, reason } })}---\n${text.slice(parts[0].length)}`)
}
