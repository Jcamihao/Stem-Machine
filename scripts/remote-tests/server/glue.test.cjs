// remote.ts (cola) com o Electron trocado por um stub; o pipeline é o de verdade (sem yt-dlp/ffmpeg: os jobs falham de forma real)
const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-glue-'))
process.env.SM_USERDATA = userData
const test = require('node:test')
const assert = require('node:assert/strict')
const { req, authed, upload, waitFor, sleep, sse } = require('./lib.cjs')
const glue = require(process.env.SM_GLUE)
const { handlers } = glue.stub

const portFree = () =>
  new Promise((r) => {
    const s = net.createServer()
    s.once('error', () => r(false))
    s.listen(8787, '0.0.0.0', () => s.close(() => r(true)))
  })

test('funções puras: cleanState, buildLibrary, lanUrls, generatePin', () => {
  assert.equal(glue.cleanState('x'), null)
  const st = glue.cleanState({ song: { id: 'a', title: 'x'.repeat(500) }, sections: new Array(300).fill({ label: 'verse', name: 'V', start: 1, end: 2 }), lixo: 1 })
  assert.equal(st.song.title.length, 300)
  assert.equal(st.sections.length, 200)
  assert.equal(st.lixo, undefined)
  assert.deepEqual(glue.buildLibrary([{ videoId: 'a', title: '' }], [{ id: 's', name: 'S', songs: ['a', 'zzz'] }]), {
    songs: [{ id: 'a', title: 'a' }],
    scenes: [{ id: 's', name: 'S', songs: [{ id: 'a', title: 'a' }] }]
  })
  assert.deepEqual(glue.lanUrls(8787, { eth0: [{ family: 'IPv4', internal: false, address: '10.0.0.2' }, { family: 'IPv4', internal: false, address: '192.168.0.9' }, { family: 'IPv4', internal: true, address: '127.0.0.1' }] }), ['http://192.168.0.9:8787', 'http://10.0.0.2:8787'])
  assert.match(glue.generatePin(), /^\d{6}$/)
})

test('initRemote de ponta a ponta: add-link e upload passam pelo pipeline real e limpam o temporário', async (t) => {
  if (!(await portFree())) return t.skip('porta 8787 ocupada nesta máquina')
  const uploads = path.join(userData, 'uploads')
  // sobra de um envio de ontem e outra recente: ao subir o servidor, a velha some
  const old = path.join(uploads, 'a'.repeat(32))
  const fresh = path.join(uploads, 'b'.repeat(32))
  for (const d of [old, fresh]) {
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'x.mp3'), 'x')
  }
  const past = new Date(Date.now() - 30 * 3600_000)
  fs.utimesSync(old, past, past)

  const sent = []
  glue.initRemote(() => ({ isDestroyed: () => false, webContents: { send: (ch, p) => sent.push([ch, p]) } }))
  assert.ok(handlers['remote:status'] && handlers['remote:set-enabled'])
  const status = await handlers['remote:set-enabled'](null, true)
  assert.equal(status.running, true, JSON.stringify(status))
  const port = status.port
  await waitFor(() => !fs.existsSync(old))
  assert.ok(fs.existsSync(fresh))

  const login = await req(port, 'POST', '/api/auth', { pin: status.pin })
  const tok = login.json.token

  // link: pipeline de verdade tenta o yt-dlp, que não existe aqui: o job vira error, sem caminho na mensagem
  const ID = 'dQw4w9WgXcQ'
  const a = await authed(port, tok, 'POST', '/api/add-link', { url: 'https://youtu.be/' + ID })
  assert.equal(a.status, 202)
  const j1 = await waitFor(async () => (await authed(port, tok, 'GET', '/api/jobs')).json.find((j) => j.id === ID && j.stage === 'error'), 10000)
  console.log('  link job final:', JSON.stringify(j1))
  assert.ok(!j1.error.includes(userData))

  // upload: ffmpeg não existe, então o pipeline falha de verdade; a pasta temporária tem que sumir
  const before = fs.readdirSync(uploads).length
  const u = await upload(port, tok, { name: 'Teste Cola.mp3', total: 50_000 })
  assert.equal(u.status, 202, JSON.stringify(u))
  assert.match(u.json.id, /^local-[0-9a-f]{8}$/)
  const j2 = await waitFor(async () => (await authed(port, tok, 'GET', '/api/jobs')).json.find((j) => j.id === u.json.id && j.stage === 'error'), 10000)
  console.log('  upload job final:', JSON.stringify(j2))
  assert.equal(j2.title, 'Teste Cola')
  assert.ok(!j2.error.includes(userData))
  await waitFor(() => fs.readdirSync(uploads).length === before, 5000)
  assert.ok(!fs.readdirSync(uploads).some((d) => fs.existsSync(path.join(uploads, d, 'Teste Cola.mp3'))))

  // cancelar um job que roda de verdade: yt-dlp falso que dorme; startJob real, cancelJob real
  const bin = path.join(userData, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'yt-dlp'), '#!/bin/sh\nexec sleep 30\n', { mode: 0o755 })
  const ID2 = 'aaaaaaaaaab'
  assert.equal((await authed(port, tok, 'POST', '/api/add-link', { url: 'https://youtu.be/' + ID2 })).status, 202)
  await waitFor(async () => (await authed(port, tok, 'GET', '/api/jobs')).json.find((j) => j.id === ID2 && j.stage === 'metadata'), 10000)
  assert.equal((await authed(port, tok, 'POST', '/api/add-link', { url: 'https://youtu.be/' + ID2 })).status, 409) // rodando de verdade
  assert.equal((await authed(port, tok, 'POST', '/api/job-cancel', { id: ID2 })).status, 200)
  const j3 = (await authed(port, tok, 'GET', '/api/jobs')).json.find((j) => j.id === ID2)
  assert.equal(j3.stage, 'error')
  assert.equal(j3.error, 'Cancelado')
  assert.equal((await authed(port, tok, 'POST', '/api/job-cancel', { id: ID2 })).status, 404)
  console.log('  cancelamento real:', JSON.stringify(j3))

  // job iniciado fora do celular (PC) também aparece: simula pelo mesmo caminho de eventos do pipeline
  const s = sse(port, tok)
  await s.waitFor((e) => e.ev === 'jobs')
  assert.ok(s.of('jobs')[0].data.length >= 2)
  s.close()

  // novo PIN derruba tokens
  await handlers['remote:new-pin']()
  assert.equal((await authed(port, tok, 'GET', '/api/jobs')).status, 401)
  const off = await handlers['remote:set-enabled'](null, false)
  assert.equal(off.running, false)
})
