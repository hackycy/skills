import { Buffer } from 'node:buffer'
import process from 'node:process'
import { manage } from '../src/distribution/manage'

const root = process.argv[2]
const version = '0.2.0'
manage({ command: process.argv[3] === 'init' ? 'init' : 'upgrade', root, targets: ['agents'], dryRun: false, recover: false }, root, {
  version,
  files: new Map([['cli.mjs', Buffer.from('console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))\n')], ['rules.md', Buffer.from('Interrupted upgrade rules\n')]]),
  skills: new Map(['agent-note', 'agent-note-maintenance'].map(name => [`${name}/SKILL.md`, Buffer.from(`Skill ${name} ${version}\n`)])),
}, { afterStep() { process.kill(process.pid, 'SIGKILL') } })
