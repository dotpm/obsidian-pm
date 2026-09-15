import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', client: 'src/client.ts', contract: 'src/contract.ts', testing: 'test/fakeApi.ts' },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outDir: 'dist',
  dts: true,
  clean: true,
  hash: false
})
