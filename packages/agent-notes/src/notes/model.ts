export interface Scope {
  paths?: string[]
  topics?: string[]
  global?: true
}

export interface Supersession {
  id: string
  extent: 'full' | 'partial'
  reason: string
}

export interface Metadata {
  format: 'agent-note/1'
  id: string
  status: 'proposed' | 'implemented' | 'rejected'
  scope: Scope
  read_when: string
  rejection_reason?: string
  relations?: { related?: string[], requires?: string[], supersedes?: Supersession[] }
  archive?: { date: string, reason: string }
}

export interface Note {
  metadata: Metadata
  path: string
  relativePath: string
  lifecycle: string
  identityPath: string
  title: string
  text: string
  body: string
  hash: string
}

export interface ArchiveEntry {
  path: string
  sha256: string
  source: { path: string, sha256: string, revision?: string }
}

export interface Manifest {
  format: 'agent-note-archive/1'
  entries: Record<string, ArchiveEntry>
}

export interface Diagnostic {
  code: string
  message: string
  path?: string
  note_id?: string
}

export interface ProjectConfig {
  format: 'agent-notes-config/1'
  notes_dir: string
  language: 'zh-CN' | 'en'
}

export interface NoteIndex {
  config: ProjectConfig
  notes: Map<string, Note>
  manifest: Manifest
  diagnostics: Diagnostic[]
}

export class NotesError extends Error {
  constructor(readonly code: string, message: string, readonly path?: string, readonly exitCode: 1 | 2 | 3 = 1) {
    super(message)
  }
}

export function diagnostic(error: unknown): Diagnostic {
  return error instanceof NotesError
    ? { code: error.code, message: error.message, ...(error.path ? { path: error.path } : {}) }
    : { code: 'IO_ERROR', message: error instanceof Error ? error.message : String(error) }
}
