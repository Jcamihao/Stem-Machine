// regressão curta da fase 1 (auth, SSE de estado, comandos, Host, limites, invalidateTokens, stop)
const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const { boot, req, authed, sse, sleep, waitFor, warns } = require('./lib.cjs')

test('GET / serve a página com CSP; método errado 405; rota desconhecida 404', async () => {
  const c = await boot()
  const r = await req(c.port, 'GET', '/')
  assert.equal(r.status, 200)
  assert.match(r.headers['content-security-policy'], /default-src 'self'/)
  assert.equal((await req(c.port, 'POST', '/')).status, 405)
  const nf = await req(c.port, 'GET', '/nada')
  assert.equal(nf.status, 404)
  assert.deepEqual(nf.json, { error: 'notfound' })
  await c.stop()
})

test('auth: PIN certo dá token de 64 hex; errado 401; corpo inválido 400; sem JSON 415', async () => {
  const c = await boot()
  const ok = await req(c.port, 'POST', '/api/auth', { pin: '123456' })
  assert.equal(ok.status, 200)
  assert.match(ok.json.token, /^[0-9a-f]{64}$/)
  assert.equal(ok.headers['cache-control'], 'no-store')
  const bad = await req(c.port, 'POST', '/api/auth', { pin: '000000' })
  assert.equal(bad.status, 401)
  assert.deepEqual(bad.json, { error: 'pin' })
  assert.equal((await req(c.port, 'POST', '/api/auth', { pin: 'abc' })).status, 400)
  assert.equal((await req(c.port, 'POST', '/api/auth', 'nao e json')).status, 400)
  assert.equal((await req(c.port, 'POST', '/api/auth', '{"pin":"123456"}', { 'Content-Type': 'text/plain' })).status, 415)
  await c.stop()
})

test('auth: 5 erros bloqueiam o IP (429 com retryAfter), até o PIN certo; acerto antes zera', async () => {
  const c = await boot()
  for (let i = 0; i < 4; i++) assert.equal((await req(c.port, 'POST', '/api/auth', { pin: '111111' })).status, 401)
  assert.equal((await req(c.port, 'POST', '/api/auth', { pin: '123456' })).status, 200) // zera
  for (let i = 0; i < 4; i++) assert.equal((await req(c.port, 'POST', '/api/auth', { pin: '111111' })).status, 401)
  assert.equal((await req(c.port, 'POST', '/api/auth', { pin: '111111' })).status, 401) // 5º erro
  const locked = await req(c.port, 'POST', '/api/auth', { pin: '123456' })
  assert.equal(locked.status, 429)
  assert.equal(locked.json.error, 'locked')
  assert.ok(locked.json.retryAfter > 0 && locked.json.retryAfter <= 60)
  await c.stop()
})

test('Bearer: sem token ou token falso 401; /api/state null e depois o estado; /api/library', async () => {
  const c = await boot()
  const t = await c.login()
  const no = await req(c.port, 'GET', '/api/state')
  assert.equal(no.status, 401)
  assert.deepEqual(no.json, { error: 'auth' })
  assert.equal((await authed(c.port, 'f'.repeat(64), 'GET', '/api/state')).status, 401)
  assert.equal((await authed(c.port, t, 'GET', '/api/state')).text, 'null')
  c.srv.setState({ song: null, playing: true })
  assert.deepEqual((await authed(c.port, t, 'GET', '/api/state')).json, { song: null, playing: true })
  assert.deepEqual((await authed(c.port, t, 'GET', '/api/library')).json, { songs: [], scenes: [] })
  await c.stop()
})

test('Host de fora (DNS rebinding) 400; IP e localhost passam', async () => {
  const c = await boot()
  assert.equal((await req(c.port, 'GET', '/', undefined, { Host: 'evil.example.com' })).status, 400)
  assert.equal((await req(c.port, 'GET', '/', undefined, { Host: '192.168.0.10:8787' })).status, 200)
  assert.equal((await req(c.port, 'GET', '/', undefined, { Host: 'localhost:8787' })).status, 200)
  await c.stop()
})

test('SSE: token ruim 401; estado ao conectar, state a cada setState, ping, clients()/onClients', async () => {
  const c = await boot({ pingMs: 120 })
  const t = await c.login()
  const bad = sse(c.port, 'x'.repeat(64))
  await waitFor(() => bad.state.status === 401)
  c.srv.setState({ song: null, n: 1 })
  const s = sse(c.port, t)
  await s.waitFor((e) => e.ev === 'state')
  assert.deepEqual(s.of('state')[0].data, { song: null, n: 1 })
  c.srv.setState({ song: null, n: 2 })
  await s.waitFor((e) => e.ev === 'state' && e.data.n === 2)
  await s.waitFor((e) => e.ev === 'ping')
  assert.equal(c.srv.clients(), 1)
  s.close()
  await waitFor(() => c.srv.clients() === 0)
  assert.deepEqual(c.calls.clients.slice(0, 1), [1])
  assert.equal(c.calls.clients.at(-1), 0)
  c.srv.setState(null)
  await c.stop()
})

