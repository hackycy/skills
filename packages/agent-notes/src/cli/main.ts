#!/usr/bin/env node
import type { Result } from './run'
import process from 'node:process'
import { delegate } from '../distribution/delegate'
import { parseArguments } from './arguments'
import { completeInit, InitCancelled, interactiveInit, promptInit, reportCancellation } from './init'
import { execute, exitCode, failure, render } from './run'

const parsed = parseArguments(process.argv.slice(2))
let result: Result | undefined
try {
  if (parsed.error)
    throw parsed.error
  if (parsed.help) {
    if (parsed.json)
      result = { command: parsed.command, result: 'ok', scope: {}, data: { help: parsed.help }, diagnostics: [], review: [] }
    else console.log(parsed.help)
  }
  else {
    let input = parsed.input!
    if (input.command === 'init')
      input = interactiveInit(input) ? await promptInit(input, process.cwd()) : completeInit(input, process.cwd())
    const delegated = delegate(input, process.argv[1])
    if (delegated !== undefined)
      process.exitCode = delegated
    else result = execute(input)
  }
}
catch (error) {
  if (error instanceof InitCancelled) {
    reportCancellation()
    process.exitCode = 130
  }
  else {
    result = failure(parsed.command, error)
  }
}
if (result) {
  console.log(parsed.json ? JSON.stringify(result) : render(result))
  process.exitCode = exitCode(result)
}
