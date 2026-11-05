// Testes de áudio do metrônomo e do pad (lado no PAN L/R, pan, "BPM da música" e TAP).
// Uso: node scripts/audio-tests/run.cjs   (Node 24; precisa de um Chromium e do puppeteer-core)
// CHROME e PUPPETEER_CORE podem ser trocados por variável de ambiente.
const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path')
const { build } = require(path.join(__dirname, '../../node_modules/esbuild'))
const CHROME = process.env.CHROME || path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
const PP = process.env.PUPPETEER_CORE || '/home/caminhao/codeStage/PraiseApp/node_modules/puppeteer-core'
const puppeteer = require(PP)
const PORT = 8791
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-audio-'))
  await build({ entryPoints: [path.join(__dirname, 'entry.ts')], bundle: true, format: 'iife', outfile: path.join(dir, 'bundle.js'), logLevel: 'error' })
  const results = new Map()
  const server = http.createServer((q, s) => {
    if (q.method === 'POST') { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => { try { const j = JSON.parse(b); results.set(j.id, j) } catch {} s.end('ok') }); return }
    const js = q.url.startsWith('/bundle.js'); s.setHeader('content-type', js ? 'text/javascript; charset=utf-8' : 'text/html')
    s.end(js ? fs.readFileSync(path.join(dir, 'bundle.js')) : '<!doctype html><script src="/bundle.js"></script>')
  }).listen(PORT, '127.0.0.1')
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  let fail = 0, pass = 0
  const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)) } }
  const run = async (qs) => {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)))
    await page.goto(`http://127.0.0.1:${PORT}/?${qs}`)
    for (let i = 0; i < 120 && !results.has('?' + qs); i++) await sleep(250)
    await page.close()
    const r = results.get('?' + qs); if (!r) return { error: 'sem resultado ' + JSON.stringify(errs) }
    return r
  }
  // o canal "ativo" tem som; o outro, menos de 2% do ativo
  const only = (r, active) => { const [l, rr] = r; const [a, b] = active === 'L' ? [l, rr] : [rr, l]; return a > 0.002 && b < a * 0.02 }
  const both = (r) => r[0] > 0.002 && r[1] > 0.002 && Math.abs(r[0] - r[1]) < Math.max(r[0], r[1]) * 0.1
  for (const engine of ['metronome', 'pad']) {
    for (const side of ['left', 'right', 'both']) {
      const r = await run(`mode=route&engine=${engine}&split=1&side=${side}`)
      if (r.error) { ok(false, `${engine} lado ${side}: erro`, r.error); continue }
      const good = side === 'both' ? both(r.depois) : only(r.depois, side === 'left' ? 'L' : 'R')
      ok(good, `${engine} no PAN L/R, lado ${side}: o som sai só onde deve`, r.depois)
    }
    const sw = await run(`mode=switch&engine=${engine}&split=1&side=left`)
    ok(!sw.error && only(sw.antes, 'L') && only(sw.depois, 'R'), `${engine}: trocar o lado no meio (L -> R) muda o canal na hora`, sw)
    // sem PAN L/R vale o pan
    const pl = await run(`mode=route&engine=${engine}&split=0&pan=-1&side=right`)
    ok(!pl.error && only(pl.depois, 'L'), `${engine} sem PAN L/R: pan -1 vai para o L (o lado é ignorado)`, pl.depois || pl)
    const pr = await run(`mode=route&engine=${engine}&split=0&pan=1&side=left`)
    ok(!pr.error && only(pr.depois, 'R'), `${engine} sem PAN L/R: pan +1 vai para o R (o lado é ignorado)`, pr.depois || pr)
  }
  const lg = await run('mode=logic')
  ok(!lg.error && Array.isArray(lg.fail) && lg.fail.length === 0, 'lógica do BPM da música e do TAP', lg.fail || lg)
  ok(lg.persistiu === true, 'BPM manual e lado são gravados nas configurações', lg)
  console.log(`${pass} ok, ${fail} falhas`)
  await browser.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true })
  process.exit(fail ? 1 : 0)
})()
