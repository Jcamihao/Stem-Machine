// POST /api/upload: recusas antes do corpo, gravação em stream, limpeza em qualquer falha, limites de tempo
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const { boot, upload, req, authed, sleep, tick, waitFor, warns, fs, os, path, crypto, H } = require('./lib.cjs')
const { mock } = require('node:test')

const MB = 1024 * 1024
const afterWarns = () => warns.slice()

test('upload ok: 202 com id local-xxxxxxxx, grava em <uploads>/<hex>/<nome>, inicia o job, aparece como queued', async () => {
  const c = await boot()
  const t = await c.login()
  const r = await upload(c.port, t, { name: 'Minha Música (ao vivo).mp3', total: 300_000 })
  assert.equal(r.status, 202)
  assert.match(r.json.id, /^local-[0-9a-f]{8}$/)
  assert.equal(r.json.ok, true)
  assert.equal(c.calls.uploads.length, 1)
  const { file, size } = c.calls.uploads[0]
  assert.equal(size, 300_000)
  assert.equal(H.localSongId(file), r.json.id)
  const rel = path.relative(c.uploadsDir, file).split(path.sep)
  assert.equal(rel.length, 2)
  assert.match(rel[0], /^[0-9a-f]{32}$/)
  assert.equal(rel[1], 'Minha Música (ao vivo).mp3')
  assert.ok(fs.readFileSync(file).every((b) => b === 0x61))
  assert.deepEqual(c.jobs.list(), [{ id: r.json.id, title: 'Minha Música (ao vivo)', stage: 'queued', pct: 0 }])
  // a resposta nunca cita o disco do PC
  assert.ok(!r.text.includes(c.root) && !r.text.includes(os.tmpdir()) && !r.text.includes('uploads'), r.text)
  assert.equal(r.headers['cache-control'], 'no-store')
  await c.stop()
})