test('/api/cmd: válido 200 chega no onCommand; inválido 400; 4097 bytes 413; sem JSON 415', async () => {
  const c = await boot()
  const t = await c.login()
  assert.deepEqual((await authed(c.port, t, 'POST', '/api/cmd', { type: 'goToSection', index: 2, extra: 'x' })).json, { ok: true })
  assert.deepEqual(c.calls.cmds, [{ type: 'goToSection', index: 2 }])
  assert.deepEqual((await authed(c.port, t, 'POST', '/api/cmd', { type: 'rm -rf' })).json, { error: 'command' })
  assert.equal((await authed(c.port, t, 'POST', '/api/cmd', 'xxx')).status, 400)
  const big = await authed(c.port, t, 'POST', '/api/cmd', JSON.stringify({ type: 'toggle', pad: 'x'.repeat(5000) }))
  assert.equal(big.status, 413)
  assert.equal((await authed(c.port, t, 'POST', '/api/cmd', '{"type":"toggle"}', { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal(c.calls.cmds.length, 1)
  await c.stop()
})

test('/api/cmd: lado do pad/metrônomo e "BPM da música" (metronomeSide, padSide, metronomeFollow)', async () => {
  const c = await boot()
  const t = await c.login()
  const post = (b) => authed(c.port, t, 'POST', '/api/cmd', b)
  for (const type of ['metronomeSide', 'padSide']) {
    for (const value of ['left', 'both', 'right']) assert.deepEqual((await post({ type, value })).json, { ok: true })
    for (const bad of ['LEFT', 'l', '', 1, null, undefined, ['left']]) assert.deepEqual((await post({ type, value: bad })).json, { error: 'command' }, type + ' ' + String(bad))
  }
  assert.deepEqual((await post({ type: 'metronomeFollow', lixo: 1 })).json, { ok: true })
  assert.deepEqual((await post({ type: 'metronomeBpm', value: 90 })).json, { ok: true })
  assert.deepEqual((await post({ type: 'metronomeBpm', value: 29 })).json, { error: 'command' })
  assert.deepEqual(c.calls.cmds, [
    ...['metronomeSide', 'padSide'].flatMap((type) => ['left', 'both', 'right'].map((value) => ({ type, value }))),
    { type: 'metronomeFollow' },
    { type: 'metronomeBpm', value: 90 }
  ])
  await c.stop()
})

test('/api/cmd: 31º pedido no mesmo segundo é 429 com Retry-After', async () => {
  const c = await boot()
  const t = await c.login()
  const rs = []
  for (let i = 0; i < 31; i++) rs.push(await authed(c.port, t, 'POST', '/api/cmd', { type: 'toggle' }))
  const last = rs.at(-1)
  assert.equal(rs.filter((r) => r.status === 200).length, 30)
  assert.equal(last.status, 429)
  assert.deepEqual(last.json, { error: 'rate' })
  assert.equal(last.headers['retry-after'], '1')
  await c.stop()
})

test('invalidateTokens: token antigo 401 e SSE fecha', async () => {
  const c = await boot()
  const t = await c.login()
  const s = sse(c.port, t)
  await s.waitFor((e) => e.ev === 'jobs')
  c.srv.invalidateTokens()
  await waitFor(() => s.state.closed)
  assert.equal((await authed(c.port, t, 'GET', '/api/state')).status, 401)
  assert.equal((await c.login()).length, 64)
  await c.stop()
})

test('stop: porta fecha, SSE cai; start de novo funciona; start em porta ocupada rejeita', async () => {
  const c = await boot()
  const t = await c.login()
  const s = sse(c.port, t)
  await s.waitFor((e) => e.ev === 'jobs')
  const port = c.port
  await c.srv.stop()
  await waitFor(() => s.state.closed)
  await assert.rejects(req(port, 'GET', '/'))
  await c.srv.start(port)
  assert.equal((await req(port, 'GET', '/')).status, 200)
  const c2 = await boot()
  await assert.rejects(c2.srv.start(port))
  await c2.stop()
  await c.stop()
})

test('slowloris: pedido JSON que não completa em 10 s é cortado (timeout real de 10 s)', async () => {
  const c = await boot()
  const t = await c.login()
  const t0 = Date.now()
  const out = await new Promise((resolve) => {
    const s = net.connect(c.port, '127.0.0.1', () => {
      s.write(`POST /api/cmd HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${t}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"ty`)
    })
    let got = ''
    s.on('data', (d) => (got += d))
    s.on('close', () => resolve(got))
  })
  const dt = Date.now() - t0
  assert.ok(dt >= 9000 && dt < 13000, 'cortou em ' + dt + ' ms')
  assert.match(out, /^HTTP\/1\.1 408/)
  await c.stop()
})

test('nenhum log contém token ou PIN', () => {
  assert.ok(warns.every((w) => !/123456|[0-9a-f]{64}/.test(w)), warns.join('\n'))
})
