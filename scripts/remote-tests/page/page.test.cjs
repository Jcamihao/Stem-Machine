// Teste da página do celular (page.html) com Chromium headless contra o servidor falso.
// Uso: node scripts/remote-tests/page/page.test.cjs   (SHOTS=<pasta> para as capturas)
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const puppeteer = require('/home/caminhao/codeStage/PraiseApp/node_modules/puppeteer-core')
const { createFake, PIN } = require('./fake-server.cjs')

const CHROME = process.env.CHROME || '/home/caminhao/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'stem-remote-page-shots')
const WORK = process.env.WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'stem-remote-page-'))
fs.mkdirSync(SHOTS, { recursive: true })
fs.mkdirSync(WORK, { recursive: true })

let pass = 0
let fail = 0
function T(name, ok, detail) {
  if (ok) pass++
  else { fail++; console.log('FALHOU: ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function mkFile(name, bytes) {
  const f = path.join(WORK, name)
  if (!fs.existsSync(f) || fs.statSync(f).size !== bytes) {
    const fd = fs.openSync(f, 'w')
    const chunk = crypto.randomBytes(1024 * 1024)
    let left = bytes
    while (left > 0) { const n = Math.min(left, chunk.length); fs.writeSync(fd, chunk, 0, n); left -= n }
    fs.closeSync(fd)
  }
  return f
}
function sha(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') }

async function main() {
  const S = await createFake().start()
  const base = 'http://127.0.0.1:' + S.port
  const post = (p, b) => fetch(base + p, { method: 'POST', body: JSON.stringify(b === undefined ? null : b) }).then((r) => r.json())
  const getLog = () => fetch(base + '/__log', { method: 'POST' }).then((r) => r.json())

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (/Failed to load resource/.test(m.text())) return // status HTTP de erro e SSE derrubado são intencionais
    if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) errors.push('console: ' + m.text()) })
  const extReq = []
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) extReq.push(r.url()) })
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  const q = (sel) => page.$(sel)
  async function tap(sel) { const el = await page.$(sel); if (!el) throw new Error('sem elemento ' + sel); await el.tap() }
  async function tapBtn(scope, text) {
    const h = await page.evaluateHandle((scope, text) => {
      const root = document.querySelector(scope)
      const bs = root.querySelectorAll('button')
      for (let i = 0; i < bs.length; i++) if (bs[i].textContent.trim() === text && !bs[i].hidden && bs[i].offsetParent !== null) return bs[i]
      return null
    }, scope, text)
    const el = h.asElement()
    if (!el) throw new Error('sem botão "' + text + '" em ' + scope)
    await el.tap()
  }
  const txt = (sel) => page.$eval(sel, (e) => e.textContent.trim())
  const texts = (sel) => page.$$eval(sel, (es) => es.map((e) => e.textContent.trim()))
  const waitText = (sel, re, ms) => page.waitForFunction((sel, re) => { const e = document.querySelector(sel); return !!e && new RegExp(re).test(e.textContent) }, { timeout: ms || 6000 }, sel, re.source || re)
  const visible = (sel) => page.$eval(sel, (e) => !e.hidden && e.offsetParent !== null).catch(() => false)
  async function goTab(t) { await tap('.tab[data-tab="' + t + '"]'); await sleep(120) }
  async function login() {
    await page.goto(base + '/', { waitUntil: 'load' })
    await page.waitForSelector('#keys .key', { visible: true })
    for (const d of PIN.split('')) await page.tap('#keys .key[data-k="' + d + '"]')
    await page.waitForSelector('#app:not([hidden])', { timeout: 4000 })
  }
  async function jobsSet(j) { await post('/__jobs', j); await sleep(200) }

  const song = {
    song: { id: 'aaaaaaaaaaa', title: 'Grande é o Senhor' }, playing: false, position: 12, duration: 200, bpm: 120, keyLabel: 'G', semitones: 0,
    sections: [
      { label: 'intro', name: 'Intro', start: 0, end: 10 }, { label: 'verse', name: 'Verso', start: 10, end: 40 },
      { label: 'chorus', name: 'Refrão', start: 40, end: 70 }, { label: 'bridge', name: 'Ponte', start: 70, end: 90 }
    ],
    currentSection: 1, pendingSection: null, clickOn: false, loopOn: false, pad: { playing: false, key: 0, volume: 0.7 }, scene: null
  }

  // ================= 1. PIN e regressão das telas existentes =================
  await page.goto(base + '/', { waitUntil: 'load' })
  await page.waitForSelector('#pin:not([hidden])')
  for (const d of '111111'.split('')) await page.tap('#keys .key[data-k="' + d + '"]')
  await waitText('#pin-err', /PIN errado/)
  T('PIN errado mostra erro', true)
  await login()
  T('4 abas na barra', (await page.$$('.tab')).length === 4)
  T('aba Tocar vazia mostra "Nenhuma música aberta"', await visible('#play-empty'))
  await post('/__state', song)
  await page.waitForSelector('#play-main:not([hidden])')
  T('Tocar: título', (await txt('#title')) === 'Grande é o Senhor')
  T('Tocar: 4 partes', (await page.$$('#parts .part')).length === 4)
  T('Tocar: parte atual destacada', await page.$eval('#parts .part:nth-child(2)', (e) => e.classList.contains('cur')))
  await tap('#playbtn'); await sleep(150)
  T('Tocar: play manda toggle', (await getLog()).cmds.some((c) => c.type === 'toggle'))
  await tap('#parts .part:nth-child(3)'); await sleep(150)
  T('Tocar: parte manda goToSection 2', (await getLog()).cmds.some((c) => c.type === 'goToSection' && c.index === 2))
  await tap('#tom\\+'); await sleep(100)
  T('Tocar: tom+ manda semitones', (await getLog()).cmds.some((c) => c.type === 'semitones' && c.delta === 1))
  await goTab('songs')
  await page.waitForSelector('#songs-box .row-btn')
  T('Músicas: 3 músicas', (await page.$$('#songs-box .row-btn')).length === 3)
  await page.type('#songs-box .search', 'oceanos')
  await sleep(100)
  T('Músicas: busca filtra', (await page.$$('#songs-box .row-btn')).length === 1)
  await goTab('scenes')
  await page.waitForSelector('#scenes-box .row-btn')
  await tap('#scenes-box .row-btn'); await sleep(100)
  T('Cenas: abre a cena', await visible('#scenes-box .playscene'))
  // guarda de 2 toques com música tocando
  await post('/__state', Object.assign({}, song, { playing: true }))
  await sleep(150)
  await post('/__reset')
  await goTab('songs')
  await page.$eval('#songs-box .search', (e) => { e.value = ''; e.dispatchEvent(new Event('input')) })
  await sleep(100)
  await tap('#songs-box .row-btn:nth-child(2)'); await sleep(150)
  T('Guarda: 1o toque tocando NÃO envia', (await getLog()).cmds.filter((c) => c.type === 'openSong').length === 0)
  await tap('#songs-box .row-btn:nth-child(2)'); await sleep(200)
  T('Guarda: 2o toque envia openSong', (await getLog()).cmds.filter((c) => c.type === 'openSong').length === 1)
  await post('/__state', song)
  // reconexão: derruba o SSE
  await post('/__drop')
  await page.waitForFunction(() => !document.getElementById('banner').hidden, { timeout: 5000 })
  T('Reconexão: faixa "Sem conexão" aparece', true)
  await page.waitForFunction(() => document.getElementById('banner').hidden, { timeout: 12000 })
  T('Reconexão: faixa some ao reconectar', true)

  // ================= 2. aba Adicionar: layout inicial =================
  await goTab('add')
  T('Adicionar: vazio "Nada sendo adicionado agora."', (await txt('#jobs-empty')) === 'Nada sendo adicionado agora.' && (await visible('#jobs-empty')))
  T('Adicionar: selo oculto sem jobs', !(await visible('#badge')))
  const fs18 = await page.$eval('#link-in', (e) => parseFloat(getComputedStyle(e).fontSize))
  T('Adicionar: campo >= 18 px', fs18 >= 18, fs18)
  const attrs = await page.$eval('#link-in', (e) => [e.type, e.getAttribute('inputmode'), e.getAttribute('autocapitalize'), e.getAttribute('autocorrect'), e.getAttribute('spellcheck')])
  T('Adicionar: atributos do campo', attrs.join(',') === 'url,url,off,off,false', attrs)
  const acc = await page.$eval('#file-in', (e) => [e.multiple, e.accept, e.type])
  T('Adicionar: input file multiple + accept', acc[0] === true && acc[2] === 'file' && acc[1].indexOf('audio/*') === 0 && acc[1].indexOf('.opus') > 0, acc)
  T('Adicionar: texto fixo', /Prefira mp3 ou m4a: enviam mais rápido\. Mantenha a tela acesa durante o envio\. Arquivos do Spotify e do Apple Music não podem ser enviados\./.test(await txt('.fnote')))

  // ================= 3. link: respostas =================
  await post('/__reset')
  const link = async (u) => { await page.$eval('#link-in', (e) => { e.value = '' }); await page.type('#link-in', u); await tap('#link-go'); await sleep(300) }
  await link('https://youtu.be/dQw4w9WgXcQ')
  T('Link 202: mensagem', (await txt('#link-msg')) === 'Enviado ao PC. Acompanhe abaixo.')
  T('Link 202: campo limpo', (await page.$eval('#link-in', (e) => e.value)) === '')
  T('Link 202: job aparece "Na fila"', (await texts('#jobs-list .js'))[0] === 'Na fila')
  T('Link 202: selo = 1', (await visible('#badge')) && (await txt('#badge')) === '1')
  await link('https://youtu.be/aaaaaaaaaaa')
  T('Link 200 exists: mensagem', /Essa música já está na biblioteca/.test(await txt('#link-msg')))
  await post('/__reset')
  await post('/__state', Object.assign({}, song, { song: null }))
  await sleep(100)
  await tapBtn('#link-msg', 'Abrir'); await sleep(250)
  T('Link exists: Abrir manda openSong e vai para Tocar', (await getLog()).cmds.some((c) => c.type === 'openSong' && c.id === 'aaaaaaaaaaa') && (await page.$eval('#view-play', (e) => !e.hidden)))
  await post('/__state', song)
  await goTab('add')
  await link('https://youtu.be/dQw4w9WgXcQ')
  T('Link 409: mensagem', (await txt('#link-msg')) === 'Essa música já está sendo adicionada.')
  await link('isto nao e link')
  T('Link 400: mensagem', (await txt('#link-msg')) === 'Link inválido: cole um link do YouTube.')
  T('Link 400: campo restaurado para corrigir', (await page.$eval('#link-in', (e) => e.value)) === 'isto nao e link')
  await link('https://youtu.be/xxxxxxxxxxx?RATE')
  T('Link 429: mensagem', /Muitos toques/.test(await txt('#link-msg')))
  await link('https://youtu.be/xxxxxxxxxxx?BOOM')
  T('Link 500: mensagem', /Erro 500/.test(await txt('#link-msg')))
  await page.$eval('#link-in', (e) => { e.value = '' })
  await page.type('#link-in', 'https://youtu.be/ffffffffff1')
  await page.keyboard.press('Enter'); await sleep(300)
  T('Link: Enter envia', (await getLog()).links.indexOf('https://youtu.be/ffffffffff1') >= 0)
  await tap('#link-go'); await sleep(200)
  T('Link vazio: pede para colar', /Cole um link/.test(await txt('#link-msg')))
  await post('/__jobs', []); await sleep(150)
  // rede caída no link
  await page.setOfflineMode(true)
  await page.$eval('#link-in', (e) => { e.value = 'https://youtu.be/ggggggggggg' })
  await tap('#link-go'); await sleep(400)
  await page.setOfflineMode(false)
  T('Link sem rede: mensagem + campo restaurado', /Sem conexão com o PC/.test(await txt('#link-msg')) && (await page.$eval('#link-in', (e) => e.value)) === 'https://youtu.be/ggggggggggg')
  await page.$eval('#link-in', (e) => { e.value = '' })

  // ================= 4. upload de 20 MB com barra =================
  const f20 = mkFile('Música de teste ção #1.mp3', 20 * 1024 * 1024)
  await post('/__reset')
  await post('/__cfg', { delayMs: 14, respondMs: 1200 })
  // o botão abre o seletor
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 4000 }), tap('#file-pick')])
  T('Escolher arquivo abre o seletor (multiple)', chooser.isMultiple())
  const seen = {}
  await chooser.accept([f20])
  const t0 = Date.now()
  let finished = false
  while (Date.now() - t0 < 30000) {
    const st = await page.$eval('#up-list .js', (e) => e.textContent).catch(() => '')
    if (st) seen[st] = true
    if (/Enviado\. O PC vai separar\./.test(st)) { finished = true; break }
    await sleep(60)
  }
  const pcts = Object.keys(seen).filter((s) => /^Enviando \d+%$/.test(s))
  T('Upload 20 MB: terminou', finished, Object.keys(seen).slice(-5))
  T('Upload: barra passou por vários % (' + pcts.length + ')', pcts.length >= 4, pcts)
  T('Upload: passou por "Gravando no PC…" antes da resposta', !!seen['Gravando no PC…'], Object.keys(seen).slice(-4))
  const lg = await getLog()
  const up = lg.uploads[0]
  T('Upload: 1 pedido', lg.uploads.length === 1, lg.uploads.length)
  T('Upload: bytes e sha256 batem', up && up.bytes === 20 * 1024 * 1024 && up.sha === sha(f20), up && { b: up.bytes })
  T('Upload: nome com encodeURIComponent', up && up.rawName === encodeURIComponent('Música de teste ção #1.mp3') && up.name === 'Música de teste ção #1.mp3', up && up.rawName)
  T('Upload: Authorization Bearer + octet-stream + Content-Length', up && /^Bearer [0-9a-f]{64}$/.test(up.auth) && up.type === 'application/octet-stream' && up.length === 20 * 1024 * 1024, up && [up.type, up.length])
  await sleep(300)
  T('Upload: job local aparece em Em andamento', (await texts('#jobs-list .jt')).indexOf('Música de teste ção #1') >= 0, await texts('#jobs-list .jt'))
  await page.waitForFunction(() => !document.querySelector('#up-list .jc'), { timeout: 12000 })
  T('Upload concluído some da lista sozinho (~8 s)', true)
  await post('/__cfg', { delayMs: 0, respondMs: 0 })
  await post('/__jobs', []); await sleep(150)

  // ================= 5. erros do upload =================
  const small = (n) => mkFile(n, 200 * 1024)
  async function upOne(file) {
    const input = await page.$('#file-in')
    await input.uploadFile(file)
    // uploadFile dispara change
  }
  async function lastCard() { return page.$eval('#up-list .jc:last-child .js', (e) => e.textContent.trim()) }
  async function clearUps() { for (let i = 0; i < 12; i++) { const n = await page.$$('#up-list .jc'); if (!n.length) break; await tapBtn('#up-list', 'Cancelar').catch(async () => { await tapBtn('#up-list', 'Limpar') }); await sleep(80) } }
  for (const [name, re] of [['err413.mp3', /Arquivo grande demais \(máximo 500 MB\)/], ['err415.mp3', /Formato não aceito/], ['err500.mp3', /Erro 500 no PC/]]) {
    await upOne(small(name)); await waitText('#up-list .jc:last-child .js', re, 5000)
    T('Upload erro ' + name, true)
    const hasRetry = await page.$eval('#up-list .jc:last-child', (e) => Array.from(e.querySelectorAll('button')).filter((b) => !b.hidden).map((b) => b.textContent.trim()))
    T(name + ' botões ' + hasRetry.join('/'), name === 'err500.mp3' ? hasRetry.indexOf('Tentar de novo') >= 0 : hasRetry.join() === 'Limpar', hasRetry)
    await tapBtn('#up-list .jc:last-child', 'Limpar'); await sleep(80)
  }
  // 429 + tentar de novo ok
  await post('/__fail', { name: 'err429.mp3', times: 1 })
  await upOne(small('err429.mp3')); await waitText('#up-list .jc:last-child .js', /Muitos envios ao mesmo tempo, espere/, 5000)
  T('Upload 429: mensagem', true)
  await tapBtn('#up-list .jc:last-child', 'Tentar de novo')
  await waitText('#up-list .jc:last-child .js', /Enviado\. O PC vai separar\./, 5000)
  T('Upload 429: Tentar de novo reenvia o mesmo arquivo e conclui', (await getLog()).uploads.filter((u) => u.name === 'err429.mp3').length === 2)
  await clearUps()
  // falha de rede no meio + tentar de novo
  await post('/__fail', { name: 'neterr.mp3', times: 2 })
  await upOne(mkFile('neterr.mp3', 3 * 1024 * 1024))
  await waitText('#up-list .jc:last-child .js', /Envio interrompido/, 8000).catch(async () => { console.log('DEBUG neterr:', await txt('#up-list .jc:last-child .js'), JSON.stringify((await getLog()).uploads.filter((u) => /neterr/.test(u.name || '')))); throw new Error('neterr') })
  T('Upload queda de rede: "Envio interrompido"', true)
  await tapBtn('#up-list .jc:last-child', 'Tentar de novo')
  await waitText('#up-list .jc:last-child .js', /Enviado\. O PC vai separar\./, 8000)
  T('Upload queda de rede: Tentar de novo conclui', true)
  await clearUps()
  // cancelar envio em andamento
  const cdp = await page.createCDPSession()
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 1024 * 1024 }) // rede lenta: 1 MB/s
  await post('/__cfg', { delayMs: 0, respondMs: 0 })
  await post('/__reset')
  await upOne(f20)
  await waitText('#up-list .js', /Enviando [1-9]\d*%|Enviando [1-9]%/, 8000)
  await tapBtn('#up-list', 'Cancelar')
  await waitText('#up-list .js', /Envio cancelado/, 4000)
  for (let i = 0; i < 30 && !(await getLog()).uploadsAborted; i++) await sleep(100)
  T('Cancelar envio: aborta no servidor', (await getLog()).uploadsAborted >= 1, await getLog().then((l) => JSON.stringify(l.uploads)))
  T('Cancelar envio: oferece Tentar de novo', (await texts('#up-list .jc button')).indexOf('Tentar de novo') >= 0)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await post('/__cfg', { delayMs: 0 })
  await tapBtn('#up-list', 'Tentar de novo')
  await waitText('#up-list .js', /Enviado\. O PC vai separar\./, 15000)
  T('Cancelar envio: Tentar de novo reenvia', true)
  await clearUps()
  // fila: vários arquivos, um por vez
  await post('/__reset')
  await post('/__cfg', { delayMs: 8, respondMs: 200 })
  const input = await page.$('#file-in')
  await input.uploadFile(mkFile('fila1.mp3', 2 * 1024 * 1024), mkFile('fila2.m4a', 2 * 1024 * 1024), mkFile('fila3.wav', 2 * 1024 * 1024))
  await sleep(150)
  const first = await texts('#up-list .js')
  T('Fila: 3 cartões, só o 1o enviando, outros "Na fila de envio"', first.length === 3 && /^Enviando|Gravando/.test(first[0]) && first[1] === 'Na fila de envio' && first[2] === 'Na fila de envio', first)
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#up-list .js')).every((e) => /^Enviado/.test(e.textContent)), { timeout: 20000 })
  const l2 = await getLog()
  T('Fila: servidor viu no máximo 1 envio ao mesmo tempo', l2.maxUploads === 1 && l2.uploads.length === 3, l2.maxUploads)
  await clearUps()
  // cancelar item na fila (sem enviar)
  await post('/__reset')
  await post('/__cfg', { delayMs: 30, respondMs: 0 })
  await input.uploadFile(mkFile('q1.mp3', 3 * 1024 * 1024), mkFile('q2.mp3', 1024 * 1024))
  await sleep(200)
  await page.$$eval('#up-list .jc:nth-child(2) button', (bs) => bs.filter((b) => b.textContent === 'Cancelar')[0].click())
  await sleep(100)
  T('Cancelar item na fila remove o cartão', (await page.$$('#up-list .jc')).length === 1)
  await page.waitForFunction(() => /^Enviado/.test(document.querySelector('#up-list .js').textContent), { timeout: 15000 })
  T('Cancelar item na fila: não foi enviado', (await getLog()).uploads.length === 1)
  await post('/__cfg', { delayMs: 0, respondMs: 0 })
  await clearUps()
  // validações locais (sem pedido)
  await post('/__reset')
  await input.uploadFile(mkFile('nota.txt', 1000))
  await waitText('#up-list .js', /Formato não aceito/)
  const huge = path.join(WORK, 'huge.mp3')
  if (!fs.existsSync(huge)) { const fd = fs.openSync(huge, 'w'); fs.ftruncateSync(fd, 501 * 1024 * 1024); fs.closeSync(fd) }
  await input.uploadFile(huge)
  await waitText('#up-list .jc:last-child .js', /Arquivo grande demais \(máximo 500 MB\)/)
  const empty = path.join(WORK, 'vazio.mp3'); fs.writeFileSync(empty, '')
  await input.uploadFile(empty)
  await waitText('#up-list .jc:last-child .js', /Arquivo vazio/)
  await sleep(200)
  T('Validação local (extensão, 501 MB, vazio) sem pedido ao PC', (await getLog()).uploads.length === 0)
  await clearUps()
  // 413 recusado cedo pelo servidor (sem ler o corpo) e conexão fechada
  await post('/__reset')
  await upOne(mkFile('early413.mp3', 8 * 1024 * 1024))
  await page.waitForFunction(() => /Arquivo grande|interrompido|Erro/.test(document.querySelector('#up-list .js').textContent), { timeout: 10000 })
  const early = await txt('#up-list .js')
  console.log('   (info) 413 cedo com corpo de 8 MB não lido -> "' + early + '"')
  T('413 cedo: cartão termina em erro (qualquer das duas mensagens)', /Arquivo grande demais|Envio interrompido/.test(early), early)
  await clearUps()
  // 401 no upload volta ao PIN
  await upOne(small('err401.mp3'))
  await page.waitForSelector('#pin:not([hidden])', { timeout: 5000 })
  await post('/__jobs', [])
  T('Upload 401 volta ao PIN', /Sessão expirada/.test(await txt('#pin-err')))
  await login()
  await post('/__state', song)
  await goTab('add')
  T('Após novo login a aba Adicionar está zerada', (await page.$$('#up-list .jc')).length === 0 && (await visible('#jobs-empty')))

  // ================= 6. lista de jobs =================
  await post('/__reset')
  const J = (id, title, stage, pct, extra) => Object.assign({ id, title, stage, pct }, extra || {})
  await jobsSet([
    J('j1', 'Fila qualquer', 'queued', 0), J('j2', 'Lendo', 'metadata', 0), J('j3', 'Baixando algo', 'download', 40),
    J('j4', 'Convertendo algo', 'convert', 0), J('j5', 'Separando algo', 'separate', 70), J('j6', 'Finalizando algo', 'finalize', 100, {}),
    J('j7', 'Pronta aaa', 'done', 100), J('j8', 'Falhou', 'error', 0, { error: 'yt-dlp falhou' }), J('j9', 'Cancelada', 'error', 0, { error: 'Cancelado' })
  ])
  const stages = await texts('#jobs-list .js')
  T('Jobs: textos de etapa em português', stages.join('|') === 'Na fila|Lendo informações|Baixando 40%|Convertendo|Separando 70%|Finalizando|Pronta|Erro: yt-dlp falhou|Cancelado', stages)
  T('Jobs: selo = 6 em andamento', (await txt('#badge')) === '6')
  const btns = await page.$$eval('#jobs-list .jc', (cs) => cs.map((c) => Array.from(c.querySelectorAll('button')).filter((b) => !b.hidden).map((b) => b.textContent.trim()).join('+')))
  T('Jobs: botões por etapa', btns.join('|') === 'Cancelar|Cancelar|Cancelar|Cancelar|Cancelar|Cancelar|Abrir+Limpar|Limpar|Limpar', btns)
  await page.screenshot({ path: path.join(SHOTS, 'jobs-390.png') })
  // atualização no lugar: o nó do cartão e do botão são os mesmos
  await page.$eval('#jobs-list .jc:nth-child(3)', (e) => { window.__n3 = e; window.__b3 = e.querySelector('button') })
  await jobsSet([
    J('j1', 'Fila qualquer', 'queued', 0), J('j2', 'Lendo', 'metadata', 0), J('j3', 'Baixando algo', 'download', 55),
    J('j4', 'Convertendo algo', 'convert', 0), J('j5', 'Separando algo', 'separate', 80), J('j6', 'Finalizando algo', 'finalize', 100),
    J('j7', 'Pronta aaa', 'done', 100), J('j8', 'Falhou', 'error', 0, { error: 'yt-dlp falhou' }), J('j9', 'Cancelada', 'error', 0, { error: 'Cancelado' })
  ])
  T('Jobs: atualiza texto no lugar', (await texts('#jobs-list .js'))[2] === 'Baixando 55%')
  T('Jobs: cartão e botão são os mesmos nós (toque não se perde)', await page.evaluate(() => window.__n3 === document.querySelector('#jobs-list .jc:nth-child(3)') && window.__b3 === window.__n3.querySelector('button')))
  // cancelar job
  await post('/__reset')
  await tapBtn('#jobs-list .jc:nth-child(3)', 'Cancelar'); await sleep(300)
  T('Cancelar job: POST /api/job-cancel com o id', (await getLog()).cancels.join() === 'j3')
  T('Cancelar job: vira "Cancelado" pelo SSE e perde o botão', (await texts('#jobs-list .js'))[2] === 'Cancelado' && (await page.$$eval('#jobs-list .jc:nth-child(3) button', (bs) => bs.filter((b) => !b.hidden).map((b) => b.textContent)).then((a) => a.join())) === 'Limpar')
  T('Cancelar job: selo cai para 5', (await txt('#badge')) === '5')
  // 404: job some do servidor antes do toque
  await post('/__jobs', [J('j1', 'Fila qualquer', 'queued', 0)])
  await post('/__cfg', { noCancelEvent: false })
  // simula que o servidor perdeu o job sem avisar o SSE: tira só do estado do servidor
  const s0 = await getLog()
  await page.evaluate(() => { /* nada */ })
  S.jobs = []
  await tapBtn('#jobs-list', 'Cancelar'); await sleep(400)
  T('Cancelar job 404: aviso e lista atualizada (GET /api/jobs)', (await txt('#toast')).indexOf('já terminou') >= 0 && (await page.$$('#jobs-list .jc')).length === 0, await txt('#toast'))
  // Abrir + recarga da biblioteca
  await post('/__reset')
  await jobsSet([J('j7', 'Pronta aaa', 'queued', 0)])
  const libBefore = (await getLog()).libraryGets
  S.library.songs.push({ id: 'ddddddddddd', title: 'Música nova pronta' })
  await jobsSet([J('j7', 'Pronta aaa', 'done', 100)])
  await sleep(250)
  T('Job vira "done": recarrega /api/library', (await getLog()).libraryGets > libBefore, [libBefore, (await getLog()).libraryGets])
  await goTab('songs')
  await sleep(200)
  T('Biblioteca recarregada mostra a música nova', (await texts('#songs-box .rt')).indexOf('Música nova pronta') >= 0)
  await goTab('add')
  await post('/__reset')
  await post('/__state', Object.assign({}, song, { playing: true }))
  await sleep(150)
  await jobsSet([J('ddddddddddd', 'Música nova pronta', 'done', 100)])
  await tapBtn('#jobs-list', 'Abrir'); await sleep(150)
  T('Abrir tocando: 1o toque só arma (guarda)', (await getLog()).cmds.filter((c) => c.type === 'openSong').length === 0)
  await tapBtn('#jobs-list', 'Abrir'); await sleep(250)
  T('Abrir: 2o toque manda openSong do id e vai para Tocar', (await getLog()).cmds.some((c) => c.type === 'openSong' && c.id === 'ddddddddddd') && (await page.$eval('#view-play', (e) => !e.hidden)))
  await post('/__state', song)
  await goTab('add')
  // Limpar
  await jobsSet([J('e1', 'Com erro', 'error', 0, { error: 'falhou' }), J('e2', 'Ativa', 'download', 10)])
  await tapBtn('#jobs-list .jc:nth-child(1)', 'Limpar'); await sleep(100)
  T('Limpar some o cartão só na página', (await page.$$('#jobs-list .jc')).length === 1)
  await jobsSet([J('e1', 'Com erro', 'error', 0, { error: 'falhou' }), J('e2', 'Ativa', 'download', 20)])
  T('Limpar: o cartão não volta no próximo evento', (await page.$$('#jobs-list .jc')).length === 1)
  await jobsSet([J('e1', 'Com erro', 'download', 5), J('e2', 'Ativa', 'download', 20)])
  T('Limpar: job que volta a rodar reaparece', (await page.$$('#jobs-list .jc')).length === 2)
  // ordem muda
  await jobsSet([J('e2', 'Ativa', 'download', 30), J('e1', 'Com erro', 'download', 6)])
  T('Ordem do servidor é respeitada', (await texts('#jobs-list .jt')).join() === 'Ativa,Com erro')
  // XSS
  const xss = '<img src=x onerror="window.__xss=1"><b>x</b>'
  await jobsSet([J('x1', xss, 'download', 5), J('x2', 't', 'error', 0, { error: xss })])
  await sleep(300)
  T('XSS: título/erro como texto (sem <img>, sem <b>)', (await page.$$('#jobs-list img, #jobs-list b')).length === 0 && !(await page.evaluate(() => window.__xss)))
  T('XSS: o texto literal aparece', (await txt('#jobs-list .jt')).indexOf('<img src=x') === 0)
  // título muito longo
  await jobsSet([J('l1', 'A'.repeat(300), 'download', 5), J('l2', 'Palavra '.repeat(40), 'separate', 5)])
  const noScroll = await page.evaluate(() => { const v = document.getElementById('view-add'); return v.scrollWidth <= v.clientWidth })
  T('Título longo: sem rolagem horizontal', noScroll)
  // SSE cai e volta: a lista sincroniza
  await jobsSet([J('r1', 'Antes da queda', 'download', 5)])
  await post('/__drop')
  S.jobs = [J('r2', 'Depois da queda', 'separate', 50)]
  await page.waitForFunction(() => /Depois da queda/.test(document.getElementById('jobs-list').textContent), { timeout: 12000 })
  T('Reconexão do SSE: lista sincroniza com o PC', true)

  // ================= 7. alvos de toque e rolagem horizontal por viewport =================
  await jobsSet([
    J('j1', 'Grande é o Senhor (ao vivo)', 'queued', 0), J('j3', 'Tua Graça me Basta', 'download', 40), J('j5', 'Oceanos', 'separate', 70),
    J('j7', 'Pronta aaa', 'done', 100), J('j8', 'Falhou de um jeito longo para quebrar linha', 'error', 0, { error: 'yt-dlp não conseguiu baixar este vídeo' })
  ])
  await post('/__cfg', { delayMs: 60 })
  const sizes = [[390, 844, '390x844', true], [844, 390, '844x390', true], [820, 1180, '820x1180', true], [1180, 820, '1180x820', true]]
  for (const [w, hgt, tag, touch] of sizes) {
    await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 2, isMobile: true, hasTouch: touch })
    await sleep(300)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('#app:not([hidden])')
    await sleep(500)
    await goTab('add')
    // estados variados no cartão de arquivos
    await page.$eval('#link-in', (e) => { e.value = '' })
    await page.type('#link-in', 'https://youtu.be/aaaaaaaaaaa')
    await tap('#link-go'); await sleep(250)
    const input2 = await page.$('#file-in')
    await input2.uploadFile(mkFile('Louvor ao vivo - Grande é o Senhor.mp3', 12 * 1024 * 1024), mkFile('segunda.m4a', 1024 * 1024), path.join(WORK, 'nota.txt'))
    await sleep(900)
    await page.screenshot({ path: path.join(SHOTS, 'add-' + tag + '.png') })
    const geo = await page.evaluate(() => {
      const out = { hscroll: [], small: [] }
      const root = document.getElementById('view-add')
      out.hscroll.push(['doc', document.documentElement.scrollWidth, window.innerWidth], ['view', root.scrollWidth, root.clientWidth])
      const els = document.querySelectorAll('#view-add button, #view-add input[type=url], .tab')
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect()
        if (r.width === 0 || els[i].hidden) continue
        if (r.height < 55.5 || (els[i].classList.contains('sbtn') && r.width < 103)) out.small.push([els[i].textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)])
      }
      return out
    })
    T('Layout ' + tag + ': sem rolagem horizontal', geo.hscroll.every((x) => x[1] <= x[2]), geo.hscroll)
    T('Layout ' + tag + ': alvos de toque >= 56 px', geo.small.length === 0, geo.small)
    // tela Tocar e Músicas para regressão visual
    await goTab('play')
    await page.screenshot({ path: path.join(SHOTS, 'play-' + tag + '.png') })
    await goTab('songs')
    await page.screenshot({ path: path.join(SHOTS, 'songs-' + tag + '.png') })
    await goTab('add')
    // limpa envios pendentes (cancela o que está enviando)
    await post('/__cfg', { delayMs: 0 })
    await sleep(1500)
    await page.evaluate(() => { const bs = document.querySelectorAll('#up-list button'); for (let i = 0; i < bs.length; i++) if (!bs[i].hidden && /Cancelar|Limpar/.test(bs[i].textContent)) bs[i].click() })
    await post('/__cfg', { delayMs: 60 })
  }

  // ================= 7b. metrônomo: BPM da música, TAP no celular, lado no PAN L/R =================
  await post('/__cfg', { delayMs: 0, respondMs: 0 })
  await post('/__jobs', [])
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#app:not([hidden])')
  await goTab('play')
  const mkState = (m, o) => Object.assign({}, song, { outputSplit: false }, {
    metronome: Object.assign({ playing: false, bpm: 90, pan: 0, side: 'both', follow: false, songBpm: null }, m || {}),
    pad: Object.assign({ playing: false, key: 0, volume: 0.7, pan: 0, side: 'both' }, (o && o.pad) || {})
  }, o && o.top ? o.top : {})
  const cmdsOf = async (t) => (await getLog()).cmds.filter((c) => c.type === t)
  const rectH = (sel) => page.$eval(sel, (e) => Math.round(e.getBoundingClientRect().height))

  // ---- botão "BPM da música" ----
  await post('/__state', mkState({ songBpm: null })); await sleep(150)
  T('Follow: sem batidas fica desabilitado', await page.$eval('#metro-follow', (e) => e.disabled))
  T('Follow: sem batidas rótulo simples + title', (await txt('#metro-follow')) === 'BPM da música' && (await page.$eval('#metro-follow', (e) => e.title)) === 'Abra uma música com batidas')
  T('Follow: não está aceso sem batidas', !(await page.$eval('#metro-follow', (e) => e.classList.contains('on'))))
  await post('/__reset')
  await page.$eval('#metro-follow', (e) => e.click()); await sleep(100)
  T('Follow: desabilitado não manda comando', (await cmdsOf('metronomeFollow')).length === 0)
  await post('/__state', mkState({ songBpm: 73 })); await sleep(150)
  T('Follow: com batidas habilitado', !(await page.$eval('#metro-follow', (e) => e.disabled)))
  T('Follow: rótulo com o número', (await txt('#metro-follow')) === 'BPM da música · 73', await txt('#metro-follow'))
  T('Follow: apagado quando follow=false', !(await page.$eval('#metro-follow', (e) => e.classList.contains('on'))))
  T('Follow: alvo >= 56 px', (await rectH('#metro-follow')) >= 56)
  await tap('#metro-follow'); await sleep(150)
  T('Follow: toque manda metronomeFollow', (await cmdsOf('metronomeFollow')).length === 1)
  await post('/__state', mkState({ songBpm: 73, follow: true })); await sleep(150)
  T('Follow: aceso quando follow=true', await page.$eval('#metro-follow', (e) => e.classList.contains('on')))
  await post('/__state', mkState({ songBpm: 128, follow: false })); await sleep(150)
  T('Follow: rótulo acompanha o songBpm novo', (await txt('#metro-follow')) === 'BPM da música · 128')

  // ---- TAP medido no celular (relógio da página congelado para não ter jitter) ----
  await page.evaluate(() => { const real = Date.now; window.__fake = null; Date.now = function () { return window.__fake !== null ? window.__fake : real.call(Date) } })
  const clock = (v) => page.evaluate((v) => { window.__fake = v }, v)
  const tapAt = async (v) => { await clock(v); await tap('#metro-tap') }
  const bpmCmds = async () => (await cmdsOf('metronomeBpm')).map((c) => c.value)
  await post('/__state', mkState({ bpm: 90 })); await sleep(150)
  await post('/__reset')
  const T0 = Date.now() + 50000
  await tapAt(T0); await sleep(120)
  T('TAP: 1o toque não manda nada', (await bpmCmds()).length === 0 && (await getLog()).cmds.length === 0)
  T('TAP: 1o toque não muda o rótulo', (await txt('#metro-bpm')) === '90 BPM')
  await tapAt(T0 + 500); await sleep(150)
  T('TAP: 2 toques a 500 ms mandam metronomeBpm 120', (await bpmCmds()).join() === '120', await bpmCmds())
  T('TAP: rótulo mostra 120 na hora (estado ainda diz 90)', (await txt('#metro-bpm')) === '120 BPM', await txt('#metro-bpm'))
  await tapAt(T0 + 1000); await tapAt(T0 + 1500); await sleep(150)
  T('TAP: mesmo valor não repete em sequência', (await bpmCmds()).join() === '120', await bpmCmds())
  await tapAt(T0 + 5000); await sleep(150)
  T('TAP: pausa de 3,5 s recomeça (1o toque depois não manda BPM)', (await bpmCmds()).length === 1, await bpmCmds())
  await tapAt(T0 + 5600); await sleep(150)
  T('TAP: depois de recomeçar mede de novo (100 BPM a 600 ms)', (await bpmCmds()).join() === '120,100', await bpmCmds())
  // janela de 5 toques: 6 toques 500,500,500,500 e 1000 -> só os 5 últimos contam (96)
  await post('/__reset')
  const T1 = T0 + 20000
  const offs = [0, 500, 1000, 1500, 2000, 3000]
  for (const o of offs) await tapAt(T1 + o)
  await sleep(150)
  T('TAP: usa só os 5 últimos toques', (await bpmCmds()).slice(-1)[0] === 96, await bpmCmds())
  // limites 30..300
  await post('/__reset')
  const T2 = T0 + 40000
  await tapAt(T2); await tapAt(T2 + 100); await sleep(150)
  T('TAP: rápido demais limita em 300', (await bpmCmds()).join() === '300', await bpmCmds())
  T('TAP: rótulo limitado em 300', (await txt('#metro-bpm')) === '300 BPM')
  await post('/__reset')
  const T3 = T0 + 60000
  await tapAt(T3); await tapAt(T3 + 2000); await sleep(150)
  T('TAP: 2000 ms entre toques = 30 (piso)', (await bpmCmds()).join() === '30', await bpmCmds())
  await post('/__reset')
  const T4 = T0 + 80000
  await tapAt(T4); await tapAt(T4 + 1); await sleep(150)
  T('TAP: 1 ms entre toques limita em 300', (await bpmCmds()).join() === '300', await bpmCmds())
  await clock(null)
  await sleep(1800)
  T('TAP: rótulo volta ao BPM do estado depois de ~1,5 s', (await txt('#metro-bpm')) === '90 BPM', await txt('#metro-bpm'))
  T('TAP: nunca mandou metronomeTap', (await cmdsOf('metronomeTap')).length === 0)
  T('TAP: valores sempre inteiros em 30..300', (await bpmCmds()).every((v) => Number.isInteger(v) && v >= 30 && v <= 300))
  await post('/__reset')
  await tap('#metro-bpm-plus'); await tap('#metro-bpm-minus'); await sleep(200)
  T('BPM -/+ do metrônomo seguem mandando 91 e 89', (await bpmCmds()).join() === '91,89', await bpmCmds())
  T('TAP/BPM: botões >= 56 px', (await rectH('#metro-tap')) >= 56 && (await rectH('#metro-bpm-plus')) >= 56 && (await rectH('#metro-bpm-minus')) >= 56)

  // ---- seletores de lado no PAN L/R ----
  await post('/__state', mkState({ side: 'left' }, { pad: { side: 'right' }, top: { outputSplit: false } })); await sleep(150)
  T('Lados: ocultos com PAN L/R desligado', !(await visible('#sides')))
  T('Lados: sliders de pan normais com PAN L/R desligado', !(await page.$eval('#metro-pan', (e) => e.disabled)) && !(await page.$eval('#pad-pan', (e) => e.disabled)) && (await page.$eval('#metro-pan-row', (e) => getComputedStyle(e).opacity)) === '1')
  await post('/__state', mkState({ side: 'left' }, { pad: { side: 'right' }, top: { outputSplit: true } })); await sleep(150)
  T('Lados: visíveis com PAN L/R ligado', await visible('#sides'))
  T('Lados: texto curto', /PAN L\/R ligado: escolha o lado de cada um\./.test(await txt('#sides .sidenote')))
  T('Lados: rótulos Metrônomo e Pad', (await texts('#sides .lbl')).join() === 'Metrônomo,Pad')
  T('Lados: 3 botões L, L+R, R em cada', (await texts('#seg-metro button')).join() === 'L,L+R,R' && (await texts('#seg-pad button')).join() === 'L,L+R,R')
  const on = (sel) => page.$$eval(sel + ' button', (bs) => bs.filter((b) => b.classList.contains('on')).map((b) => b.getAttribute('data-side')).join())
  T('Lados: realce do metrônomo = left', (await on('#seg-metro')) === 'left', await on('#seg-metro'))
  T('Lados: realce do pad = right', (await on('#seg-pad')) === 'right', await on('#seg-pad'))
  T('Lados: aria-pressed acompanha', (await page.$eval('#seg-metro button[data-side=left]', (e) => e.getAttribute('aria-pressed'))) === 'true' && (await page.$eval('#seg-metro button[data-side=both]', (e) => e.getAttribute('aria-pressed'))) === 'false')
  T('Lados: sliders de pan desabilitados e esmaecidos', (await page.$eval('#metro-pan', (e) => e.disabled)) && (await page.$eval('#pad-pan', (e) => e.disabled)) && parseFloat(await page.$eval('#metro-pan-row', (e) => getComputedStyle(e).opacity)) < 0.6 && parseFloat(await page.$eval('#pad-pan-row', (e) => getComputedStyle(e).opacity)) < 0.6)
  const smalls = await page.$$eval('#sides button', (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)).filter((h) => h < 56))
  T('Lados: alvos >= 56 px', smalls.length === 0, smalls)
  await post('/__reset')
  await tap('#seg-metro button[data-side=right]'); await sleep(120)
  await tap('#seg-pad button[data-side=both]'); await sleep(120)
  await tap('#seg-metro button[data-side=left]'); await sleep(120)
  await tap('#seg-pad button[data-side=left]'); await sleep(150)
  const sideCmds = (await getLog()).cmds.map((c) => c.type + ':' + c.value).join()
  T('Lados: toques mandam metronomeSide/padSide certos', sideCmds === 'metronomeSide:right,padSide:both,metronomeSide:left,padSide:left', sideCmds)
  await post('/__state', mkState({ side: 'right' }, { pad: { side: 'both' }, top: { outputSplit: true } })); await sleep(150)
  T('Lados: realce segue o estado novo', (await on('#seg-metro')) === 'right' && (await on('#seg-pad')) === 'both')
  await post('/__state', mkState({ side: 'both' }, { top: { outputSplit: false } })); await sleep(150)
  T('Lados: somem ao desligar o PAN L/R', !(await visible('#sides')) && !(await page.$eval('#metro-pan', (e) => e.disabled)))
  // pan normal ainda manda comando com PAN L/R desligado
  await post('/__reset')
  await page.$eval('#metro-pan', (e) => { e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })) }); await sleep(150)
  T('Pan do metrônomo (PAN L/R desligado) manda metronomePan 0.4', (await cmdsOf('metronomePan')).some((c) => c.value === 0.4))
  // estado antigo (sem os campos novos) não quebra a página
  await post('/__state', Object.assign({}, song, { metronome: { playing: false, bpm: 100, pan: 0 }, pad: { playing: false, key: 0, volume: 0.7, pan: 0 } })); await sleep(150)
  T('Estado sem os campos novos: follow desabilitado, lados ocultos', (await page.$eval('#metro-follow', (e) => e.disabled)) && !(await visible('#sides')))

  // ---- capturas e geometria: 390x844 e 820x1180, PAN L/R desligado e ligado ----
  for (const [w, hgt, tag] of [[390, 844, '390x844'], [820, 1180, '820x1180'], [360, 740, '360x740'], [1180, 820, '1180x820'], [844, 390, '844x390']]) {
    await page.setViewport({ width: w, height: hgt, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('#app:not([hidden])')
    await goTab('play')
    for (const split of [false, true]) {
      await post('/__state', mkState({ bpm: 120, songBpm: 73, follow: split, side: 'left', playing: true }, { pad: { playing: true, key: 2, side: 'right' }, top: { outputSplit: split } }))
      await sleep(400)
      await page.$eval('#view-play', (e) => { e.scrollTop = 0 })
      const name = 'metro-' + tag + (split ? '-split' : '-nosplit')
      await page.screenshot({ path: path.join(SHOTS, name + '.png') })
      const g = await page.evaluate(() => {
        const v = document.getElementById('view-play')
        const gc = document.getElementById('global-controls')
        const bad = []
        gc.querySelectorAll('button, input[type=range]').forEach((b) => {
          const r = b.getBoundingClientRect()
          if (r.width === 0 || b.closest('[hidden]')) return
          if (r.height < 55.5 && !b.classList.contains('note')) bad.push([b.id || b.textContent.trim(), Math.round(r.width), Math.round(r.height)])
          if (r.right > window.innerWidth + 0.5 || r.left < -0.5) bad.push(['fora da tela', b.id || b.textContent.trim()])
        })
        const txtClip = []
        gc.querySelectorAll('.bpmval, .tog, .sidenote, .lbl, .seg button, .tap').forEach((e) => { if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth) txtClip.push([e.id || e.textContent.trim().slice(0, 20), e.scrollWidth, e.clientWidth]) })
        return { h: [document.documentElement.scrollWidth, window.innerWidth, v.scrollWidth, v.clientWidth, gc.scrollWidth, gc.clientWidth], bad, txtClip }
      })
      T('Metrônomo ' + tag + (split ? ' PAN L/R ligado' : ' desligado') + ': sem rolagem horizontal', g.h[0] <= g.h[1] && g.h[2] <= g.h[3] && g.h[4] <= g.h[5], g.h)
      T('Metrônomo ' + tag + (split ? ' PAN L/R ligado' : ' desligado') + ': alvos >= 56 px e dentro da tela', g.bad.length === 0, g.bad)
      T('Metrônomo ' + tag + (split ? ' PAN L/R ligado' : ' desligado') + ': texto sem corte', g.txtClip.length === 0, g.txtClip)
    }
  }

  // ---- compatibilidade (iOS 12+): nada de sintaxe nova nem URL externa no arquivo ----
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'main', 'remote', 'page.html'), 'utf8')
  const js = src.slice(src.indexOf('<script>'))
  T('Compat: sem ?. ?? => const let async await template literal .at( replaceAll', !/\?\.[A-Za-z_\[(]|\?\?|=>|\bconst\s|\blet\s|\basync\b|\bawait\b|`|\.at\(|replaceAll/.test(js))
  T('Compat: sem URL externa nem innerHTML', !/https?:\/\//.test(src) && !/innerHTML|outerHTML|insertAdjacentHTML/.test(js))

  // ================= 8. fim =================
  T('Sem erros de JS/console/CSP', errors.length === 0, errors)
  T('Nenhuma requisição externa', extReq.length === 0, extReq)
  await browser.close()
  await S.stop()
  console.log('\n' + pass + ' ok, ' + fail + ' falhas. Capturas: ' + SHOTS)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
