import { v1NoteRegistration as v1 } from '../../src/notes/formats/production-entries'

export { v1ConfigRegistration, v1ManifestRegistration } from '../../src/notes/formats/production-entries'
export { v2NoteRegistration } from './adapters/note-v2'

export const v1NoteRegistration = { ...v1, migrate: { from: true, to: true } }
