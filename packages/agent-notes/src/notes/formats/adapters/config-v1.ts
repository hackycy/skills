import type { ConfigAdapter, Registration } from '../ports'
import { canonical } from '../../../distribution/protocol'
import { NotesError } from '../../model'
import { safePath } from '../../snapshot'
import { readonlyBytes, source } from '../carrier'

const format = 'agent-notes-config/1'
export const invalidConfig = 'Expected v1 config with a safe notes_dir and language zh-CN or en.'

const adapter: ConfigAdapter = {
  format,
  validate(value, path) {
    if (!value || typeof value !== 'object' || !('format' in value) || value.format !== format
      || !('notes_dir' in value) || typeof value.notes_dir !== 'string' || !safePath(value.notes_dir)
      || !('language' in value) || !['zh-CN', 'en'].includes(String(value.language))
      || Object.keys(value).some(key => !['format', 'notes_dir', 'language'].includes(key))
      || /(?:^|\/)(?:\.git|node_modules)(?:\/|$)/i.test(value.notes_dir)) {
      throw new NotesError('INVALID_CONFIG', invalidConfig, path, 2)
    }
    return { notes_dir: value.notes_dir, language: value.language as 'zh-CN' | 'en' }
  },
  parse(bytes, path, value) {
    return { value: adapter.validate(value, path), source: source(format, path, bytes) }
  },
  renderInitial: config => readonlyBytes(canonical({ format, notes_dir: config.notes_dir, language: config.language })),
}

export const v1ConfigRegistration: Registration<'config'> = {
  kind: 'config',
  format,
  adapter,
  schema: adapter.validate,
  read: true,
  write: true,
  migrate: { from: false, to: false },
  introducedIn: '0.1.0',
  deprecatedIn: null,
  removedIn: null,
}
