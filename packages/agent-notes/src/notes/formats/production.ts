import * as entries from './production-entries'
import { createRegistry } from './registry'

export const defaultFormats = Object.freeze({
  note: entries.v1NoteRegistration.format,
  manifest: entries.v1ManifestRegistration.format,
  config: entries.v1ConfigRegistration.format,
})

export const productionFormats = createRegistry(entries, defaultFormats)
