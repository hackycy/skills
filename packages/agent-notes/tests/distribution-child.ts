import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { manage } from '../src/distribution/manage'

const root = process.argv[2]
const operation = process.argv[3] === 'init' ? 'init' : process.argv[3] === 'repair' ? 'repair' : 'upgrade'
const version = operation === 'repair' ? '0.1.0' : '0.2.0'
const notesDir = process.argv[5] || '.agents/notes'
manage({ command: operation, root, targets: ['agents'], notesDir, dryRun: false, recover: false }, root, {
  version,
  files: new Map([['cli.mjs', Buffer.from('console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))\n')], ['rules.md', Buffer.from(operation === 'repair' ? `Rules ${version}\n` : 'Interrupted upgrade rules\n')]]),
  skills: new Map(['agent-note', 'agent-note-maintenance'].map(name => [`${name}/SKILL.md`, Buffer.from(`Skill ${name} ${version}\n`)])),
}, { afterStep(index) {
  const step = process.argv[4]
  if (step) {
    const journal = JSON.parse(readFileSync(join(root, notesDir, 'local/write-lock/journal.json'), 'utf8'))
    const path = journal.entries[index].path
    const next = journal.entries[index + 1]?.path
    if (!(step === 'before-config' && next === `${notesDir}/config.json`)
      && !(step === 'after-config' && path === `${notesDir}/config.json`)
      && !(step === 'after-install' && path === `${notesDir}/install.json`)) {
      return
    }
  }
  process.kill(process.pid, 'SIGKILL')
} })
