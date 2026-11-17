import type { Bundle } from '../src/distribution/bundle'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { sourceIndex } from '../src/distribution/bundle'

export function testBundle(version = '0.1.0', extra: Record<string, string> = {}): Bundle {
  const files = new Map([
    ['cli.mjs', Buffer.from('console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))\n')],
    ['assets/references/writing.md', Buffer.from(`# Rules ${version}\n`)],
    ['assets/templates/rgignore.txt', readFileSync(new URL('../assets/templates/rgignore.txt', import.meta.url))],
    ...['agent-note', 'agent-note-maintenance'].map(name => [`assets/skills/${name}/SKILL.md`, Buffer.from(`Skill ${name} ${version}\nRun \`node .agents/notes/runtime/cli.mjs\`. [Writing](../../references/writing.md)\n`)] as [string, Buffer]),
    ...Object.entries(extra).map(([path, text]) => [path, Buffer.from(text)] as [string, Buffer]),
  ])
  return { index: sourceIndex(version, files), files }
}

export function legacyBundle(): Bundle {
  const source = testBundle()
  source.files.delete('assets/templates/rgignore.txt')
  source.index = sourceIndex('0.1.0', source.files)
  return source
}
