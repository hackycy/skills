import type { NoteIndex, Supersession } from '../notes/model'
import type { IncomingSupersession } from '../notes/relations'
import { supersededBy } from '../notes/relations'
import { matchReasons } from './scope'

export interface NotePointer {
  id: string
  title: string
  status: string
  lifecycle: string
  read_when: string
  path: string
  reasons: string[]
  supersedes: Supersession[]
  superseded_by: IncomingSupersession[]
}

export function context(index: NoteIndex, paths: string[], topics: string[], includeArchived: boolean): NotePointer[] {
  const matched = new Map<string, Set<string>>()
  const add = (id: string, reason: string): void => {
    if (!matched.has(id))
      matched.set(id, new Set())
    matched.get(id)!.add(reason)
  }
  for (const [id, note] of index.notes) {
    if (!includeArchived && note.lifecycle === 'archived')
      continue
    for (const reason of matchReasons(note.metadata.scope, paths, topics))
      add(id, reason)
  }
  const visited = new Set<string>()
  const dependencies = (id: string): void => {
    if (visited.has(id))
      return
    visited.add(id)
    const note = index.notes.get(id)!
    if (note.lifecycle === 'archived')
      return
    for (const required of note.metadata.relations?.requires ?? []) {
      add(required, `requires:${id}`)
      dependencies(required)
    }
  }
  for (const id of matched.keys())
    dependencies(id)
  return [...matched].map(([id, reasons]) => {
    const note = index.notes.get(id)!
    return {
      id,
      title: note.title,
      status: note.metadata.status,
      lifecycle: note.lifecycle,
      read_when: note.metadata.read_when,
      path: note.path,
      reasons: [...reasons],
      supersedes: note.metadata.relations?.supersedes ?? [],
      superseded_by: supersededBy(index, id),
    }
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'))
}
