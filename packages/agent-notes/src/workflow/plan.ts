import type { Diagnostic, Metadata, Note, NoteIndex } from '../notes/model'
import type { LinkChange } from '../notes/rewrite'
import type { Snapshot } from '../notes/snapshot'
import type { WriteOptions } from './input'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { anchors, checkBody, links, relativeTarget } from '../notes/markdown'
import { NotesError } from '../notes/model'
import { parseNote, readIndex } from '../notes/reader'
import { supersededBy } from '../notes/relations'
import { rewriteLinks } from '../notes/rewrite'
import { sha256 } from '../notes/snapshot'
import { activeMarkdown } from '../notes/validation'
import { archiveBytes, classes, draft, expectedHash, object, patchMetadata, requiredText, serialize } from './input'

export interface WritePlan {
  changes: Map<string, Buffer | null>
  review: Diagnostic[]
  data: Record<string, unknown>
}

function hashGuard(note: Note, hash: unknown): void {
  if (note.hash !== expectedHash(hash))
    throw new NotesError('CONCURRENT_CHANGE', 'expected_hash is stale; read the current Note and retry.', note.path)
}

function liveNote(index: NoteIndex, id: string): Note {
  const note = index.notes.get(id)
  if (!note)
    throw new NotesError('NOTE_NOT_FOUND', `No Note with ID ${id}.`, undefined, 2)
  if (note.lifecycle === 'archived')
    throw new NotesError('FROZEN_NOTE_CHANGED', 'Archived Notes cannot be updated, transitioned, archived again or pruned.', note.path)
  return note
}

function relationsWithBacklink(metadata: Metadata, id: string): Metadata['relations'] {
  return { ...metadata.relations, related: [...new Set([...(metadata.relations?.related ?? []), id])] }
}

function normalizeRelations(relations: Metadata['relations']): Metadata['relations'] {
  const result = { ...relations }
  for (const kind of ['related', 'requires', 'supersedes'] as const) {
    if (!result[kind]?.length)
      delete result[kind]
  }
  return Object.keys(result).length ? result : undefined
}

function editDraft(snapshot: Snapshot, note: Note, path: unknown, status: Metadata['status']): Buffer {
  const input = draft(snapshot, path)
  if (input.metadata.id !== note.metadata.id || input.metadata.format !== 'agent-note/1'
    || ![note.metadata.status, status].includes(input.metadata.status as Metadata['status'])
    || 'archive' in input.metadata || 'rejection_reason' in input.metadata) {
    throw new NotesError('INVALID_INPUT', 'An edit draft must preserve format and ID, carry the original or destination status, and contain no archive/rejection metadata.', undefined, 2)
  }
  return serialize({ ...input.metadata, status }, input.body)
}

function noteBody(text: string): { prefix: string, body: string } {
  const prefix = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text)?.[0] ?? ''
  return { prefix, body: text.slice(prefix.length) }
}

function referenceText(bytes: Buffer, path: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  }
  catch {
    throw new NotesError('INVALID_ENCODING', 'Cannot safely rewrite a Markdown reference source containing invalid UTF-8.', path)
  }
}

function repairDocument(text: string, oldPath: string, newPath: string, changes: Map<string, LinkChange>): Buffer {
  const { prefix, body } = noteBody(text)
  return Buffer.from(prefix + rewriteLinks(body, oldPath, newPath, changes))
}

function removeRelation(metadata: Metadata, oldId: string, target: string | null): Metadata['relations'] {
  const relations = structuredClone(metadata.relations ?? {})
  if (target === metadata.id)
    throw new NotesError('INVALID_INPUT', 'Use target_id: null to remove an owner’s structural reference to the pruned Note; a Note cannot refer to itself.', undefined, 2)
  for (const kind of ['related', 'requires'] as const) {
    if (relations[kind])
      relations[kind] = [...new Set(relations[kind]!.flatMap(id => id === oldId ? target ? [target] : [] : [id]))]
  }
  if (relations.supersedes) {
    relations.supersedes = relations.supersedes.flatMap(edge => edge.id === oldId ? target ? [{ ...edge, id: target }] : [] : [edge])
    const ids = relations.supersedes.map(edge => edge.id)
    if (new Set(ids).size !== ids.length)
      throw new NotesError('AMBIGUOUS_REFERENCE', 'Supersession redirection would combine distinct edges; repair them explicitly first.')
  }
  return normalizeRelations(relations)
}

