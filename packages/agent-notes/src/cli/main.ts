#!/usr/bin/env node
import type { Result } from './run'
import process from 'node:process'
import { delegate } from '../distribution/delegate'
import { diagnostic, NotesError } from '../notes/model'
import { exitCode, help, render, run } from './run'

const args = process.argv.slice(2)
if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
  console.log(help)
}
else {
  let result: Result | undefined
  try {
    const delegated = delegate(args, process.argv[1])
    if (delegated !== undefined)
      process.exitCode = delegated
    else result = run(args)
  }
  catch (error) {
    result = { command: args[0], result: error instanceof NotesError && error.exitCode === 2 ? 'invalid-input' : 'failed', scope: {}, data: {}, diagnostics: [diagnostic(error)], review: [] }
  }
  if (result) {
    console.log(args.includes('--json') ? JSON.stringify(result) : render(result))
    process.exitCode = exitCode(result)
  }
}
