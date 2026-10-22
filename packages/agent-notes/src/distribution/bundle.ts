import { Buffer } from 'node:buffer'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import packageJson from '../../package.json'
import { checkLinks } from '../notes/markdown'
import { NotesError } from '../notes/model'
import { Repository, sha256, Snapshot } from '../notes/snapshot'
import { readInstallation, skillNames } from './manifest'

export interface Bundle { version: string, files: Map<string, Buffer>, skills: Map<string, Buffer> }
export const managerVersion = packageJson.version

export function bundleHash(bundle: Bundle): string {
  const records = [
    ...[...bundle.files].map(([path, bytes]) => [`runtime/${path}`, sha256(bytes)]),
    ...[...bundle.skills].map(([path, bytes]) => [`skills/${path}`, sha256(bytes)]),
  ].sort((a, b) => a[0].localeCompare(b[0]))
  return sha256(Buffer.from(JSON.stringify(records)))
}

export function observeRuntime(source: Snapshot): void {
  const installation = readInstallation(source)
  source.read('.agent-notes/runtime/cli.mjs')
  if (installation && process.argv[1] && resolve(process.argv[1]) === join(source.repository.root, '.agent-notes/runtime/cli.mjs')
    && installation.version !== managerVersion) {
    throw new NotesError('CONCURRENT_CHANGE', 'The runtime version changed before write preflight. Retry with the installed runtime.')
  }
}

/** The same layout is available inside the npm package and the installed runtime. */
export function loadBundle(): Bundle {
  const directory = dirname(fileURLToPath(import.meta.url))
  const installed = directory.endsWith('/.agent-notes/runtime') || directory.endsWith('\\.agent-notes\\runtime')
  const root = installed ? directory : directory.endsWith('/dist') || directory.endsWith('\\dist') ? dirname(directory) : join(directory, '../..')
  const files = new Map<string, Buffer>()
  const collect = (path: string): void => {
    const full = join(root, path)
    const info = lstatSync(full)
    if (info.isSymbolicLink())
      throw new NotesError('INVALID_BUNDLE', 'Bundle assets must be regular files, not symlinks.', path)
    if (info.isDirectory()) {
      for (const name of readdirSync(full).sort())
        collect(`${path}/${name}`)
    }
    else if (info.isFile()) {
      files.set(path, readFileSync(full))
    }
    else { throw new NotesError('INVALID_BUNDLE', 'Unsupported bundle asset.', path) }
  }
  try {
    files.set('cli.mjs', readFileSync(join(root, installed ? 'cli.mjs' : 'dist/cli.mjs')))
    collect('assets')
  }
  catch (error) {
    if (error instanceof NotesError)
      throw error
    throw new NotesError('INVALID_BUNDLE', 'Incomplete distribution. Build first, or reinstall the complete npm package; a standalone CLI file only supports daily commands.')
  }
  if (installed) {
    const installation = readInstallation(new Repository(resolve(root, '../..')).snapshot('worktree'))
    for (const [path, bytes] of files) {
      const asset = installation?.assets.find(asset => asset.path === `.agent-notes/runtime/${path}` && asset.kind === 'file')
      if (!asset || asset.sha256 !== sha256(bytes))
        throw new NotesError('INVALID_BUNDLE', 'Installed source assets are modified or unknown. Use a complete npm package to repair them.', `.agent-notes/runtime/${path}`)
    }
  }
  const skills = new Map<string, Buffer>()
  for (const name of skillNames) {
    const prefix = `assets/skills/${name}/`
    if (!files.has(`${prefix}SKILL.md`))
      throw new NotesError('INVALID_BUNDLE', `Bundle is missing ${name}.`)
    for (const [path, bytes] of files) {
      if (path.startsWith(prefix))
        skills.set(path.slice('assets/skills/'.length), bytes)
    }
  }
  const content = new Snapshot(new Repository(root), 'commit', new Map()).overlay(files)
  const problems = checkLinks(content, [...files.keys()].filter(path => /\.md$/i.test(path)))
  if (problems.length)
    throw new NotesError('INVALID_BUNDLE', `Distribution references must resolve within the bundle: ${problems[0].message}`, problems[0].path)
  return { version: managerVersion, files, skills }
}
