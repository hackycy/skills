import type { Buffer } from 'node:buffer'

export interface Scope {
  paths?: string[]
  topics?: string[]
  global?: true
}

export interface Supersession {
  id: string
  extent: 'full' | 'partial'
  reason: string
  activation?: 'on-proposal'
}

export interface Metadata {
  id: string
  status: 'proposed' | 'implemented' | 'rejected'
  scope: Scope
  read_when: string
  rejection_reason?: string
  relations?: { related?: string[], requires?: string[], supersedes?: Supersession[] }
  archive?: { date: string, reason: string }
}

export interface NoteContent {
  metadata: Metadata
  title: string
  body: string
}

export interface LocatedNote extends NoteContent {
  path: string
  relativePath: string
  lifecycle: Metadata['status'] | 'archived'
  identityPath: string
}

export interface ReadonlyBytes {
  readonly byteLength: number
  copy: () => Buffer
}

export interface Source {
  readonly format: string
  readonly path: string
  readonly hash: string
  readonly bytes: ReadonlyBytes
  readonly residue: { readonly hasComments: boolean, readonly hasOpaque: boolean }
}

export interface Parsed<T> {
  value: T
  source: Source
}

export type Note = Parsed<LocatedNote>

export interface ArchiveEntry {
  path: string
  sha256: string
  source: { path: string, sha256: string, revision?: string }
}

export interface Manifest {
  entries: Record<string, ArchiveEntry>
}

export interface Diagnostic {
  code: string
  message: string
  path?: string
  note_id?: string
  details?: Record<string, unknown>
}

export interface ProjectConfig {
  notes_dir: string
  language: 'zh-CN' | 'en'
}

export interface NoteIndex {
  config: ProjectConfig
  configSource?: Source
  notes: Map<string, Note>
  manifest: Manifest
  manifestSource?: Source
  allowProposalActivation: boolean
  diagnostics: Diagnostic[]
}

export class NotesError extends Error {
  constructor(readonly code: string, message: string, readonly path?: string, readonly exitCode: 1 | 2 | 3 = 1, readonly details?: Diagnostic['details']) {
    super(message)
  }
}

export function diagnostic(error: unknown): Diagnostic {
  return error instanceof NotesError
    ? { code: error.code, message: error.message, ...(error.path ? { path: error.path } : {}), ...(error.details ? { details: error.details } : {}) }
    : { code: 'IO_ERROR', message: error instanceof Error ? error.message : String(error) }
}