test('recusas ANTES de ler o corpo: 400 name, 415 ext, 415 type, 411 length, 413 size, 400 empty, 401 — sem criar pasta', async () => {
  const c = await boot()
  const t = await c.login()
  const cases = [
    [{ name: undefined, total: 0, declared: 10 }, 400, 'name'],
    [{ rawQuery: '?name=', total: 0, declared: 10 }, 400, 'name'],
    [{ name: 'virus.exe', total: 0, declared: 10 }, 415, 'ext'],
    [{ name: 'semextensao', total: 0, declared: 10 }, 415, 'ext'],
    [{ name: '.mp3', total: 0, declared: 10 }, 415, 'ext'],
    [{ rawQuery: '?name=%E0%A4%A.mp3', total: 0, declared: 10 }, 415, 'ext'], // % inválido
    [{ name: 'a.mp3', total: 0, declared: 10, headers: { 'Content-Type': 'application/json' } }, 415, 'type'],
    [{ name: 'a.mp3', total: 0, declared: H.MAX_UPLOAD_BYTES + 1 }, 413, 'size'],
    [{ name: 'a.mp3', total: 0, declared: 0 }, 400, 'empty']
  ]
  for (const [o, status, err] of cases) {
    const r = await upload(c.port, t, o)
    assert.equal(r.status, status, JSON.stringify(o) + ' -> ' + (r.status ?? r.error))
    assert.deepEqual(r.json, { error: err }, JSON.stringify(o))
    assert.equal(r.headers.connection, 'close')
  }
  // sem Content-Length: chunked (cru, o cliente do Node mexeria nos cabeçalhos)
  for (const lenLine of ['Transfer-Encoding: chunked\r\n', '']) {
    const ch = await new Promise((resolve) => {
      const s = net.connect(c.port, '127.0.0.1', () =>
        s.write(`POST /api/upload?name=a.mp3 HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${t}\r\nContent-Type: application/octet-stream\r\n${lenLine}\r\n${lenLine.startsWith('Transfer') ? '5\r\nhello\r\n' : ''}`)
      )
      let got = ''
      s.on('data', (d) => (got += d))
      s.on('close', () => resolve(got))
      setTimeout(() => s.destroy(), 3000)
    })
    assert.match(ch, /^HTTP\/1\.1 411/, JSON.stringify(lenLine) + ' -> ' + ch.slice(0, 40))
  }
  // sem token
  const noAuth = await new Promise((resolve) => {
    const r = require('http').request({ host: '127.0.0.1', port: c.port, method: 'POST', path: '/api/upload?name=a.mp3', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': 5 } }, (res) => resolve(res.statusCode))
    r.end('hello')
  })
  assert.equal(noAuth, 401)
  assert.equal((await authed(c.port, t, 'GET', '/api/upload')).status, 405)
  assert.deepEqual(c.dirs(), [])
  assert.equal(c.calls.uploads.length, 0)
  assert.equal(c.jobs.list().length, 0)
  await c.stop()
})

test('413 de verdade: cliente que já despeja corpo de 600 MB recebe a resposta e nada vai para o disco', async () => {
  const c = await boot()
  const t = await c.login()
  const r = await upload(c.port, t, { name: 'grande.mp3', total: 5 * MB, declared: 600 * MB, chunk: 256 * 1024 })
  // a resposta tem que chegar ao cliente mesmo com ele ainda enviando
  assert.equal(r.status, 413, JSON.stringify({ ...r, headers: undefined }))
  assert.deepEqual(r.json, { error: 'size' })
  assert.deepEqual(c.dirs(), [])
  await c.stop()
})

test('nomes hostis: nunca saem da pasta de envios (../, \\, absoluto, drive, NUL, reservado, longo, unicode)', async () => {
  const c = await boot()
  const t = await c.login()
  const names = [
    ['../../../etc/passwd.mp3', 'passwd.mp3'],
    ['..\\..\\Windows\\evil.mp3', 'evil.mp3'],
    ['/etc/cron.d/x.mp3', 'x.mp3'],
    ['C:\\Windows\\System32\\drivers\\etc\\hosts.mp3', 'hosts.mp3'],
    ['\0RAW:a%00b.mp3', 'ab.mp3'],
    ['CON.mp3', '_CON.mp3'],
    ['nul.wav', '_nul.wav'],
    ['  ...oculto.m4a', '...oculto.m4a'],
    ['canção ❤ 日本語.flac', 'canção ❤ 日本語.flac'],
    ['100%.mp3', '100%.mp3'],
    ['a%41.mp3', 'a%41.mp3'], // o arquivo se chama a%41: não pode virar aA (decodificação dupla)
    ['x'.repeat(300) + '.ogg', 'x'.repeat(100) + '.ogg']
  ]
  for (const [raw, expected] of names) {
    const before = c.calls.uploads.length
    const r = await upload(c.port, t, raw.startsWith('\0RAW:') ? { rawQuery: '?name=' + raw.slice(5), total: 100 } : { name: raw, total: 100 })
    assert.equal(r.status, 202, raw + ' -> ' + (r.status ?? r.error))
    assert.equal(c.calls.uploads.length, before + 1)
    const file = c.calls.uploads.at(-1).file
    const rel = path.relative(c.uploadsDir, file)
    assert.ok(!rel.startsWith('..') && !path.isAbsolute(rel), rel)
    assert.equal(rel.split(path.sep).length, 2, rel)
    assert.equal(path.basename(file), expected, raw)
  }
  // nada criado fora de <root>/uploads
  assert.deepEqual(fs.readdirSync(c.root), ['uploads'])
  assert.equal(c.dirs().length, names.length)
  await c.stop()
})

test('30 MB enviados DEVAGAR (> 10,5 s) não são derrubados pelo timeout de 10 s das rotas JSON', async () => {
  const c = await boot()
  const t = await c.login()
  const total = 30 * MB
  const chunk = 480 * 1024 // 64 pedaços
  const t0 = Date.now()
  const r = await upload(c.port, t, { name: 'devagar.mp3', total, chunk, gap: 220 })
  const dt = Date.now() - t0
  assert.ok(dt > 10500, 'terminou antes de passar o timeout de 10 s (não prova nada): ' + dt)
  assert.equal(r.status, 202, 'status ' + (r.status ?? r.error) + ' após ' + dt + ' ms')
  assert.equal(c.calls.uploads[0].size, total)
  console.log('  30 MB em', dt, 'ms, size no disco', c.calls.uploads[0].size)
  await c.stop()
})

test('memória: 200 MB em stream não seguram o arquivo na RAM (pico de RSS pequeno)', async () => {
  const c = await boot()
  const t = await c.login()
  global.gc && global.gc()
  const base = process.memoryUsage().rss
  let peak = base
  const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20)
  const total = 200 * MB
  const r = await upload(c.port, t, { name: 'enorme.wav', total, chunk: 1 * MB })
  clearInterval(timer)
  assert.equal(r.status, 202)
  assert.equal(c.calls.uploads[0].size, total)
  const delta = (peak - base) / MB
  console.log('  200 MB: pico de RSS +' + delta.toFixed(1) + ' MB sobre a base')
  assert.ok(delta < 80, 'RSS cresceu ' + delta + ' MB')
  await c.stop()
})

test('cliente que cai no meio: apaga a pasta, não inicia job, libera a vaga', async () => {
  const c = await boot()
  const t = await c.login()
  const r = await upload(c.port, t, { name: 'queda.mp3', total: 5 * MB, declared: 5 * MB, chunk: 100_000, dropAfter: 1_000_000 })
  assert.equal(r.dropped, true)
  await sleep(300) // o servidor percebe a queda um instante depois do cliente
  assert.deepEqual(c.dirs(), [])
  assert.equal(c.calls.uploads.length, 0)
  assert.equal(c.jobs.list().length, 0)
  // a vaga voltou: 2 envios simultâneos ainda cabem
  const hold = [0, 1].map(() => upload(c.port, t, { name: 'x.mp3', total: 2000, stopAfter: 1000, chunk: 1000 }))
  await waitFor(() => c.dirs().length === 2)
  await c.stop()
  await Promise.all(hold)
})

test('429 uploads: 3º envio simultâneo do mesmo token; outro token passa; teto geral de 4', async () => {
  const c = await boot()
  const t = await c.login()
  const t2 = await c.login()
  const t3 = await c.login()
  const slow = (tok, n) => upload(c.port, tok, { name: `s${n}.mp3`, total: 2000, stopAfter: 1000, chunk: 1000 })
  const hold = [slow(t, 1), slow(t, 2)]
  await waitFor(() => c.dirs().length === 2)
  const third = await upload(c.port, t, { name: 'terceiro.mp3', total: 100 })
  assert.equal(third.status, 429)
  assert.deepEqual(third.json, { error: 'uploads' })
  hold.push(slow(t2, 3), slow(t2, 4))
  await waitFor(() => c.dirs().length === 4)
  const fifth = await upload(c.port, t3, { name: 'quinto.mp3', total: 100 })
  assert.equal(fifth.status, 429)
  await c.stop() // derruba os 4 pendentes e apaga as pastas
  await Promise.all(hold)
  assert.equal(c.calls.uploads.length, 0)
})

test('terminando um envio a vaga volta (sequência de 5 envios seguidos passa)', async () => {
  const c = await boot()
  const t = await c.login()
  for (let i = 0; i < 5; i++) assert.equal((await upload(c.port, t, { name: `s${i}.mp3`, total: 5000 })).status, 202)
  assert.equal(c.calls.uploads.length, 5)
  await c.stop()
})

test('bytes além do Content-Length nunca entram no arquivo', async () => {
  const c = await boot()
  const t = await c.login()
  const body = Buffer.alloc(20, 0x61) // 20 bytes, mas anuncia 10
  const out = await new Promise((resolve) => {
    const s = net.connect(c.port, '127.0.0.1', () =>
      s.write(Buffer.concat([Buffer.from(`POST /api/upload?name=a.mp3 HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${t}\r\nContent-Type: application/octet-stream\r\nContent-Length: 10\r\n\r\n`), body]))
    )
    let got = ''
    s.on('data', (d) => (got += d))
    s.on('close', () => resolve(got))
    setTimeout(() => s.destroy(), 3000)
  })
  // o Node trata o excesso como um segundo pedido malformado e derruba a conexão: o envio inteiro é recusado
  assert.match(out, /^HTTP\/1\.1 (400|202)/)
  await waitFor(() => c.dirs().length === 0 || c.calls.uploads.length === 1)
  if (c.calls.uploads.length === 1) assert.equal(c.calls.uploads[0].size, 10) // se aceitou, só os 10 bytes anunciados
  else assert.equal(c.jobs.list().length, 0)
  await c.stop()
})

test('falha ao iniciar o job (startUpload lança): apaga a pasta e responde 500 sem caminho', async () => {
  const c = await boot({ deps: { startUpload: () => { throw new Error('falhou em ' + 'C:\\Users\\x\\segredo') } } })
  const t = await c.login()
  const r = await upload(c.port, t, { name: 'a.mp3', total: 100 })
  assert.equal(r.status, 500)
  assert.deepEqual(r.json, { error: 'internal' })
  assert.deepEqual(c.dirs(), [])
  assert.equal(c.jobs.list()[0].stage, 'error')
  assert.ok(!r.text.includes('segredo'))
  await c.stop()
})

test('parada de 60 s sem dados (relógio simulado): vivo em 59 999 ms, abortado e apagado em 60 000', async () => {
  const c = await boot() // padrão de fábrica: sem sobrescrever o tempo
  const t = await c.login()
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let sock
    const p = upload(c.port, t, { name: 'parado.mp3', total: 100_000, stopAfter: 1000, chunk: 1000, onSocket: (s) => (sock = s) })
    // espera (sem timers) o servidor criar a pasta e gravar o primeiro pedaço
    const t0 = Date.now()
    while (!(c.dirs().length === 1 && fs.readdirSync(path.join(c.uploadsDir, c.dirs()[0])).length === 1)) {
      await tick()
      if (Date.now() - t0 > 5000) throw new Error('envio não começou')
    }
    await new Promise((r) => setImmediate(r))
    mock.timers.tick(59_999)
    await tick()
    await tick()
    assert.equal(sock.destroyed, false, 'derrubou cedo')
    assert.equal(c.dirs().length, 1)
    mock.timers.tick(1)
    const t1 = Date.now()
    while (!sock.destroyed || c.dirs().length) {
      await tick()
      if (Date.now() - t1 > 5000) throw new Error('não abortou aos 60 s')
    }
    const r = await p
    assert.equal(r.status, 408, 'cliente deveria ver 408: ' + JSON.stringify({ ...r, headers: 0 }))
    assert.deepEqual(r.json, { error: 'timeout' })
  } finally {
    mock.timers.reset()
  }
  assert.equal(c.calls.uploads.length, 0)
  assert.equal(c.jobs.list().length, 0)
  await c.stop()
})

