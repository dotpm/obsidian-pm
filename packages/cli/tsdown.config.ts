import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  entry: { dotpm: 'src/main.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  dts: false,
  minify: false,
  sourcemap: false,
  clean: true,
  hash: false,
  outExtensions: () => ({ js: '.js' }),
  define: { __CLI_VERSION__: JSON.stringify(version) }
})
