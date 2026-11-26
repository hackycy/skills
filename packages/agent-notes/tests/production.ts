import type { Options } from '../src/cli/arguments'
import type { InitPrompts } from '../src/cli/init'
import type { Result } from '../src/cli/run'
import type { Bundle } from '../src/distribution/bundle'
import type { ManageOptions } from '../src/distribution/manage'
import type { WriteOptions } from '../src/workflow/input'
import type { TransactionHooks } from '../src/workflow/transaction'
import process from 'node:process'
import { completeInit as initialize, promptInit as prompt } from '../src/cli/init'
import { run as runCLI } from '../src/cli/run'
import { manage as manageInstallation } from '../src/distribution/manage'
import { productionFormats } from '../src/notes/formats/production'
import { executeWrite as write } from '../src/workflow/execute'

export function run(args: string[], cwd = process.cwd(), stdin?: string): Result {
  return runCLI(args, cwd, stdin, productionFormats)
}

export function completeInit(input: Options, cwd: string): Options {
  return initialize(input, cwd, productionFormats)
}

export function promptInit(input: Options, cwd: string, adapter: InitPrompts): Promise<Options> {
  return prompt(input, cwd, productionFormats, adapter)
}

export function manage(options: ManageOptions, cwd: string, bundle?: Bundle, hooks: TransactionHooks = {}): Result {
  return manageInstallation(options, cwd, bundle, hooks, productionFormats)
}

export function executeWrite(root: string, options: WriteOptions, stdin?: string, hooks: TransactionHooks = {}): Result {
  return write(root, options, stdin, hooks, productionFormats)
}
