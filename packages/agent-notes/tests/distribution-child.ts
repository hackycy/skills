import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { readBundle } from '../src/distribution/bundle'
import { manage } from '../src/distribution/manage'
import { testBundle } from './distribution-fixtures'

const root = process.argv[2]
const operation = process.argv[3] as 'install' | 'repair' | 'tool update' | 'hosts set'
const notesDir = process.argv[5] || '.agents/notes'
const packageRoot = process.argv[6]
const source = packageRoot ? readBundle(path => readFileSync(join(packageRoot, path)), 'dist/source-index.json', path => path === 'cli.mjs' ? 'dist/cli.mjs' : path) : operation === 'repair' || operation === 'hosts set' ? testBundle() : testBundle('0.2.0', { 'assets/new-resource.md': '# Version resource\n' })
const result = manage({ command: operation, root, hosts: operation === 'hosts set' ? (process.argv[7]?.split(',') ?? ['claude-code']) : [], notesDir, dryRun: false, recover: false }, root, source, { afterStep(index) {
  const step = process.argv[4]
  if (step === 'committed')
    return
  if (step) {
    const journal = JSON.parse(readFileSync(join(root, notesDir, 'local/write-lock/journal.json'), 'utf8'))
    const path = journal.entries[index].path
    const next = journal.entries[index + 1]?.path
    if (!(step === 'before-config' && next === `${notesDir}/config.json`) && !(step === 'after-config' && path === `${notesDir}/config.json`) && !(step === 'after-install' && path === `${notesDir}/install.json`))
      return
  }
  process.kill(process.pid, 'SIGKILL')
}, afterCommit() {
  if (process.argv[4] === 'committed')
    process.kill(process.pid, 'SIGKILL')
} })
if (result.result !== 'ok') {
  process.stderr.write(JSON.stringify(result))
  process.exitCode = 1
}