test('parada por falta de dados (tempo real, 400 ms): aborta, apaga, libera a vaga', async () => {
  const c = await boot({ uploadIdleMs: 400 })
  const t = await c.login()
  const p = upload(c.port, t, { name: 'parado.mp3', total: 100_000, stopAfter: 1000, chunk: 1000 })
  await waitFor(() => c.dirs().length === 1)
  const r = await p.catch(() => null)
  await waitFor(() => c.dirs().length === 0, 3000)
  assert.equal(c.calls.uploads.length, 0)
  // enviando devagar, mas sempre dentro da janela, NÃO aborta
  const slow = await upload(c.port, t, { name: 'lento.mp3', total: 10_000, chunk: 1000, gap: 150 })
  assert.equal(slow.status, 202)
  await c.stop()
})

test('invalidateTokens (novo PIN) derruba envio em andamento e apaga', async () => {
  const c = await boot()
  const t = await c.login()
  const p = upload(c.port, t, { name: 'a.mp3', total: 100_000, stopAfter: 1000, chunk: 1000 })
  await waitFor(() => c.dirs().length === 1)
  c.srv.invalidateTokens()
  await p
  await waitFor(() => c.dirs().length === 0)
  assert.equal(c.calls.uploads.length, 0)
  await c.stop()
})

