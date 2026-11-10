import { Buffer } from 'node:buffer'
import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { NotesError } from '../notes/model'
import { safePath } from '../notes/snapshot'

export const limits = { index: 1024 ** 2, integrations: 64, sources: 256, sourceFile: 8 * 1024 ** 2, sourceTotal: 16 * 1024 ** 2, installation: 2 * 1024 ** 2, assets: 1024, path: 1024, entries: 4096, directories: 4096, endpoint: 16 * 1024 ** 2, decoded: 64 * 1024 ** 2, journal: 96 * 1024 ** 2, backup: 64 * 1024 ** 2, summary: 64 * 1024 } as const
export const versionPattern = /^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i
export const hashPattern = /^[\da-f]{64}$/
export const skillNames = ['agent-note', 'agent-note-maintenance'] as const
export const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b))
export const canonical = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`)

export function budget(object: string, actual: number, maximum: number): void {
  if (actual > maximum)
    throw new NotesError('CAPACITY_EXCEEDED', `${object}: ${actual} bytes/items exceeds ${maximum}. Preserve the original and handle it manually; nothing is truncated.`)
}

export function projectPath(path: string): boolean {
  return typeof path === 'string' && safePath(path) && Buffer.byteLength(path) <= limits.path && path === path.normalize('NFC')
    && !path.split('/').some(part => /^(?:\.git|node_modules)$/i.test(part) || /[<>:"|?*\x7F]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
}

export function assertPath(path: string): void {
  if (!projectPath(path))
    throw new NotesError('UNSAFE_PATH', 'Expected a canonical, portable project-relative path (at most 1024 UTF-8 bytes).', path)
}

export function keys(value: unknown, expected: string[], code = 'INVALID_BUNDLE'): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key)))
    throw new NotesError(code, `Expected exactly: ${expected.join(', ')}.`)
}

export function json(bytes: Uint8Array, maximum: number, code = 'INVALID_BUNDLE'): unknown {
  budget('Raw JSON', bytes.byteLength, maximum)
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    // JSON.parse loses duplicate keys; comparing the canonical encoding below
    // rejects duplicates, alternate escapes, BOMs and alternate representations.
    const value: unknown = JSON.parse(text)
    if (!canonical(value).equals(Buffer.from(bytes)))
      throw new Error('Expected canonical JSON: two spaces, LF, fixed field order and one trailing newline.')
    return value
  }
  catch (error) {
    throw new NotesError(code, String(error), undefined, 2)
  }
}

/** Read at most maximum+1 bytes even if the file grows after fstat. */
export function boundedRead(path: string, maximum: number): Buffer {
  const fd = openSync(path, 'r')
  try {
    const info = fstatSync(fd)
    if (!info.isFile())
      throw new NotesError('NOT_REGULAR_FILE', 'Expected a regular file.', path)
    budget(path, info.size, maximum)
    const chunks: Buffer[] = []
    let total = 0
    while (true) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - total))
      const count = readSync(fd, chunk)
      if (!count)
        break
      total += count
      budget(path, total, maximum)
      chunks.push(chunk.subarray(0, count))
    }
    return Buffer.concat(chunks, total)
  }
  finally {
    closeSync(fd)
  }
}

export function base64(value: unknown, maximum: number = limits.endpoint): Buffer {
  if (typeof value !== 'string')
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid base64 endpoint.')
  budget('Encoded endpoint', value.length, Math.ceil(maximum / 3) * 4)
  // A repeated-group regexp can overflow V8's stack on valid large endpoints.
  // Measure the decoded allocation first; the round trip checks padding/bits.
  if (value.length % 4 || /[^A-Z\d+/=]/i.test(value))
    throw new NotesError('RECOVERY_CONFLICT', 'Invalid base64 encoding.')
  budget('Decoded endpoint', value.length / 4 * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0), maximum)
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value)
    throw new NotesError('RECOVERY_CONFLICT', 'Noncanonical base64 encoding.')
  return bytes
}
