import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { defineConfig } from 'tsdown'

const prod = Boolean(process.env['PRODUCTION'])
const vaultPath = process.env['VAULT_PATH']
const outDir = vaultPath ? `${vaultPath}/.obsidian/plugins/project-manager` : '.'
const viewerTemplate = 'packages/viewer/dist/viewer.html'
if (!existsSync(viewerTemplate)) console.warn('viewer template missing; run `pnpm build:viewer` first or exports will refuse')

export default defineConfig({
  entry: 'src/main.ts',
  format: 'cjs',
  target: 'es2022',
  outDir,
  platform: 'node',
  dts: false,
  minify: prod,
  sourcemap: prod ? false : 'inline',
  clean: false,
  hash: false,
  outExtensions: () => ({ js: '.js' }),
  define: {
    __STYLEGUIDE__: JSON.stringify(!prod || Boolean(process.env['STYLEGUIDE'])),
    __VIEWER_TEMPLATE__: JSON.stringify(existsSync(viewerTemplate) ? readFileSync(viewerTemplate, 'utf8') : '')
  },
  deps: {
    neverBundle: [
      'obsidian',
      'electron',
      '@codemirror/autocomplete',
      '@codemirror/collab',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/search',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
      ...builtinModules
    ]
  }
})
