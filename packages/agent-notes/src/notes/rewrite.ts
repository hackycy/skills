import type { MarkdownNode } from './markdown'
import { posix } from 'node:path'
import { markdown, relativeTarget, walk } from './markdown'
import { NotesError } from './model'

interface Edit { start: number, end: number, text: string }
export interface LinkChange { path: string | null }

function offsets(node: MarkdownNode): [number, number] {
  return [node.position!.start.offset!, node.position!.end.offset!]
}

function label(text: string, node: MarkdownNode): string {
  if (node.type === 'image' || node.type === 'imageReference')
    return node.alt ?? ''
  if ('children' in node && node.children.length) {
    const [start] = offsets(node.children[0])
    const [, end] = offsets(node.children[node.children.length - 1])
    return text.slice(start, end)
  }
  return ''
}

function destinationEdit(text: string, node: MarkdownNode & { url: string }, destination: string, source: string): Edit {
  const [start, end] = offsets(node)
  const chunk = text.slice(start, end)
  const matches: number[] = []
  if (!node.url)
    throw new NotesError('AMBIGUOUS_REFERENCE', 'An empty destination needs manual repair before moving this document.', source)
  let offset = chunk.indexOf(node.url)
  while (offset >= 0) {
    const candidate = chunk.slice(0, offset) + destination + chunk.slice(offset + node.url.length)
    const parsed = markdown(candidate)
    let replaced = false
    walk(parsed, (child) => {
      if (child.type === node.type && 'url' in child && child.url === destination)
        replaced = true
    })
    if (replaced)
      matches.push(offset)
    offset = chunk.indexOf(node.url, offset + 1)
  }
  if (matches.length !== 1)
    throw new NotesError('AMBIGUOUS_REFERENCE', `Cannot repair this escaped or ambiguous destination without changing its meaning: ${node.url}`, source)
  return { start: start + matches[0], end: start + matches[0] + node.url.length, text: destination }
}

/** Rewrite parsed destinations only; code fences and surrounding prose retain their bytes. */
export function rewriteLinks(text: string, oldSource: string, newSource: string, changes: Map<string, LinkChange>): string {
  const tree = markdown(text)
  const edits: Edit[] = []
  const removedDefinitions = new Set<string>()
  walk(tree, (node) => {
    if (node.type !== 'link' && node.type !== 'image' && node.type !== 'definition')
      return
    const target = relativeTarget(oldSource, node.url)
    if (!target)
      return
    const change = changes.get(target.path)
    if (!change && oldSource === newSource)
      return
    if (change?.path === null) {
      const [start, end] = offsets(node)
      edits.push({ start, end, text: label(text, node) })
      if (node.type === 'definition')
        removedDefinitions.add(node.identifier)
      return
    }
    const destinationPath = change?.path ?? target.path
    const suffixAt = node.url.search(/[?#]/)
    const suffix = suffixAt < 0 ? '' : node.url.slice(suffixAt)
    const relative = destinationPath === newSource && node.url.startsWith('#')
      ? ''
      : posix.relative(posix.dirname(newSource), destinationPath) || posix.basename(destinationPath)
    const destination = relative.split('/').map(segment => encodeURIComponent(segment)).join('/') + suffix
    if (relativeTarget(newSource, node.url)?.path === destinationPath)
      return
    edits.push(destinationEdit(text, node, destination, oldSource))
  })
  walk(tree, (node) => {
    if ((node.type === 'linkReference' || node.type === 'imageReference') && removedDefinitions.has(node.identifier)) {
      const [start, end] = offsets(node)
      edits.push({ start, end, text: label(text, node) })
    }
  })
  edits.sort((a, b) => b.start - a.start)
  let previous = text.length
  for (const edit of edits) {
    if (edit.end > previous)
      throw new NotesError('AMBIGUOUS_REFERENCE', 'Overlapping reference edits require manual repair.', oldSource)
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
    previous = edit.start
  }
  return text
}
