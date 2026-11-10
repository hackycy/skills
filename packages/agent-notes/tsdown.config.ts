import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/cli/main.ts' },
  platform: 'node',
  target: 'node22.12',
  format: 'esm',
  noExternal: [/.*/],
  dts: false,
  clean: true,
  onSuccess: () => {
    execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), 'scripts/source-index.ts'], { stdio: 'inherit' })
  },
})
