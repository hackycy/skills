import type { Snapshot } from '../notes/snapshot'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { NotesError } from '../notes/model'
import { block, entryText, replaceBlock, wrapBlock } from './manifest'

export function ancestors(path: string): string[] {
  const segments = path.split('/')
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'))
}

/** Git itself interprets patterns in an isolated directory; dry-run never edits project rules or index. */
export function planGitRules(source: Snapshot, notesDir: string, assetPaths: string[], priorBlocks: Set<string>, managedFiles: string[]): Map<string, string> {
  if (/[\s*?[\]#!]/.test(notesDir))
    throw new NotesError('INVALID_CONFIG', 'Installation notes_dir must be a literal Git pattern without whitespace or glob metacharacters.', notesDir, 2)
  const scratch = mkdtempSync(join(tmpdir(), 'agent-notes-rules-'))
  const git = (args: string[], input?: string): string => execFileSync('git', ['-C', scratch, ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] })
  const put = (path: string, text: string | Uint8Array): void => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true })
    writeFileSync(join(scratch, path), text)
  }
  try {
    git(['init', '-q'])
    if (source.repository.available) {
      for (const name of ['exclude', 'attributes']) {
        const path = execFileSync('git', ['-C', source.repository.root, 'rev-parse', '--git-path', `info/${name}`], { encoding: 'utf8' }).trim()
        try {
          put(`.git/info/${name}`, readFileSync(resolve(source.repository.root, path)))
        }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
            throw error
        }
      }
      for (const name of ['core.excludesFile', 'core.attributesFile']) {
        const result = spawnSync('git', ['-C', source.repository.root, 'config', '--path', '--get', name], { encoding: 'utf8' })
        if (result.status === 0) {
          const path = result.stdout.trim()
          git(['config', name, isAbsolute(path) ? path : resolve(source.repository.root, path)])
        }
      }
    }
    const probes = new Set([...assetPaths, '.agent-notes/config.json', '.agent-notes/install.json'])
    for (const status of ['proposed', 'implemented', 'rejected', 'archived']) {
      for (const category of ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'])
        probes.add(`${notesDir}/${status}/${category}/2099-01-01-rule-probe.md`)
    }
    probes.add(`${notesDir}/archived/manifest.json`)
    for (const path of source.paths().filter(path => path.startsWith(`${notesDir}/`)))
      probes.add(path)
    const rulePaths = new Set(['.gitignore', '.gitattributes'])
    for (const path of probes) {
      for (const parent of ancestors(path)) {
        rulePaths.add(`${parent}/.gitignore`)
        rulePaths.add(`${parent}/.gitattributes`)
      }
    }
    for (const path of rulePaths) {
      const bytes = source.read(path)
      if (bytes)
        put(path, bytes)
    }
    const result = new Map<string, string>()
    const originalIgnore = entryText(source.read('.gitignore'), '.gitignore')
    const existingIgnore = block(originalIgnore, '.gitignore')
    if (existingIgnore && !priorBlocks.has('.gitignore'))
      throw new NotesError('UNOWNED_ASSET', 'Existing agent-notes ignore block has no installation owner.', '.gitignore')
    // Rebuild owned rules from the surrounding project rules, so managed edits
    // are repaired instead of becoming a permanent local template fork.
    const ignoreLines = new Set<string>()
    ignoreLines.add('/.agent-notes/local/')
    const ignored = (path: string): boolean => {
      const check = spawnSync('git', ['-C', scratch, 'check-ignore', '--no-index', '-q', '--', path], { encoding: 'utf8' })
      if (check.status !== 0 && check.status !== 1)
        throw new NotesError('GIT_RULES_ERROR', check.stderr || 'Unable to check ignore rules.', path)
      return check.status === 0
    }
    const updateIgnore = (): void => put('.gitignore', replaceBlock(originalIgnore, '.gitignore', wrapBlock('.gitignore', [...ignoreLines].join('\n'))))
    updateIgnore()
    const checkedParents = new Set<string>()
    for (const path of [...probes].sort()) {
      for (const parent of ancestors(path)) {
        if (checkedParents.has(parent))
          continue
        checkedParents.add(parent)
        if (ignored(`${parent}/`)) {
          ignoreLines.add(`!/${parent}/`)
          ignoreLines.add(`/${parent}/*`)
          updateIgnore()
        }
      }
      if (ignored(path)) {
        ignoreLines.add(`!/${path}`)
        updateIgnore()
      }
    }
    // Future Notes and files in the two named skills/runtime must also be visible.
    const ownedRoots = new Set([notesDir, '.agent-notes/runtime', ...assetPaths.flatMap((path) => {
      const match = /^(\.(?:agents|claude)\/skills\/[^/]+)\//.exec(path)
      return match ? [match[1]] : []
    })])
    for (const root of ownedRoots) {
      for (const line of ignoreLines) {
        if (line.startsWith(`!/${root}/`))
          ignoreLines.delete(line)
      }
      ignoreLines.add(`!/${root}/`)
      ignoreLines.add(`!/${root}/**`)
    }
    // A later negation must never expose drafts, locks or backups.
    ignoreLines.delete('/.agent-notes/local/')
    ignoreLines.add('/.agent-notes/local/')
    updateIgnore()
    for (const path of probes) {
      if (ignored(path))
        throw new NotesError('GIT_IGNORE_CONFLICT', 'A nested or higher-priority ignore rule still hides a required asset; adjust that rule explicitly.', path)
    }
    if (!ignored('.agent-notes/local/probe'))
      throw new NotesError('GIT_IGNORE_CONFLICT', 'Local drafts and backups must be ignored.', '.agent-notes/local')
    result.set('.gitignore', wrapBlock('.gitignore', [...ignoreLines].join('\n')))
    const originalAttributes = entryText(source.read('.gitattributes'), '.gitattributes')
    if (block(originalAttributes, '.gitattributes') && !priorBlocks.has('.gitattributes'))
      throw new NotesError('UNOWNED_ASSET', 'Existing agent-notes attributes block has no installation owner.', '.gitattributes')
    put('.gitattributes', block(originalAttributes, '.gitattributes') ? replaceBlock(originalAttributes, '.gitattributes', '') : originalAttributes)
    const lfFiles = [...new Set([...managedFiles, '.agent-notes/config.json', '.agent-notes/install.json'])].sort()
    const protectedPaths = [...new Set([...probes].filter(path => path.startsWith(`${notesDir}/`)).concat(lfFiles))]
    const checkAttributes = (required: boolean): void => {
      const values = git(['check-attr', '-z', '--stdin', 'text', 'eol'], `${protectedPaths.join('\0')}\0`).split('\0')
      for (let index = 0; index + 2 < values.length; index += 3) {
        const [path, attribute, value] = values.slice(index, index + 3)
        const allowed = attribute === 'text' ? required ? ['set'] : ['set', 'auto', 'unspecified'] : required ? ['lf'] : ['lf', 'unspecified']
        if (!allowed.includes(value))
          throw new NotesError('GIT_ATTRIBUTES_CONFLICT', `${attribute}=${value} conflicts with byte-stable Notes and runtime assets (text eol=lf); adjust the existing rule explicitly.`, path)
      }
    }
    checkAttributes(false)
    const attributes = wrapBlock('.gitattributes', [`/${notesDir}/** text eol=lf`, ...lfFiles.map(path => `/${path} text eol=lf`)].join('\n'))
    put('.gitattributes', replaceBlock(originalAttributes, '.gitattributes', attributes))
    checkAttributes(true)
    result.set('.gitattributes', attributes)
    return result
  }
  finally { rmSync(scratch, { recursive: true, force: true }) }
}
