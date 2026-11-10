#!/usr/bin/env node
// Fetch only immutable official artifacts, reject unexpected bytes, then extract.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
const repo = path.resolve(process.argv[2] || process.cwd())
const root = path.join(repo, '.cache/host-adapter-study')
const inputs = [
  ['baseline/impeccable-4.8.2.tgz', 'https://registry.npmjs.org/impeccable/-/impeccable-4.8.2.tgz', 'ab8a8d7b994f746bdfb460f29b28fe2fbdcb72e2b6efee9912506a50b9926226', 'impeccable'],
  ['baseline/hackycy-agent-notes-0.3.0.tgz', 'https://registry.npmjs.org/@hackycy/agent-notes/-/agent-notes-0.3.0.tgz', '1ade7e4e25d9155001743d5a057188561c5c41b6f7e3685677a880155d3b0463', 'notes'],
  ['baseline/hackycy-agent-notes-0.2.0.tgz', 'https://registry.npmjs.org/@hackycy/agent-notes/-/agent-notes-0.2.0.tgz', '3ca33a0321ffaeed8cae9d3ba38421312b5ee2fc5ca30c90dfc64a6b71c4b9e5', 'notes-0.2'],
  ['releases/impeccable-darwin-arm64', 'https://github.com/pbakaus/impeccable/releases/download/engine-v0.1.21/impeccable-darwin-arm64', '086fd22e54c445a0e792f66d2f168e35ec93f7c59054e1fde539d0d95b01ce41'],
  ['releases/universal-4.8.2.zip', 'https://github.com/pbakaus/impeccable/releases/download/skill-v4.8.2/universal.zip', '2d91255946127a5862cea0811c269b0943984840de76b90d32e4c2c5293c103a'],
  ['releases/universal-4.8.2.zip.sig.json', 'https://github.com/pbakaus/impeccable/releases/download/skill-v4.8.2/universal.zip.sig.json', '618d51e9b73c44c1a41d9ec951b0ad85d3d343d64b5dfb1152fda91b1786a625'],
]
const records = []
for (const [relative, url, expected, extract] of inputs) {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  let status = 'cached'
  if (!fs.existsSync(target)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()))
    status = response.status
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  if (actual !== expected) throw new Error(`checksum mismatch: ${target}`)
  if (extract) {
    const dest = path.join(root, 'extracted', extract)
    fs.mkdirSync(dest, { recursive: true })
    const result = spawnSync('tar', ['-xzf', target, '-C', dest], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
  }
  records.push({ url, target, status, sha256: actual })
}
fs.chmodSync(path.join(root, 'releases/impeccable-darwin-arm64'), 0o755)
console.log(JSON.stringify(records, null, 2))