function pointsTo(note: Note, id: string): boolean {
  return Boolean(note.metadata.relations?.related?.includes(id) || note.metadata.relations?.requires?.includes(id)
    || note.metadata.relations?.supersedes?.some(edge => edge.id === id))
}

export function planWrite(source: Snapshot, index: NoteIndex, options: WriteOptions, input: Record<string, unknown>, baseline?: Snapshot): WritePlan {
  const changes = new Map<string, Buffer | null>()
  const review: Diagnostic[] = []
  const data: Record<string, unknown> = {}
  const root = index.config.notes_dir
  const date = new Date().toISOString().slice(0, 10)
  let subject: Note
  let destination: string
  const put = (path: string, bytes: Buffer | null): void => {
    const before = source.read(path)
    if (bytes === null ? before === undefined : before?.equals(bytes))
      changes.delete(path)
    else
      changes.set(path, bytes)
  }
  const putNote = (path: string, bytes: Buffer): Note => {
    const note = parseNote(bytes, path, root)
    put(path, bytes)
    return note
  }
  const current = (note: Note): Note => {
    const bytes = changes.get(note.path)
    return bytes ? parseNote(bytes, note.path, root) : note
  }
  const backlink = (note: Note): void => {
    for (const edge of note.metadata.relations?.supersedes ?? []) {
      const target = index.notes.get(edge.id)
      if (!target || target.lifecycle === 'archived')
        continue
      const latest = current(target)
      if (!latest.metadata.relations?.related?.includes(note.metadata.id))
        putNote(latest.path, patchMetadata(latest.text, { relations: relationsWithBacklink(latest.metadata, note.metadata.id) }))
    }
  }

  if (options.command === 'create') {
    object(input, ['class', 'status', 'document', 'rationale'], 'create input')
    requiredText(input.rationale, 'rationale explaining the durable recording value', true)
    if (!classes.includes(String(input.class)) || !['proposed', 'implemented'].includes(String(input.status)))
      throw new NotesError('INVALID_INPUT', 'create requires a supported class and status proposed or implemented.', undefined, 2)
    const document = draft(source, input.document)
    object(document.metadata, ['scope', 'read_when', 'relations'], 'New Note draft metadata')
    const title = checkBody(document.body, String(input.status), String(input.document))
    const slug = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    if (!slug)
      throw new NotesError('INVALID_INPUT', 'The title needs letters or numbers to form a stable filename.', undefined, 2)
    destination = `${root}/${input.status}/${input.class}/${date}-${slug}.md`
    if (source.exists(destination))
      throw new NotesError('PATH_CONFLICT', 'A Note already occupies this filename; adjust the title instead of overwriting it.', destination)
    const id = options.dryRun ? 'an-00000000-0000-4000-8000-000000000000' : `an-${randomUUID()}`
    if (index.notes.has(id))
      throw new NotesError('DUPLICATE_ID', 'Generated identity already exists; retry.', destination)
    subject = putNote(destination, serialize({ ...document.metadata, format: 'agent-note/1', id, status: input.status }, document.body))
    backlink(subject)
    data.candidates = [...index.notes.values()].filter(note => note.lifecycle !== 'archived'
      && (note.title === title || note.metadata.scope.topics?.some(topic => subject.metadata.scope.topics?.includes(topic)))).map(note => ({ id: note.metadata.id, title: note.title, path: note.path }))
    review.push({ code: 'RECORDING_REVIEW', path: destination, message: `Confirm the same decision is not already recorded and the durable rationale appears in the body: ${input.rationale}` })
  }
  else {
    subject = liveNote(index, options.id!)
    destination = subject.path
    hashGuard(subject, input.expected_hash)
    const reason = requiredText(input.reason, 'reason', true)
    data.reason = reason
    if (options.command === 'update') {
      object(input, subject.metadata.status === 'rejected' ? ['expected_hash', 'reason', 'metadata'] : ['expected_hash', 'reason', 'document'], 'update input')
      if (subject.metadata.status === 'rejected') {
        const metadata = object(input.metadata, ['scope', 'read_when', 'relations'], 'Rejected routing metadata')
        if (!Object.keys(metadata).length)
          throw new NotesError('INVALID_INPUT', 'Provide at least one routing metadata field.', undefined, 2)
        if (metadata.relations && typeof metadata.relations === 'object' && !Array.isArray(metadata.relations) && !Object.keys(metadata.relations).length)
          metadata.relations = undefined
        putNote(subject.path, patchMetadata(subject.text, metadata))
      }
      else {
        const next = putNote(subject.path, editDraft(source, subject, input.document, subject.metadata.status))
        backlink(next)
      }
    }
    else if (options.command === 'transition') {
      if (subject.metadata.status !== 'proposed')
        throw new NotesError('INVALID_TRANSITION', 'Only proposed Notes can transition to implemented or rejected.', subject.path)
      object(input, options.to === 'implemented' ? ['expected_hash', 'reason', 'document'] : ['expected_hash', 'reason'], 'transition input')
      destination = `${root}/${options.to}/${subject.identityPath}`
      if (source.exists(destination))
        throw new NotesError('PATH_CONFLICT', 'Transition destination already exists.', destination)
      let bytes: Buffer
      if (options.to === 'implemented') {
        bytes = editDraft(source, subject, input.document, 'implemented')
      }
      else {
        const relations = structuredClone(subject.metadata.relations ?? {})
        if (relations.supersedes) {
          relations.related = [...new Set([...(relations.related ?? []), ...relations.supersedes.map(edge => edge.id)])]
          delete relations.supersedes
        }
        bytes = patchMetadata(subject.text, { status: 'rejected', rejection_reason: reason, relations: normalizeRelations(relations) })
      }
      const next = putNote(destination, bytes)
      put(subject.path, null)
      backlink(next)
    }
    else if (options.command === 'archive') {
      object(input, ['expected_hash', 'reason'], 'archive input')
      if (subject.metadata.status !== 'implemented')
        throw new NotesError('INVALID_TRANSITION', 'Only implemented Notes can be archived.', subject.path)
      destination = `${root}/archived/${subject.identityPath}`
      if (source.exists(destination))
        throw new NotesError('PATH_CONFLICT', 'Archive destination already exists.', destination)
      const bytes = archiveBytes(subject.text, date, reason)
      putNote(destination, bytes)
      put(subject.path, null)
      const manifest = structuredClone(index.manifest)
      const original = baseline?.read(subject.path)
      manifest.entries[subject.metadata.id] = {
        path: `archived/${subject.identityPath}`,
        sha256: sha256(bytes),
        source: { path: subject.relativePath, sha256: subject.hash, ...(original && sha256(original) === subject.hash ? { revision: baseline!.revision } : {}) },
      }
      put(`${root}/archived/manifest.json`, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))
    }
    else {
      object(input, subject.metadata.status === 'implemented'
        ? ['expected_hash', 'reason', 'owner', 'coverage', 'references']
        : ['expected_hash', 'reason', 'references'], 'prune input')
      if (subject.metadata.status === 'proposed')
        throw new NotesError('INVALID_REMOVAL', 'Resolve a proposal to implemented or rejected before pruning.', subject.path)
      if (subject.metadata.status === 'implemented') {
        if (!input.owner || !Array.isArray(input.coverage) || !input.coverage.length)
          throw new NotesError('NEEDS_DECISION', 'An implemented Note needs an owner and concrete coverage mappings before pruning.', subject.path, 3)
        const ownerInput = object(input.owner, ['id', 'expected_hash', 'document'], 'Absorption owner')
        let owner = liveNote(index, requiredText(ownerInput.id, 'owner.id'))
        hashGuard(owner, ownerInput.expected_hash)
        if (owner.metadata.id === subject.metadata.id || owner.metadata.status !== 'implemented'
          || supersededBy(index, owner.metadata.id).some(edge => edge.effective && edge.extent === 'full')) {
          throw new NotesError('INVALID_OWNER', 'The owner must be a different, current implemented decision.', owner.path)
        }
        if (owner.metadata.relations?.supersedes?.some(edge => edge.id === subject.metadata.id && edge.extent === 'partial'))
          throw new NotesError('PARTIAL_ABSORPTION', 'Partial supersession cannot justify deletion; resolve remaining unique content first.', subject.path)
        if (ownerInput.document)
          owner = putNote(owner.path, editDraft(source, owner, ownerInput.document, 'implemented'))
        if (owner.metadata.relations?.supersedes?.some(edge => edge.id === subject.metadata.id && edge.extent === 'partial'))
          throw new NotesError('PARTIAL_ABSORPTION', 'The owner draft still declares partial supersession.', owner.path)
        const sourceAnchors = anchors(subject.body)
        const targetAnchors = anchors(owner.body)
        for (const item of input.coverage) {
          const mapping = object(item, ['source', 'destination'], 'Coverage mapping')
          for (const [field, valid] of [['source', sourceAnchors], ['destination', targetAnchors]] as const) {
            const fragment = requiredText(mapping[field], `coverage.${field}`, true)
            if (!fragment.startsWith('#') || !valid.has(fragment.slice(1)))
              throw new NotesError('INVALID_COVERAGE', `Coverage must point to an existing heading fragment: ${fragment}`, field === 'source' ? subject.path : owner.path)
          }
        }
        backlink(owner)
        data.owner = { id: owner.metadata.id, path: owner.path }
        data.coverage = input.coverage
      }
      if (!Array.isArray(input.references))
        throw new NotesError('NEEDS_DECISION', 'Provide references for every active incoming link/relation, or [] when none exist.', subject.path, 3)
      const references = new Map<string, string | null>()
      for (const item of input.references) {
        const reference = object(item, ['path', 'target_id'], 'Reference disposition')
        const path = requiredText(reference.path, 'references.path')
        if (references.has(path) || (reference.target_id !== null && typeof reference.target_id !== 'string'))
          throw new NotesError('INVALID_INPUT', 'Each reference path needs exactly one target_id or null.', path, 2)
        const targetId = reference.target_id as string | null
        if (targetId !== null && (targetId === subject.metadata.id || !index.notes.has(targetId)))
          throw new NotesError('INVALID_INPUT', 'Reference replacement must name a different existing Note.', path, 2)
        references.set(path, targetId)
      }
      const incoming = new Set<string>()
      const staged = source.overlay(changes)
      const stagedIndex = readIndex(staged)
      for (const snapshot of [source, staged]) {
        for (const path of activeMarkdown(snapshot, index)) {
          if (path === subject.path)
            continue
          const bytes = snapshot.read(path)
          if (bytes && links(noteBody(referenceText(bytes, path)).body).some(link => relativeTarget(path, link.url)?.path === subject.path))
            incoming.add(path)
        }
      }
      for (const candidate of [...index.notes.values(), ...stagedIndex.notes.values()]) {
        if (candidate.lifecycle !== 'archived' && candidate.path !== subject.path && pointsTo(candidate, subject.metadata.id))
          incoming.add(candidate.path)
      }
      for (const path of incoming) {
        if (!references.has(path))
          throw new NotesError('NEEDS_DECISION', 'Specify how to handle this active incoming reference before deleting its target.', path, 3)
      }
      for (const [path, targetId] of references) {
        if (!incoming.has(path))
          throw new NotesError('INVALID_INPUT', 'Reference disposition does not name an active incoming source.', path, 2)
        const targetPath = targetId ? index.notes.get(targetId)!.path : null
        let bytes = staged.read(path)!
        const candidate = [...stagedIndex.notes.values()].find(note => note.path === path)
        if (candidate && pointsTo(candidate, subject.metadata.id))
          bytes = patchMetadata(bytes.toString('utf8'), { relations: removeRelation(candidate.metadata, subject.metadata.id, targetId) })
        put(path, repairDocument(referenceText(bytes, path), path, path, new Map([[subject.path, { path: targetPath }]])))
      }
      put(subject.path, null)
      data.references = input.references
      review.push({ code: 'PRUNE_REVIEW', path: subject.path, note_id: subject.metadata.id, message: subject.metadata.status === 'rejected'
        ? `Confirm the rejected idea no longer prevents a plausible mistake: ${reason}`
        : `Confirm all unique rationale, alternatives, consequences, verification and coverage gaps were absorbed; mappings are locations, not proof: ${reason}` })
    }
  }

  if (destination !== subject.path) {
    const moved = new Map([[subject.path, { path: destination }]])
    for (const path of activeMarkdown(source, index)) {
      if (path === subject.path && options.command === 'archive')
        continue
      const nextPath = path === subject.path ? destination : path
      const bytes = changes.get(nextPath) ?? source.read(path)
      if (bytes)
        put(nextPath, repairDocument(referenceText(bytes, path), path, nextPath, moved))
    }
  }
  data.id = options.command === 'create' && options.dryRun ? null : subject.metadata.id
  data.path = options.command === 'prune' ? subject.path : destination
  data.dry_run = options.dryRun
  if (options.command === 'create' && options.dryRun)
    data.preview_identity = 'an-00000000-0000-4000-8000-000000000000 is a temporary validation placeholder; apply allocates the ID.'
  return { changes, review, data }
}
