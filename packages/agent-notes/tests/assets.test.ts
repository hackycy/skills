import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkLinks } from '../src/notes/markdown'
import { Repository, Snapshot } from '../src/notes/snapshot'

const root = fileURLToPath(new URL('..', import.meta.url))
const repository = new Repository(root)

function files(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? files(path) : [path]
  })
}

function checkContent(paths: string[]) {
  const content = new Map(paths.map(path => [path, readFileSync(join(root, path))]))
  const snapshot = new Snapshot(repository, 'commit', new Map()).overlay(content)
  return checkLinks(snapshot, paths.filter(path => path.endsWith('.md')))
}

describe('documentation ownership', () => {
  it('keeps product references and anchors within the distributed resources', () => {
    expect(checkContent(files('assets'))).toEqual([])
  })

  it('keeps the public overview and installation guide usable without maintainer files', () => {
    expect(checkContent(['README.md', 'docs/installation.md', ...files('assets')])).toEqual([])
  })

  it('keeps maintenance pointers valid after moving the product contracts', () => {
    const source = repository.snapshot('worktree')
    const paths = ['AGENTS.md', ...files('docs/maintainers')].filter(path => path.endsWith('.md'))
    expect(checkLinks(source, paths)).toEqual([])
  })
})
