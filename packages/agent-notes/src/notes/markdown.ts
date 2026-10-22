import type { Root, RootContent } from 'mdast'
import type { Diagnostic } from './model'
import type { Snapshot } from './snapshot'
import { posix } from 'node:path'
import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { diagnostic, NotesError } from './model'
import { safePath } from './snapshot'

const parser = unified().use(remarkParse).use(remarkGfm)
export type MarkdownNode = Root | RootContent

export function markdown(text: string): Root {
  return parser.parse(text)
}

export function walk(node: MarkdownNode, visitor: (node: MarkdownNode) => void): void {
  visitor(node)
  if ('children' in node) {
    for (const child of node.children)
      walk(child, visitor)
  }
}

export function anchors(text: string): Set<string> {
  const result = new Set<string>()
  const slugger = new GithubSlugger()
  walk(markdown(text), (node) => {
    if (node.type === 'heading')
      result.add(slugger.slug(toString(node)))
    if (node.type === 'html') {
      for (const match of node.value.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gi))
        result.add(match[1])
    }
  })
  return result
}

export interface MarkdownLink {
  url: string
  start: number
  end: number
}

export function links(text: string): MarkdownLink[] {
  const result: MarkdownLink[] = []
  walk(markdown(text), (node) => {
    if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
      result.push({ url: node.url, start: node.position!.start.offset!, end: node.position!.end.offset! })
    }
  })
  return result
}

export function relativeTarget(source: string, url: string): { path: string, anchor: string } | undefined {
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('/'))
    return undefined
  const hash = url.indexOf('#')
  const beforeHash = hash < 0 ? url : url.slice(0, hash)
  const pathname = decodeURIComponent(beforeHash.split('?')[0])
  const anchor = hash < 0 ? '' : decodeURIComponent(url.slice(hash + 1))
  const path = pathname ? posix.normalize(posix.join(posix.dirname(source), pathname)).replace(/\/$/, '') : source
  if (path !== '.' && !safePath(path))
    throw new NotesError('BROKEN_REFERENCE', `Relative destination escapes the project: ${url}`, source)
  return { path, anchor }
}

export function checkLinks(snapshot: Snapshot, sources: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const headingCache = new Map<string, Set<string>>()
  for (const source of sources) {
    try {
      const bytes = snapshot.read(source)
      if (!bytes)
        continue // A tracked worktree file may have been deleted.
      for (const link of links(bytes.toString('utf8'))) {
        try {
          const target = relativeTarget(source, link.url)
          if (!target)
            continue
          if (!snapshot.exists(target.path))
            throw new NotesError('BROKEN_REFERENCE', `Missing relative destination: ${link.url}`, source)
          if (target.anchor && /\.md$/i.test(target.path)) {
            if (!headingCache.has(target.path)) {
              const destination = snapshot.read(target.path)
              if (!destination)
                throw new NotesError('BROKEN_REFERENCE', `Destination is not a Markdown file: ${link.url}`, source)
              headingCache.set(target.path, anchors(destination.toString('utf8')))
            }
            if (!headingCache.get(target.path)!.has(target.anchor))
              throw new NotesError('BROKEN_ANCHOR', `Missing heading or HTML anchor: ${link.url}`, source)
          }
        }
        catch (error) {
          diagnostics.push(error instanceof URIError
            ? { code: 'BROKEN_REFERENCE', path: source, message: `Invalid URL encoding: ${link.url}` }
            : diagnostic(error))
        }
      }
    }
    catch (error) {
      diagnostics.push(diagnostic(error))
    }
  }
  return diagnostics
}

const proposalSections = [
  ['问题', 'problem'],
  ['提案', 'proposal'],
  ['考虑过的替代方案', 'alternatives considered'],
  ['验收标准', 'acceptance criteria'],
  ['风险', 'risks'],
]
const implementedSections = [
  proposalSections[0],
  ['决策', 'decision'],
  proposalSections[2],
  ['后果', 'consequences'],
  ['验证', 'verification'],
]

export function checkBody(body: string, status: string, path: string): string {
  const tree = markdown(body)
  const all: MarkdownNode[] = []
  walk(tree, node => all.push(node))
  const titles = all.filter(node => node.type === 'heading' && node.depth === 1)
  if (titles.length !== 1 || !toString(titles[0]).trim() || tree.children[0] !== titles[0])
    throw new NotesError('INVALID_BODY', 'Begin with one nonempty H1 title.', path)
  const headings = tree.children.filter(node => node.type === 'heading' && node.depth === 2)
  const names = headings.map(node => toString(node).trim().toLowerCase())
  const required = status === 'implemented' ? implementedSections : proposalSections
  let last = -1
  for (const aliases of required) {
    const found = names.flatMap((name, index) => aliases.includes(name) ? [index] : [])
    if (found.length !== 1 || found[0] <= last)
      throw new NotesError('INVALID_BODY', `Expected one H2 section in contract order: ${aliases.join(' / ')}.`, path)
    last = found[0]
  }
  if (!required[0].includes(names[0]))
    throw new NotesError('INVALID_BODY', 'The first H2 must be Problem / 问题.', path)
  if (status === 'implemented' && names.some(name => ['proposal', 'plan', 'migration plan', 'acceptance criteria', '提案', '计划', '迁移计划', '验收标准'].includes(name)))
    throw new NotesError('INVALID_BODY', 'Implemented Notes must describe the delivered decision, without planning sections.', path)
  for (let i = 0; i < headings.length; i++) {
    const start = tree.children.indexOf(headings[i]) + 1
    const end = i + 1 < headings.length ? tree.children.indexOf(headings[i + 1]) : tree.children.length
    const contents = tree.children.slice(start, end).filter(node => node.type !== 'heading' && node.type !== 'html')
    const text = contents.map(node => toString(node)).join('\n').trim()
    if (!text || /^(?:TODO|TBD|待填写|待补充|\.{3}|…|已完成)[.!。\s]*$/i.test(text)
      || /\{\{[^}]+\}\}|<待填写[^>]*>|\[待填写[^\]]*\]/.test(text)) {
      throw new NotesError('INVALID_BODY', `Section must contain substantive content: ${names[i]}.`, path)
    }
  }
  return toString(titles[0]).trim()
}
