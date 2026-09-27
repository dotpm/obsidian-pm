import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from 'lightningcss'
import { build } from 'tsdown'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const viewer = join(root, 'packages/viewer')
const dist = join(viewer, 'dist')

mkdirSync(dist, { recursive: true })

await build({
  config: false,
  entry: join(viewer, 'src/main.ts'),
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outDir: dist,
  minify: true,
  sourcemap: false,
  dts: false,
  clean: false,
  hash: false,
  logLevel: 'error',
  outExtensions: () => ({ js: '.js' })
})

const { code } = bundle({ filename: join(viewer, 'src/viewer.css'), minify: true })
const css = code.toString()
const built = readdirSync(dist).find((name) => /^main.*\.js$/.test(name))
if (!built) throw new Error('tsdown wrote no viewer bundle')
const bundled = readFileSync(join(dist, built), 'utf8')
const js = bundled.replace(/<\/script/gi, '<\\/script')

const html = `<!doctype html>
<html lang="__DOTPM_LOCALE__">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__DOTPM_TITLE__</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<script id="dotpm-snapshot" type="application/json">__DOTPM_SNAPSHOT__</script>
<script>${js}</script>
</body>
</html>
`
writeFileSync(join(dist, 'viewer.html'), html)
console.log(`viewer.html -> ${join(dist, 'viewer.html')} (${(html.length / 1024).toFixed(0)} kB)`)

// Hosted pages link these instead of inlining them; manifest.json names the hashed files.
const assets = join(dist, 'assets')
rmSync(assets, { recursive: true, force: true })
mkdirSync(assets)
const hashed = (name, ext, content) => {
  const file = `${name}.${createHash('sha256').update(content).digest('hex').slice(0, 12)}.${ext}`
  writeFileSync(join(assets, file), content)
  return `assets/${file}`
}
const manifest = { js: hashed('viewer', 'js', bundled), css: hashed('viewer', 'css', css) }
writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`hosted assets -> ${manifest.js}, ${manifest.css}`)
