import type { Result } from '../../src/cli/run'
import type { LocatedNote } from '../../src/notes/model'
import { deepStrictEqual, equal, match } from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { productionFormats } from '../../src/notes/formats/production'
import { diagnostic, NotesError } from '../../src/notes/model'
import { parseNote } from '../../src/notes/reader'
import { body, commit, document, ids, metadata, note, project, write } from '../fixtures'
import { configPath, hash, manifestPath, notesRoot, v2Golden } from './fixtures'

const [baseline, current, published] = process.argv.slice(2)
if (![baseline, current, published].every(path => path && isAbsolute(path)))
  throw new Error('Supply absolute paths to the baseline build, candidate build and published CLI.')

interface OldNote extends Omit<LocatedNote, 'metadata'> {
  metadata: LocatedNote['metadata'] & { format: string }
  text: string
  hash: string
}

async function main(): Promise<void> {
  const baselineReader = await import(pathToFileURL(join(dirname(baseline), '../src/notes/reader.ts')).href) as {
    parseNote: (bytes: Buffer, path: string, notesDir: string) => OldNote
  }

  const root = project()
  const path = `${notesRoot}/implemented/architecture/2026-10-21-event-ownership.md`
  const original = document().replace('status: implemented', 'status:    implemented # Preserve for archive')
  const proposed = metadata({ id: ids[1], status: 'proposed' })
  let comparisons = 0

  function cli(executable: string, args: string[], input?: unknown): { status: number, output: Result } {
    const child = spawnSync(process.execPath, [executable, ...args, '--root', root, '--json'], {
      cwd: root,
      input: input === undefined ? undefined : JSON.stringify(input),
      encoding: 'utf8',
    })
    equal(child.error, undefined)
    equal(child.signal, null, child.stderr)
    equal(child.stderr, '')
    return { status: child.status!, output: JSON.parse(child.stdout) as Result }
  }

  function compare(args: string[], input?: unknown): Result {
    const before = cli(baseline, args, input)
    const after = cli(current, args, input)
    deepStrictEqual(after, before, args.join(' '))
    comparisons++
    return before.output
  }

  function expected(path: string): { expected_hash: string, reason: string } {
    return { expected_hash: hash(readFileSync(join(root, path), 'utf8')), reason: 'Keep the recorded decision current.' }
  }

  function outcome<T>(parse: () => T): { value: T } | { issue: ReturnType<typeof diagnostic> } {
    try {
      return { value: parse() }
    }
    catch (error) {
      const local = error instanceof Error && 'code' in error && typeof error.code === 'string' && !(error instanceof NotesError)
        ? new NotesError(error.code, error.message, 'path' in error && typeof error.path === 'string' ? error.path : undefined)
        : error
      return { issue: diagnostic(local) }
    }
  }

  try {
    const corpus = [
      original,
      document(metadata({ scope: { global: true }, read_when: '修改订单发布责任时。' }), body().replace('Event ownership', '订单发布')),
      original.replace('format: agent-note/1\n', ''),
      original.replace('format: agent-note/1', 'format: 1'),
      original.replace('format: agent-note/1', 'format: agent-note/1\nformat: agent-note/1'),
      original.replace('format: agent-note/1', 'format: agent-note/1\nunknown: true'),
      original.replace('read_when:', 'read_when: !Custom'),
      original.replace('scope:', '<<: {default: true}\nscope:'),
      original.replace('src/orders/**', '../orders/**'),
      original.replace('status:    implemented', 'status:    proposed'),
      original.replace('## Decision', '## Unknown'),
      original.replaceAll('\n', '\r\n'),
      `\uFEFF${original}`,
      'A document without frontmatter.',
      Buffer.from([0xFF, 0xFE]),
    ]
    for (const bytes of corpus) {
      write(root, path, typeof bytes === 'string' ? bytes : Buffer.from(bytes))
      const raw = readFileSync(join(root, path))
      const before = outcome(() => {
        const { metadata: { format, ...metadata }, hash, text, ...value } = baselineReader.parseNote(raw, path, notesRoot)
        return { value: { ...value, metadata }, format, hash, text }
      })
      const after = outcome(() => {
        const { value, source } = parseNote(raw, path, notesRoot, productionFormats)
        return { value, format: source.format, hash: source.hash, text: source.bytes.copy().toString('utf8') }
      })
      deepStrictEqual(after, before)
      compare(['check'])
      compare(['show', ids[0]])
      compare(['context', '--topic', 'events'])
    }
    write(root, path, original)
    const projectConfig = readFileSync(join(root, configPath))
    for (const config of ['{}', '{"format":null}', '{"format":"agent-notes-config/1","language":"fr","notes_dir":".agents/notes"}', '{"format":"agent-notes-config/1","format":"agent-notes-config/1"}']) {
      write(root, configPath, config)
      compare(['check'])
    }
    rmSync(join(root, configPath))
    compare(['check'])
    write(root, configPath, projectConfig)
    for (const manifest of ['{}', '{"format":false}', '{"format":"agent-note-archive/1","entries":null}', '{"format":"agent-note-archive/1","entries":{}}']) {
      write(root, manifestPath, manifest)
      compare(['check'])
    }
    rmSync(join(root, manifestPath))
    const proposal = note(root, proposed, 'proposal')
    commit(root)
    compare(['check'])
    compare(['transition', ids[1], '--to', 'pending', '--input', '-'], {})
    compare(['transition', '--to', 'pending'])
    compare(['migrate', ids[0], '--to', 'agent-note/2', '--input', '-'], {})
    const input = `${notesRoot}/local/draft.md`
    const writes = [
      ['create', ['create'], document().replace(/^format:.*\n|^id:.*\n|^status:.*\n/gm, '').replace('Event ownership', 'A separate decision'), { class: 'architecture', status: 'implemented', document: input, rationale: 'A durable decision.' }],
      ['update', ['update', ids[0]], document(metadata({ read_when: 'The new routing guidance.' })), { ...expected(path), document: input }],
      ['deliver', ['transition', ids[1], '--to', 'implemented'], document({ ...proposed, status: 'implemented' }), { ...expected(proposal), document: input }],
      ['reject', ['transition', ids[1], '--to', 'rejected'], '', expected(proposal)],
      ['archive', ['archive', ids[0]], '', expected(path)],
      ['prune', ['prune', ids[0], '--mechanical'], '', { ...expected(path), references: [] }],
    ] as const
    for (const [name, command, draft, content] of writes) {
      write(root, input, draft)
      equal(compare([...command, '--input', '-', '--dry-run'], content).result, 'ok', name)
    }
    equal(cli(published, ['check']).status, 0)
    for (const mixed of [false, true]) {
      if (!mixed) {
        write(root, path, v2Golden)
      }
      else {
        write(root, path, original)
        write(root, path.replace('event-ownership', 'experimental'), v2Golden.replace(ids[0], ids[2]))
      }
      const old = cli(published, ['check'])
      const next = cli(current, ['check'])
      equal(old.status, 2)
      equal(next.status, 2)
      const first = old.output.diagnostics[0]
      equal(first.code, 'UNSUPPORTED_FORMAT')
      match(first.message, /agent-note\/1; found agent-note\/2/)
      deepStrictEqual(next.output.diagnostics[0], { ...first, details: { format: 'agent-note/2', supported_formats: ['agent-note/1'] } })
    }
    console.log(`Compared ${corpus.length} raw Note cases and ${comparisons} CLI invocations. Published and candidate CLIs reject v2 in single-format and mixed trees.`)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
}

void main()
