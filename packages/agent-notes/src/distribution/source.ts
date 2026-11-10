import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NotesError } from '../notes/model'

export interface DistributionSource {
  kind: 'package' | 'runtime'
  root: string
}

export function distributionSource(): DistributionSource {
  const directory = dirname(fileURLToPath(import.meta.url))
  if (basename(directory) === 'runtime')
    return { kind: 'runtime', root: directory }
  return { kind: 'package', root: directory.replaceAll('\\', '/').endsWith('/dist') ? dirname(directory) : join(directory, '../..') }
}

export function assertPackageCommand(command: string, kind = distributionSource().kind): void {
  if (kind === 'runtime' && ['install', 'tool update'].includes(command))
    throw new NotesError('PACKAGE_COMMAND_REQUIRED', `Run npx --yes @hackycy/agent-notes@<selected-version> ${command} from the project root. The project runtime provides daily commands, status and repair.`, undefined, 2)
}

export function repairCommand(version: string): string {
  return `npx --yes @hackycy/agent-notes@${version} repair`
}