test('stop() derruba envio em andamento e apaga', async () => {
  const c = await boot()
  const t = await c.login()
  const p = upload(c.port, t, { name: 'a.mp3', total: 100_000, stopAfter: 1000, chunk: 1000 })
  await waitFor(() => c.dirs().length === 1)
  await c.srv.stop()
  await p
  await waitFor(() => c.dirs().length === 0)
  await c.stop()
})

test('removeUploadFolder e pruneUploads: só mexem em subpasta hex dentro da pasta de envios', async () => {
  const c = await boot()
  const root = c.uploadsDir
  fs.mkdirSync(root, { recursive: true })
  const mk = (name, ageH) => {
    const d = path.join(root, name)
    fs.mkdirSync(d)
    fs.writeFileSync(path.join(d, 'a.mp3'), 'x')
    const when = new Date(Date.now() - ageH * 3600_000)
    fs.utimesSync(d, when, when)
    return d
  }
  const old = mk('a'.repeat(32), 30)
  const fresh = mk('b'.repeat(32), 1)
  const alien = mk('nao-e-nosso', 99)
  const outside = path.join(c.root, 'fora')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'k.mp3'), 'x')
  assert.equal(await H.pruneUploads(root, 24 * 3600_000), 1)
  assert.ok(!fs.existsSync(old) && fs.existsSync(fresh) && fs.existsSync(alien))
  await H.removeUploadFolder(root, path.join(outside, 'k.mp3')) // fora da pasta: ignora
  await H.removeUploadFolder(root, path.join(root, 'k.mp3')) // direto na raiz: ignora
  await H.removeUploadFolder(root, path.join(alien, 'a.mp3')) // sem nome hex: ignora
  assert.ok(fs.existsSync(outside) && fs.existsSync(alien) && fs.existsSync(root))
  await H.removeUploadFolder(root, path.join(fresh, 'a.mp3'))
  assert.ok(!fs.existsSync(fresh))
  assert.equal(await H.pruneUploads(path.join(c.root, 'naoexiste'), 1), 0)
  await c.stop()
})

test('logs: nenhum aviso do servidor contém token, PIN, nome do arquivo ou caminho', () => {
  const bad = afterWarns().filter((w) => /123456|[0-9a-f]{64}|\.mp3|sm-srv|uploads/.test(w))
  assert.deepEqual(bad, [])
})
