import type { Node, YAMLMap, YAMLSeq } from 'yaml'
import type { ReadonlyBytes, Source } from '../../../src/notes/model'
import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'
import { isAlias, isMap, isScalar, isSeq, stringify } from 'yaml'
import { hasComments, readMarkdown, readonlyBytes } from '../../../src/notes/formats/carrier'
import { NotesError } from '../../../src/notes/model'

type Collection = YAMLMap | YAMLSeq
type Address = (string | number)[]
type Mapping = Record<string, unknown>

const isMapping = (value: unknown): value is Mapping => Boolean(value && typeof value === 'object' && !Array.isArray(value))
function inline(value: unknown): string {
  return stringify(value, {
    collectionStyle: 'flow',
    blockQuote: false,
    defaultStringType: 'QUOTE_DOUBLE',
    lineWidth: 0,
  }).trim().replace(/\n\s*/g, ' ')
}

/** Splice YAML source ranges. Decode each intermediate document before locating the next node. */
export function patchLocally(origin: Source, updates: Mapping, body?: string): ReadonlyBytes {
  let carrier = readMarkdown(origin.bytes, origin.path)
  const original = carrier
  const unsafe = (): NotesError => new NotesError('UNSAFE_FORMAT_PATCH', 'Cannot preserve the untouched YAML bytes during this patch.', origin.path)
  const position = (node: Node | null | undefined): [number, number, number] => {
    if (!node?.range)
      throw unsafe()
    return node.range
  }
  const yaml = (): string => carrier.parts[1]
  const nodeAt = (path: Address): Node => {
    const node = path.length ? carrier.document.getIn(path, true) : carrier.document.contents
    if (!node || isAlias(node))
      throw unsafe()
    return node as Node
  }
  const splice = (start: number, end: number, value: string): void => {
    const next = `---\n${yaml().slice(0, start)}${value}${yaml().slice(end)}${carrier.parts[0].slice(yaml().length + 4)}${carrier.body}`
    try {
      carrier = readMarkdown(readonlyBytes(Buffer.from(next)), origin.path)
    }
    catch (error) {
      if (error instanceof NotesError)
        throw unsafe()
      throw error
    }
  }
  const collection = (path: Address): Collection => {
    const node = nodeAt(path)
    if (!isMap(node) && !isSeq(node))
      throw unsafe()
    return node
  }
  const add = (path: Address, key: string | number, value: unknown): void => {
    const parent = collection(path)
    const [, end] = position(parent)
    const entry = typeof key === 'string' ? `${key}: ${inline(value)}` : inline(value)
    if (parent.flow) {
      // A trailing comma belongs to the existing syntax. Insert before that comma.
      const last = parent.items.at(-1)
      if (last) {
        const value = isMap(parent) ? parent.items.at(-1)!.value as Node : last as Node
        const [, at] = position(value)
        if (yaml().slice(at, end - 1).includes('#'))
          throw unsafe()
        splice(at, at, `, ${entry}`)
      }
      else {
        if (yaml().slice(end - 1, end) !== (isMap(parent) ? '}' : ']'))
          throw unsafe()
        splice(end - 1, end - 1, entry)
      }
    }
    else {
      const [start] = position(parent)
      const indent = start - (yaml().lastIndexOf('\n', start - 1) + 1)
      const line = ' '.repeat(indent) + (typeof key === 'number' ? '- ' : '') + entry
      const afterNewline = yaml()[end - 1] === '\n'
      splice(end, end, afterNewline ? `${line}\n` : `\n${line}`)
    }
  }
  const remove = (path: Address, key: string | number): void => {
    const parent = collection(path)
    const items = isMap(parent)
      ? parent.items.map(pair => ({ key: pair.key as Node, value: pair.value as Node }))
      : parent.items.map(value => ({ key: undefined, value: value as Node }))
    const index = typeof key === 'number' ? key : items.findIndex(item => isScalar(item.key) && item.key.value === key)
    const item = items[index]
    const [start] = position(item.key ?? item.value)
    const [, valueEnd, end] = position(item.value)
    if (hasComments(item.value) || (item.key && hasComments(item.key)))
      throw unsafe()
    if (parent.flow) {
      const next = items[index + 1]
      const previous = items[index - 1]
      const from = !next && previous ? position(previous.value)[1] : start
      const until = next ? position(next.key ?? next.value)[0] : valueEnd
      const left = yaml().slice(from, start)
      const right = yaml().slice(valueEnd, until)
      if (![left, right].every(text => /^\s*(?:,\s*)?$/.test(text)))
        throw unsafe()
      // A sole item may also have a trailing comma.
      const trailing = !next && !previous ? /^\s*,/.exec(yaml().slice(until, position(parent)[1] - 1)) : null
      splice(from, until + (trailing?.[0].length ?? 0), '')
    }
    else {
      const from = yaml().lastIndexOf('\n', start - 1) + 1
      if (!/^\s*(?:-\s+)?$/.test(yaml().slice(from, start))
        || !/^\s*$/.test(yaml().slice(valueEnd, end))) {
        throw unsafe()
      }
      splice(from, end, '')
    }
  }
  const change = (path: Address, before: unknown, after: unknown): void => {
    if (isDeepStrictEqual(before, after))
      return
    if (isMapping(before) && isMapping(after) && isMap(nodeAt(path))) {
      for (const [key, value] of Object.entries(after)) {
        if (Object.hasOwn(before, key))
          change([...path, key], before[key], value)
        else
          add(path, key, value)
      }
      for (const key of Object.keys(before)) {
        if (!Object.hasOwn(after, key))
          remove(path, key)
      }
      return
    }
    if (Array.isArray(before) && Array.isArray(after) && after.length && isSeq(nodeAt(path))) {
      // Align common ends before modifying the changed portion.
      let first = 0
      const limit = Math.min(before.length, after.length)
      while (first < limit && isDeepStrictEqual(before[first], after[first]))
        first++
      let suffix = 0
      while (first + suffix < limit && isDeepStrictEqual(before.at(-1 - suffix), after.at(-1 - suffix)))
        suffix++
      const oldEnd = before.length - suffix
      const newEnd = after.length - suffix
      if (newEnd > oldEnd && suffix) {
        // Inserting into the middle needs an unambiguous separator/indentation.
        // Existing values must never be rewritten to make room for the insertion.
        throw unsafe()
      }
      for (let index = first; index < Math.min(oldEnd, newEnd); index++)
        change([...path, index], before[index], after[index])
      for (let index = oldEnd - 1; index >= newEnd; index--)
        remove(path, index)
      for (let index = oldEnd; index < newEnd; index++)
        add(path, index, after[index])
      return
    }
    const node = nodeAt(path)
    const [start, end, afterNode] = position(node)
    const text = yaml().slice(start, end)
    if ((!isScalar(node) || /\n/.test(text)) && hasComments(node))
      throw unsafe()
    const terminated = text.endsWith('\n')
    // A block value on its own line needs a terminator. Only the value range is replaced.
    splice(start, end, inline(after) + (terminated && afterNode === end ? '\n' : ''))
  }

  if (!isMapping(original.metadata))
    throw unsafe()
  const expected = { ...original.metadata }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined)
      continue
    if (value === null)
      delete expected[key]
    else
      expected[key] = value
  }
  change([], original.metadata, expected)
  if (!isDeepStrictEqual(carrier.metadata, expected))
    throw unsafe()
  if (carrier === original && (body === undefined || body === original.body))
    return origin.bytes
  return readonlyBytes(Buffer.from(carrier.parts[0] + (body ?? original.body)))
}
