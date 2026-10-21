import type { Diagnostic, NoteIndex } from './model'
import type { Snapshot } from './snapshot'
import { checkArchive } from './history'
import { checkLinks } from './markdown'
import { checkRelations } from './relations'

export function currentDiagnostics(index: NoteIndex): Diagnostic[] {
  return [...index.diagnostics, ...checkRelations(index), ...checkArchive(index)]
}

export function isRuntime(path: string): boolean {
  return path.startsWith('.agent-notes/runtime/') || path.startsWith('.agent-notes/local/')
}

export function activeMarkdown(snapshot: Snapshot, index: NoteIndex): string[] {
  const frozen = new Set([...index.notes.values()].filter(note => note.lifecycle === 'archived').map(note => note.path))
  return snapshot.paths().filter(path => /\.md$/i.test(path) && !frozen.has(path) && !isRuntime(path))
}

export function validateCurrent(snapshot: Snapshot, index: NoteIndex): Diagnostic[] {
  return [...currentDiagnostics(index), ...checkLinks(snapshot, activeMarkdown(snapshot, index))]
}
