import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { executeWrite } from '../src/workflow/execute'

const root = process.argv[2]
const mode = process.argv[3]
const id = process.argv[4]
const result = executeWrite(root, { command: 'transition', id, input: '.agent-notes/local/input.json', to: 'rejected', dryRun: false, recover: false }, undefined, {
  afterStep(index) {
    if (index !== 0)
      return
    if (mode === 'conflict') {
      const journal = JSON.parse(readFileSync(join(root, '.agent-notes/local/write-lock/journal.json'), 'utf8'))
      writeFileSync(join(root, journal.entries[0].path), 'Independent editor content\n')
      throw new Error('Injected filesystem failure after external edit')
    }
    process.kill(process.pid, 'SIGKILL')
  },
})
console.log(JSON.stringify(result))
