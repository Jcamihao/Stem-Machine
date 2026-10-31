// empacota os testes com esbuild (saída no tmp do sistema, fora do repo) e roda node --test
const { build } = require('esbuild')
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const here = __dirname
const out = path.join(os.tmpdir(), 'sm-remote-server-tests')
fs.mkdirSync(out, { recursive: true })

// import './remote/page.html?raw' vira o texto do arquivo
const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }))
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8'), loader: 'text' }))
  }
}
const common = { bundle: true, platform: 'node', format: 'cjs', logLevel: 'error' }
async function main() {
  await build({ ...common, entryPoints: [path.join(here, 'harness.ts')], outfile: path.join(out, 'harness.cjs') })
  await build({
    ...common,
    entryPoints: [path.join(here, 'glue.ts')],
    outfile: path.join(out, 'glue.cjs'),
    alias: { electron: path.join(here, 'stub-electron.cjs') },
    plugins: [rawPlugin]
  })
  const files = fs.readdirSync(here).filter((f) => f.endsWith('.test.cjs')).map((f) => path.join(here, f))
  const only = process.argv[2]
  const run = only ? files.filter((f) => f.includes(only)) : files
  const r = spawnSync(process.execPath, ['--expose-gc', '--test', '--test-concurrency=1', ...run], {
    stdio: 'inherit',
    env: { ...process.env, SM_HARNESS: path.join(out, 'harness.cjs'), SM_GLUE: path.join(out, 'glue.cjs') }
  })
  process.exit(r.status ?? 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
