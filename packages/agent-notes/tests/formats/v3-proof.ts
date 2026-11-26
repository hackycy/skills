import type { Result } from '../../src/cli/run'
import { deepStrictEqual, equal } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { ids, metadata, note, project, write } from '../fixtures'
import { notesRoot, v2Note } from './fixtures'

const root = project()
const entry = fileURLToPath(new URL('./experimental.ts', import.meta.url))
function run(args: string[]): Result {
  const child = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), entry, '--root', root, ...args, '--json'], { cwd: root, encoding: 'utf8' })
  equal(child.status, 0, child.stderr || child.stdout)
  return JSON.parse(child.stdout) as Result
}
try {
  const first = note(root, metadata({ id: ids[0] }))
  const second = v2Note(root, { id: ids[1], relations: { requires: [ids[0]] } })
  const third = `${notesRoot}/implemented/architecture/2026-10-21-third-format.md`
  const text = second.text.replace('agent-note/2', 'agent-note/3').replace(ids[1], ids[2]).replace('readWhen:', 'routing:\n  readWhen:')
  write(root, third, text)
  equal(run(['check']).data.notes_checked, 3)
  const pointers = run(['context', '--topic', 'events']).data.notes as { path: string, read_when: string }[]
  deepStrictEqual(pointers.map(note => note.path).sort(), [first, second.path, third].sort())
  equal(pointers.find(note => note.path === third)?.read_when, 'When changing event ownership.')
  equal(run(['show', ids[2]]).data.text, text)
}
finally {
  rmSync(root, { recursive: true, force: true })
}
