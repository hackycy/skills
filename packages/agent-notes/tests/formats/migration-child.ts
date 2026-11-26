import process from 'node:process'
import { executeWrite } from '../../src/workflow/execute'
import { experimentalFormats } from './experimental'

const [root, id, state, expectedHash] = process.argv.slice(2)
function kill(): void {
  process.kill(process.pid, 'SIGKILL')
}
const hooks = state === 'prepared' ? { afterStep: kill } : { afterCommit: kill }
const input = JSON.stringify({ expected_hash: expectedHash, reason: 'Keep the decision in the current format.' })
const options = { command: 'migrate', id, to: 'agent-note/2', input: '-', dryRun: false, recover: false } as const
const result = executeWrite(root, options, input, hooks, experimentalFormats)
console.log(JSON.stringify(result))
