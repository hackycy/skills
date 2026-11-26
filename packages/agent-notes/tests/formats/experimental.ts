import type { Result } from '../../src/cli/run'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { exitCode, render, run } from '../../src/cli/run'
import { defaultFormats } from '../../src/notes/formats/production'
import { createRegistry } from '../../src/notes/formats/registry'
import * as entries from './entries'

export const experimentalFormats = createRegistry(entries, defaultFormats)

export function runExperimental(args: string[], cwd = process.cwd(), stdin?: string, allowProposalActivation = false): Result {
  return run(args, cwd, stdin, experimentalFormats, allowProposalActivation)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const result = runExperimental(args, process.cwd(), undefined, process.env.AGENT_NOTES_TEST_PROPOSAL_ACTIVATION === '1')
  console.log(args.includes('--json') ? JSON.stringify(result) : render(result))
  process.exitCode = exitCode(result)
}
