import type { Diagnostic, Note, NoteIndex } from './model'
import type { Snapshot } from './snapshot'
import { isDeepStrictEqual } from 'node:util'
import { diagnostic, NotesError } from './model'
import { parseNote } from './reader'
import { rewriteLinks } from './rewrite'
import { sha256 } from './snapshot'

// Permit only byte-preserving URL substitutions to the same Note identity.
// Ambiguous/escaped destinations are deliberately left for an explicit correction.
function repairedBody(old: Note, current: Note, before: NoteIndex, after: NoteIndex): string {
  const moves = new Map<string, { path: string }>()
  for (const previous of before.notes.values()) {
    const next = after.notes.get(previous.metadata.id)
    if (next && next.path !== previous.path)
      moves.set(previous.path, { path: next.path })
  }
  return rewriteLinks(old.body, old.path, current.path, moves)
}

export function checkArchive(index: NoteIndex): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const note of index.notes.values()) {
    if (note.lifecycle !== 'archived')
      continue
    const entry = index.manifest.entries[note.metadata.id]
    if (!entry || entry.path !== note.relativePath || entry.sha256 !== note.hash
      || entry.source.path !== `implemented/${note.identityPath}`) {
      diagnostics.push({ code: 'INVALID_ARCHIVE_SEAL', path: note.path, note_id: note.metadata.id, message: 'Archive identity, source, path and raw-byte hash must agree with the manifest.' })
    }
  }
  for (const [id, entry] of Object.entries(index.manifest.entries)) {
    const note = index.notes.get(id)
    if (!note || note.lifecycle !== 'archived' || note.relativePath !== entry.path)
      diagnostics.push({ code: 'INVALID_ARCHIVE_SEAL', note_id: id, message: 'Every manifest entry must have exactly one archived Note at its sealed path.' })
  }
  return diagnostics
}

export function checkHistory(target: Snapshot, index: NoteIndex, baseline?: Snapshot, before?: NoteIndex): { diagnostics: Diagnostic[], review: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const review: Diagnostic[] = []
  if (!baseline || !before) {
    review.push({ code: 'NO_HISTORY_BASELINE', message: 'Current structure only: no historical baseline is available; previous freezes and transitions cannot be verified.' })
  }
  else {
    for (const [id, entry] of Object.entries(before.manifest.entries)) {
      const path = `${before.config.notes_dir}/${entry.path}`
      const bytes = target.read(path)
      if (!isDeepStrictEqual(entry, index.manifest.entries[id]) || !bytes || sha256(bytes) !== entry.sha256
        || index.notes.get(id)?.path !== path) {
        diagnostics.push({ code: 'FROZEN_NOTE_CHANGED', path, note_id: id, message: 'A baseline archive cannot be edited, moved, deleted or resealed.' })
      }
    }
    for (const [id, previous] of before.notes) {
      const current = index.notes.get(id)
      if (previous.lifecycle === 'archived') {
        if (!current || current.path !== previous.path || current.hash !== previous.hash)
          diagnostics.push({ code: 'FROZEN_NOTE_CHANGED', path: previous.path, note_id: id, message: 'Frozen baseline bytes and identity must remain at the same path, even if the seal or archive marker was removed.' })
        continue
      }
      if (!current) {
        review.push({ code: 'NOTE_REMOVAL_REVIEW', note_id: id, path: previous.path, message: 'Verify rejected history no longer prevents mistakes, or all unique implemented content was absorbed. Snapshot comparison cannot prove absorption.' })
        continue
      }
      if (current.identityPath !== previous.identityPath)
        diagnostics.push({ code: 'NOTE_IDENTITY_CHANGED', note_id: id, path: current.path, message: 'Creation date, slug and class are stable; only lifecycle moves are allowed.' })
      if (previous.metadata.status !== 'proposed' && current.metadata.status !== previous.metadata.status)
        diagnostics.push({ code: 'INVALID_TRANSITION', note_id: id, path: current.path, message: `Cannot transition ${previous.metadata.status} to ${current.metadata.status}.` })
      if (previous.metadata.status === 'rejected') {
        try {
          if (previous.metadata.rejection_reason !== current.metadata.rejection_reason
            || repairedBody(previous, current, before, index) !== current.body) {
            throw new NotesError('REJECTED_NOTE_CHANGED', 'Rejected history preserves its original proposal and rejection reason; record a new related decision.', current.path)
          }
        }
        catch (error) {
          diagnostics.push(diagnostic(error))
        }
      }
      if (previous.hash !== current.hash) {
        review.push({ code: 'NOTE_CHANGE_REVIEW', note_id: id, path: current.path, message: 'Confirm this still describes the same decision, preserves rationale, and reflects delivered facts.' })
        if (previous.metadata.status === 'proposed' && current.metadata.status === 'rejected')
          review.push({ code: 'REJECTION_HISTORY_REVIEW', note_id: id, path: current.path, message: 'The two snapshots cannot reconstruct proposal edits made before rejection; review the retained proposal and verdict.' })
      }
    }
    for (const [id, note] of index.notes) {
      if (!before.notes.has(id))
        review.push({ code: 'NEW_NOTE_REVIEW', note_id: id, path: note.path, message: 'Verify durable rationale and discarded alternatives cannot be carried adequately by code, tests or existing docs, and related code ships in this PR.' })
    }
  }

  for (const [id, entry] of Object.entries(index.manifest.entries)) {
    if (before?.manifest.entries[id])
      continue
    const archived = index.notes.get(id)
    if (!archived)
      continue
    try {
      let source: Note | undefined
      if (entry.source.revision) {
        const sha = target.repository.revision(entry.source.revision)!
        const historical = target.repository.snapshot('commit', sha)
        // A source revision is evidence only for these exact bytes, never for a nearby HEAD.
        const path = `${index.config.notes_dir}/${entry.source.path}`
        const bytes = historical.read(path)
        if (!bytes || sha256(bytes) !== entry.source.sha256)
          throw new NotesError('INVALID_ARCHIVE_SOURCE', 'Source revision does not contain the declared source bytes.', archived.path)
        source = parseNote(bytes, path, index.config.notes_dir)
      }
      else {
        const candidate = before?.notes.get(id)
        if (candidate?.hash === entry.source.sha256 && candidate.relativePath === entry.source.path)
          source = candidate
      }
      if (source) {
        const { archive: _archive, ...metadata } = archived.metadata
        if (source.metadata.status !== 'implemented' || source.lifecycle === 'archived'
          || source.metadata.id !== id || source.body !== archived.body || !isDeepStrictEqual(source.metadata, metadata)) {
          throw new NotesError('INVALID_ARCHIVE_SOURCE', 'Archive must preserve its implemented source body and metadata, adding only archive metadata.', archived.path)
        }
      }
      else {
        review.push({ code: 'ARCHIVE_SOURCE_REVIEW', note_id: id, path: archived.path, message: 'The pre-archive bytes cannot be reconstructed from this baseline. Review the archive operation; the seal alone does not prove source preservation.' })
      }
    }
    catch (error) {
      diagnostics.push(diagnostic(error))
    }
  }
  return { diagnostics, review }
}
