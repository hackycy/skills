import type { Diagnostic, NoteIndex, Supersession } from './model'

export interface IncomingSupersession extends Supersession {
  path: string
  effective: boolean
}

export function supersededBy(index: NoteIndex, id: string): IncomingSupersession[] {
  return [...index.notes.values()].flatMap(note => (note.metadata.relations?.supersedes ?? [])
    .filter(edge => edge.id === id)
    .map(edge => ({ id: note.metadata.id, path: note.path, extent: edge.extent, reason: edge.reason, effective: note.metadata.status === 'implemented' && note.lifecycle !== 'archived' })))
}

export function checkRelations(index: NoteIndex): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const note of index.notes.values()) {
    if (note.lifecycle === 'archived')
      continue
    const relations = note.metadata.relations ?? {}
    for (const kind of ['related', 'requires', 'supersedes'] as const) {
      const ids = kind === 'supersedes' ? relations.supersedes?.map(edge => edge.id) ?? [] : relations[kind] ?? []
      const seen = new Set<string>()
      for (const id of ids) {
        const report = (message: string): void => {
          diagnostics.push({ code: 'INVALID_RELATION', note_id: note.metadata.id, path: note.path, message: `${kind} → ${id}: ${message}` })
        }
        const target = index.notes.get(id)
        if (!target)
          report('Target does not exist.')
        if (id === note.metadata.id || seen.has(id))
          report('Self references and duplicate targets are not allowed.')
        seen.add(id)
        if (!target)
          continue
        if (kind === 'requires' && (target.metadata.status !== 'implemented' || target.lifecycle === 'archived'
          || supersededBy(index, id).some(edge => edge.effective && edge.extent === 'full'))) {
          report('Requires must name an active implemented decision that has not been fully superseded.')
        }
        if (kind === 'supersedes') {
          if (target.metadata.status === 'proposed')
            report('Supersedes must name an implemented or rejected decision.')
          if (target.lifecycle !== 'archived' && !target.metadata.relations?.related?.includes(note.metadata.id))
            report('The active target must link back through related.')
        }
      }
    }
  }
  for (const kind of ['requires', 'supersedes'] as const) {
    const done = new Set<string>()
    const stack = new Set<string>()
    const visit = (id: string): void => {
      if (stack.has(id)) {
        diagnostics.push({ code: 'RELATION_CYCLE', note_id: id, path: index.notes.get(id)?.path, message: `${kind} contains a cycle.` })
        return
      }
      if (done.has(id))
        return
      const note = index.notes.get(id)
      if (!note || note.lifecycle === 'archived')
        return
      stack.add(id)
      const ids = kind === 'requires' ? note.metadata.relations?.requires ?? [] : note.metadata.relations?.supersedes?.map(edge => edge.id) ?? []
      for (const target of ids)
        visit(target)
      stack.delete(id)
      done.add(id)
    }
    for (const id of index.notes.keys())
      visit(id)
  }
  return diagnostics
}
