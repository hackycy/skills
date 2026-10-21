import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/cli/main.ts' },
  platform: 'node',
  target: 'node22.12',
  format: 'esm',
  noExternal: [/.*/],
  dts: false,
  clean: true,
})
