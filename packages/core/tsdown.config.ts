import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/index.ts',
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outDir: 'dist',
  dts: true,
  clean: true,
  hash: false
})
