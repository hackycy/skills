import type { ArchiveEntry, Manifest, Metadata, NoteContent, Parsed, ProjectConfig, ReadonlyBytes, Source } from '../model'
import type { MarkdownCarrier } from './carrier'

export type Kind = 'note' | 'manifest' | 'config'
export interface DraftSource { path: string, bytes: ReadonlyBytes }
export interface NoteDraft {
  metadata: Record<string, unknown>
  body: string
  source: DraftSource
}
export interface NoteContext {
  path: string
  assertPlacement: (metadata: Metadata) => void
}

export interface NoteChanges {
  metadata?: Partial<Pick<Metadata, 'status' | 'scope' | 'read_when' | 'archive'>> & {
    rejection_reason?: string | null
    relations?: Metadata['relations'] | null
  }
  body?: string
}

export type RenderRequest
  = | { purpose: 'create', draft?: NoteDraft }
    | { purpose: 'conversion', origin: Source }

export interface NoteAdapter {
  readonly format: string
  readonly capabilities: Readonly<{ patchFidelity: 'local' | 'legacy' }>
  validate: (value: unknown, path: string) => Metadata
  checkBody: (body: string, status: Metadata['status'], path: string) => string
  parse: (bytes: ReadonlyBytes, context: NoteContext, carrier: MarkdownCarrier) => Parsed<NoteContent>
  render: (note: NoteContent, request: RenderRequest) => ReadonlyBytes
  patch: (original: Source, changes: NoteChanges, draft?: NoteDraft) => ReadonlyBytes
}

export interface ManifestAdapter {
  readonly format: string
  validate: (value: unknown, path: string) => Manifest
  parse: (bytes: ReadonlyBytes, path: string, value: unknown) => Parsed<Manifest>
  renderEmpty: () => ReadonlyBytes
  appendEntry: (original: Manifest, id: string, entry: ArchiveEntry, source?: Source) => ReadonlyBytes
}

export interface ConfigAdapter {
  readonly format: string
  validate: (value: unknown, path: string) => ProjectConfig
  parse: (bytes: ReadonlyBytes, path: string, value: unknown) => Parsed<ProjectConfig>
  renderInitial: (config: ProjectConfig) => ReadonlyBytes
}

interface Adapters {
  note: NoteAdapter
  manifest: ManifestAdapter
  config: ConfigAdapter
}

export type Registration<K extends Kind = Kind> = {
  [P in K]: {
    readonly kind: P
    readonly format: string
    readonly adapter: Adapters[P]
    readonly schema: unknown
    readonly read: boolean
    readonly write: boolean
    readonly migrate: Readonly<{ from: boolean, to: boolean }>
    readonly introducedIn: string | null
    readonly deprecatedIn: string | null
    readonly removedIn: string | null
  }
}[K]
