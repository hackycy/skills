import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [repo, root, operation] = process.argv.slice(2)
const { manage } = await import(pathToFileURL(join(repo, 'packages/agent-notes/src/distribution/manage.ts')))
const { recoverTransaction } = await import(pathToFileURL(join(repo, 'packages/agent-notes/src/workflow/transaction.ts')))
if (operation === 'recover') {
  try { console.log(JSON.stringify({ recovered: recoverTransaction(root) })) }
  catch (error) { console.log(JSON.stringify({ code: error.code, message: error.message })); process.exitCode = 1 }
} else {
  const bundle = { version: '0.3.1-study', files: new Map([['cli.mjs', Buffer.from('console.log(JSON.stringify({command:"context",result:"ok",data:{notes:[]},diagnostics:[]}))')]]), skills: new Map(['agent-note', 'agent-note-maintenance'].map(name => [name + '/SKILL.md', Buffer.from(name)])) }
  const result = manage({ command: 'init', root, targets: ['study'], notesDir: 'docs/decisions', dryRun: false, recover: false }, root, bundle, { afterStep: () => process.kill(process.pid, 'SIGKILL') })
  console.log(JSON.stringify(result))
}
