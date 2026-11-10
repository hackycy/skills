import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import packageJson from '../package.json'
import { sourceIndex } from '../src/distribution/bundle'

const files = new Map([['cli.mjs', readFileSync('dist/cli.mjs')]])
function walk(root: string): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory())
      walk(path)
    else if (entry.isFile())
      files.set(path, readFileSync(path))
    else throw new Error(`Unexpected build resource: ${path}`)
  }
}
walk('assets')
writeFileSync('dist/source-index.json', sourceIndex(packageJson.version, files))
