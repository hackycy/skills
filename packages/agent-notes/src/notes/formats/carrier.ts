import type { Node } from 'yaml'
import type { ReadonlyBytes, Source } from '../model'
import { Buffer } from 'node:buffer'
import { isAlias, isMap, isScalar, parseDocument, visit } from 'yaml'
import { NotesError } from '../model'
import { sha256 } from '../snapshot'

export function decode(bytes: Buffer, path: string): string {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])))
    throw new NotesError('INVALID_ENCODING', 'Use UTF-8 without BOM.', path)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    throw new NotesError('INVALID_ENCODING', 'Invalid UTF-8 bytes.', path)
  }
  if (text.includes('\r') || text.includes('\0'))
    throw new NotesError('INVALID_ENCODING', 'Use LF newlines without NUL bytes.', path)
  return text
}

export function parseJson(bytes: Buffer, path: string): unknown {
  // JSON is a YAML 1.2 subset; this pass also rejects duplicate JSON keys.
  const text = decode(bytes, path)
  try {
    JSON.parse(text)
    return jsonYaml(text, path)
  }
  catch (error) {
    if (error instanceof NotesError)
      throw error
    throw new NotesError('INVALID_JSON', 'Expected valid JSON with unique keys.', path)
  }
}

export function jsonYaml(text: string, path: string): unknown {
  return yamlDocument(text, path).toJS({ maxAliasCount: 0, mapAsMap: false })
}

export function yamlDocument(text: string, path: string): ReturnType<typeof parseDocument> {
  let document: ReturnType<typeof parseDocument>
  try {
    document = parseDocument(text, { schema: 'core', uniqueKeys: true, strict: true })
  }
  catch (error) {
    if (error instanceof RangeError)
      throw new NotesError('INVALID_YAML', 'Document nesting exceeds parser limits.', path)
    throw error
  }
  if (document.errors.length || document.warnings.length)
    throw new NotesError('INVALID_YAML', [...document.errors, ...document.warnings].map(error => error.message).join('; '), path)
  visit(document, (key, node, ancestors) => {
    if (ancestors.length > 128)
      throw new NotesError('INVALID_YAML', 'Document nesting exceeds 128 levels.', path)
    if (isAlias(node) || (node && typeof node === 'object' && 'tag' in node && node.tag))
      throw new NotesError('INVALID_YAML', 'Aliases and explicit YAML tags are not supported.', path)
    if (isMap(node) && node.items.some(pair => !isScalar(pair.key) || typeof pair.key.value !== 'string'))
      throw new NotesError('INVALID_YAML', 'JSON-compatible mappings require string keys.', path)
    if (isScalar(node) && ((key === 'key' && node.value === '<<') || (typeof node.value === 'number' && !Number.isFinite(node.value))))
      throw new NotesError('INVALID_YAML', 'Merge keys and non-JSON numbers are not supported.', path)
  })
  return document
}

export function readonlyBytes(input: Buffer): ReadonlyBytes {
  const bytes = Buffer.from(input)
  return Object.freeze({ byteLength: bytes.length, copy: () => Buffer.from(bytes) })
}

export function source(format: string, path: string, bytes: ReadonlyBytes, hasComments = false, hasOpaque = false): Source {
  return Object.freeze({ format, path, hash: sha256(bytes.copy()), bytes, residue: Object.freeze({ hasComments, hasOpaque }) })
}

export const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/

export interface MarkdownCarrier {
  parts: RegExpExecArray
  document: ReturnType<typeof parseDocument>
  metadata: unknown
  body: string
}

export function readMarkdown(bytes: ReadonlyBytes, path: string): MarkdownCarrier {
  const text = decode(bytes.copy(), path)
  const parts = frontmatter.exec(text)
  if (!parts)
    throw new NotesError('INVALID_FRONTMATTER', 'A Note must begin with YAML frontmatter delimited by --- lines.', path)
  const document = yamlDocument(parts[1], path)
  return { parts, document, metadata: document.toJS({ maxAliasCount: 0, mapAsMap: false }), body: text.slice(parts[0].length) }
}

export function hasComments(document: MarkdownCarrier['document'] | Node): boolean {
  let found = false
  visit(document, (_key, node) => {
    if (node && typeof node === 'object' && (('comment' in node && node.comment != null) || ('commentBefore' in node && node.commentBefore != null))) {
      found = true
      return visit.BREAK
    }
  })
  return found || ('comment' in document && document.comment != null)
    || ('commentBefore' in document && document.commentBefore != null)
}
