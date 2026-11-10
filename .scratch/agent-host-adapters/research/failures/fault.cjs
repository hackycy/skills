// Inject a process failure at an actual npm artifact filesystem commit.
// Product files and the tarball remain unmodified.
const fs = require('node:fs')
const { syncBuiltinESMExports } = require('node:module')
const original = fs.renameSync
let injected = false
fs.renameSync = function (from, to) {
  const result = original.apply(this, arguments)
  const destination = String(to)
  if (!injected && destination.startsWith(process.env.STUDY_PROJECT + '/')
    && !destination.includes('/local/') && !destination.includes('/.git/')) {
    injected = true
    fs.writeFileSync(process.env.STUDY_MARKER, destination)
    if (process.env.STUDY_FAULT === 'kill') process.kill(process.pid, 'SIGKILL')
    if (process.env.STUDY_FAULT === 'stop') process.kill(process.pid, 'SIGSTOP')
  }
  return result
}
syncBuiltinESMExports()
