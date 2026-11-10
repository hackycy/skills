import type { Snapshot } from '../notes/snapshot'
import type { Projection } from './projection'
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { NotesError } from '../notes/model'
import { sha256 } from '../notes/snapshot'
import { entryText, replaceBlock } from './manifest'
import { ancestors } from './projection'
import { boundedRead, limits } from './protocol'

export { ancestors } from './projection'

/** The block is fixed by project(); this adapter only verifies real Git semantics. */
export function checkGitRules(source: Snapshot, projection: Projection, previousFiles: readonly string[] = []): () => void {
  const scratch = mkdtempSync(join(tmpdir(), 'agent-notes-rules-'))
  const root = source.repository.root
  const external = new Map<string, string | null>()
  const git = (args: string[], input?: string): string => execFileSync('git', ['-C', scratch, ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] })
  const config = (): string => {
    const result = spawnSync('git', ['-C', root, 'config', '--list', '--show-origin', '-z'], { encoding: 'utf8' })
    if (result.error || result.status !== 0)
      throw new NotesError('GIT_REQUIRED', 'Git executable and readable configuration are required before installation.')
    return result.stdout
  }
  const observedConfig = config()
  const readExternal = (path: string): Buffer | undefined => {
    try {
      const bytes = boundedRead(path, limits.endpoint)
      external.set(path, sha256(bytes))
      return bytes
    }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw error
      external.set(path, null)
      return undefined
    }
  }
  const put = (path: string, bytes: Uint8Array): void => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true })
    writeFileSync(join(scratch, path), bytes)
  }
  try {
    git(['init', '-q'])
    if (source.repository.available) {
      for (const name of ['exclude', 'attributes']) {
        const path = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', `info/${name}`], { encoding: 'utf8' }).trim()
        const bytes = readExternal(resolve(root, path))
        if (bytes)
          put(`.git/info/${name}`, bytes)
      }
    }
    for (const name of ['core.excludesFile', 'core.attributesFile']) {
      const value = spawnSync('git', ['-C', root, 'config', '--path', '--get', name], { encoding: 'utf8' })
      if (value.status === 0) {
        const path = value.stdout.trim()
        const bytes = readExternal(isAbsolute(path) ? path : resolve(root, path))
        if (bytes) {
          const local = `.git/${name}`
          put(local, bytes)
          git(['config', name, join(scratch, local)])
        }
      }
    }
    const { files, notesRoot, localRoot } = projection.gitRequirements
    const probes = new Set(files)
    for (const status of ['proposed', 'implemented', 'rejected', 'archived'])
      probes.add(`${notesRoot}/${status}/architecture/2099-01-01-probe.md`)
    probes.add(`${notesRoot}/archived/manifest.json`)
    for (const path of source.paths().filter(path => path.startsWith(`${notesRoot}/`) && !path.startsWith(`${localRoot}/`)))
      probes.add(path)
    const existingNeighbors = source.paths().filter(path => !files.includes(path) && !previousFiles.includes(path) && !path.startsWith(`${notesRoot}/`))
    const neighbors = new Set(existingNeighbors)
    for (const path of files) {
      for (const parent of ancestors(path)) neighbors.add(`${parent}/unknown-neighbor.txt`)
    }
    const rules = new Set(['.gitignore', '.gitattributes'])
    for (const path of [...probes, ...neighbors]) {
      for (const parent of ancestors(path)) {
        rules.add(`${parent}/.gitignore`)
        rules.add(`${parent}/.gitattributes`)
      }
    }
    for (const path of rules) {
      const bytes = source.read(path, limits.endpoint)
      if (bytes)
        put(path, bytes)
    }
    const ignoredPaths = (paths: string[]): Set<string> => {
      if (!paths.length)
        return new Set()
      const check = spawnSync('git', ['-C', scratch, 'check-ignore', '--no-index', '-z', '--stdin'], { input: `${paths.join('\0')}\0`, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      if (check.status !== 0 && check.status !== 1)
        throw new NotesError('GIT_RULES_ERROR', check.stderr || 'Cannot check ignore semantics.')
      return new Set(check.stdout.split('\0').filter(Boolean))
    }
    const previouslyIgnored = ignoredPaths([...neighbors].filter(path => !path.startsWith(`${notesRoot}/`)))
    for (const asset of projection.assets.filter(asset => asset.kind === 'block'))
      put(asset.path, Buffer.from(replaceBlock(entryText(source.read(asset.path, limits.endpoint), asset.path), asset.path, asset.bytes.toString('utf8'))))
    const ignoredAfter = ignoredPaths([...probes, ...neighbors, `${localRoot}/probe`])
    for (const path of probes) {
      if (ignoredAfter.has(path))
        throw new NotesError('GIT_IGNORE_CONFLICT', 'Nested or higher-priority rules hide a required file; adjust them explicitly.', path)
    }
    for (const path of previouslyIgnored) {
      if (!ignoredAfter.has(path))
        throw new NotesError('GIT_IGNORE_CONFLICT', 'Exact asset rules would expose an ignored unknown neighbor; adjust external rules explicitly.', path)
    }
    for (const path of existingNeighbors) {
      if (!previouslyIgnored.has(path) && ignoredAfter.has(path))
        throw new NotesError('GIT_IGNORE_CONFLICT', 'Exact asset rules would hide a visible unknown neighbor; adjust external rules explicitly.', path)
    }
    if (!ignoredAfter.has(`${localRoot}/probe`))
      throw new NotesError('GIT_IGNORE_CONFLICT', 'Local backups and locks must be ignored.', localRoot)
    const attributes = git(['check-attr', '-z', '--stdin', 'text', 'eol'], `${[...probes].join('\0')}\0`).split('\0')
    for (let i = 0; i + 2 < attributes.length; i += 3) {
      const [path, attribute, value] = attributes.slice(i, i + 3)
      if (value !== (attribute === 'text' ? 'set' : 'lf'))
        throw new NotesError('GIT_ATTRIBUTES_CONFLICT', `${attribute}=${value} conflicts with text eol=lf.`, path)
    }
    return () => {
      if (config() !== observedConfig)
        throw new NotesError('CONCURRENT_CHANGE', 'Git configuration changed during management.')
      for (const [path, hash] of external) {
        let current: string | null = null
        try {
          current = sha256(boundedRead(path, limits.endpoint))
        }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
            throw error
        }
        if (current !== hash)
          throw new NotesError('CONCURRENT_CHANGE', 'Git rule input changed.', path)
      }
    }
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
