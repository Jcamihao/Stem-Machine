// rotas novas: add-link, job-cancel, GET /api/jobs, SSE jobs
const test = require('node:test')
const assert = require('node:assert/strict')
const { boot, authed, req, sse, sleep, waitFor, H } = require('./lib.cjs')

const ID = 'dQw4w9WgXcQ'
const URL_OK = 'https://www.youtube.com/watch?v=' + ID

test('add-link: 202 inicia, aparece como queued; 409 busy; 200 exists; 400 url; 415 type; 401', async () => {
  const c = await boot()
  const t = await c.login()
  const a = await authed(c.port, t, 'POST', '/api/add-link', { url: URL_OK })
  assert.equal(a.status, 202)
  assert.deepEqual(a.json, { ok: true, id: ID })
  assert.deepEqual(c.calls.links, [URL_OK])
  assert.deepEqual((await authed(c.port, t, 'GET', '/api/jobs')).json, [{ id: ID, title: ID, stage: 'queued', pct: 0 }])

  const busy = await authed(c.port, t, 'POST', '/api/add-link', { url: 'https://youtu.be/' + ID })
  assert.equal(busy.status, 409)
  assert.deepEqual(busy.json, { error: 'busy' })
  assert.equal(c.calls.links.length, 1)

  c.calls.songs.add('aaaaaaaaaaa')
  const ex = await authed(c.port, t, 'POST', '/api/add-link', { url: 'https://youtu.be/aaaaaaaaaaa' })
  assert.equal(ex.status, 200)
  assert.deepEqual(ex.json, { ok: true, id: 'aaaaaaaaaaa', exists: true })
  assert.equal(c.calls.links.length, 1)

  for (const body of [{}, { url: 5 }, { url: 'https://vimeo.com/123456789' }, { url: 'x'.repeat(301) }, []]) {
    const r = await authed(c.port, t, 'POST', '/api/add-link', body)
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 40))
    assert.deepEqual(r.json, { error: 'url' })
  }
  assert.equal((await authed(c.port, t, 'POST', '/api/add-link', 'nao json')).status, 400)
  assert.equal((await authed(c.port, t, 'POST', '/api/add-link', JSON.stringify({ url: URL_OK }), { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await req(c.port, 'POST', '/api/add-link', { url: URL_OK })).status, 401)
  assert.equal((await authed(c.port, t, 'GET', '/api/add-link')).status, 405)
  assert.equal((await authed(c.port, t, 'POST', '/api/add-link', JSON.stringify({ url: URL_OK, pad: 'x'.repeat(5000) }))).status, 413)
  await c.stop()
})

test('add-link: depois que o job termina, pode adicionar de novo (se a música não está na biblioteca)', async () => {
  const c = await boot()
  const t = await c.login()
  await authed(c.port, t, 'POST', '/api/add-link', { url: URL_OK })
  c.jobs.handle({ kind: 'failed', data: { videoId: ID, message: 'boom' } })
  const again = await authed(c.port, t, 'POST', '/api/add-link', { url: URL_OK })
  assert.equal(again.status, 202)
  assert.equal(c.calls.links.length, 2)
  await c.stop()
})

test('add-link e job-cancel dividem o limite de 30/s por token com /api/cmd', async () => {
  const c = await boot()
  const t = await c.login()
  const codes = []
  for (let i = 0; i < 15; i++) codes.push((await authed(c.port, t, 'POST', '/api/add-link', { url: 'nope' })).status)
  for (let i = 0; i < 15; i++) codes.push((await authed(c.port, t, 'POST', '/api/job-cancel', { id: 'x' })).status)
  codes.push((await authed(c.port, t, 'POST', '/api/add-link', { url: 'nope' })).status)
  assert.equal(codes.filter((x) => x === 429).length, 1)
  assert.equal(codes.at(-1), 429)
  // outro token tem a própria conta
  const t2 = await c.login()
  assert.equal((await authed(c.port, t2, 'POST', '/api/add-link', { url: 'nope' })).status, 400)
  await c.stop()
})

test('job-cancel: 200 chama cancelJob; 404 sem job ativo; 400 sem id; job terminado é 404', async () => {
  const c = await boot()
  const t = await c.login()
  assert.deepEqual((await authed(c.port, t, 'POST', '/api/job-cancel', { id: ID })).json, { error: 'notfound' })
  assert.equal((await authed(c.port, t, 'POST', '/api/job-cancel', { id: ID })).status, 404)
  c.jobs.handle({ kind: 'progress', data: { videoId: ID, stage: 'download', pct: 20 } })
  const ok = await authed(c.port, t, 'POST', '/api/job-cancel', { id: ID })
  assert.equal(ok.status, 200)
  assert.deepEqual(ok.json, { ok: true })
  assert.deepEqual(c.calls.cancels, [ID])
  // o cancelJob falso não mandou evento: o servidor fecha o cartão sozinho
  assert.deepEqual((await authed(c.port, t, 'GET', '/api/jobs')).json[0], { id: ID, title: ID, stage: 'error', pct: 20, error: 'Cancelado' })
  assert.equal((await authed(c.port, t, 'POST', '/api/job-cancel', { id: ID })).status, 404)
  assert.equal((await authed(c.port, t, 'POST', '/api/job-cancel', {})).status, 400)
  assert.equal((await authed(c.port, t, 'POST', '/api/job-cancel', 'x')).status, 400)
  assert.equal((await req(c.port, 'POST', '/api/job-cancel', { id: ID })).status, 401)
  assert.equal(c.calls.cancels.length, 1)
  await c.stop()
})

test('job-cancel com pipeline de verdade mandando "Cancelled": cartão vira Cancelado', async () => {
  const jobs = new H.RemoteJobs()
  const c = await boot({
    jobs,
    deps: { cancelJob: (id) => jobs.handle({ kind: 'failed', data: { videoId: id, message: 'Cancelled' } }) }
  })
  const t = await c.login()
  jobs.handle({ kind: 'progress', data: { videoId: ID, stage: 'separate', pct: 70, title: 'Faixa' } })
  assert.equal((await authed(c.port, t, 'POST', '/api/job-cancel', { id: ID })).status, 200)
  const j = (await authed(c.port, t, 'GET', '/api/jobs')).json
  assert.deepEqual(j, [{ id: ID, title: 'Faixa', stage: 'error', pct: 70, error: 'Cancelado' }])
  await c.stop()
})

test('GET /api/jobs: lista vazia [], 401 sem token, Cache-Control no-store, POST 405', async () => {
  const c = await boot()
  const t = await c.login()
  const r = await authed(c.port, t, 'GET', '/api/jobs')
  assert.deepEqual(r.json, [])
  assert.equal(r.headers['cache-control'], 'no-store')
  assert.equal((await req(c.port, 'GET', '/api/jobs')).status, 401)
  assert.equal((await authed(c.port, t, 'POST', '/api/jobs', {})).status, 405)
  await c.stop()
})

test('SSE jobs: [] ao conectar (sempre) e mudanças chegam', async () => {
  const c = await boot()
  const t = await c.login()
  const s = sse(c.port, t)
  await s.waitFor((e) => e.ev === 'jobs')
  assert.deepEqual(s.of('jobs')[0].data, [])
  c.jobs.handle({ kind: 'progress', data: { videoId: 'a', stage: 'download', pct: 10, title: 'A' } })
  await s.waitFor((e) => e.ev === 'jobs' && e.data.length === 1)
  c.jobs.handle({ kind: 'done', data: { videoId: 'a', song: { videoId: 'a', title: 'A' } } })
  await s.waitFor((e) => e.ev === 'jobs' && e.data[0]?.stage === 'done')
  // cliente novo no meio já recebe a lista atual
  const s2 = sse(c.port, t)
  await s2.waitFor((e) => e.ev === 'jobs')
  assert.equal(s2.of('jobs')[0].data[0].stage, 'done')
  s.close()
  s2.close()
  await c.stop()
})

test('SSE jobs: 120 mudanças em 1,2 s viram no máximo 4 quadros por segundo e o último é o final', async () => {
  const c = await boot()
  const t = await c.login()
  const s = sse(c.port, t)
  await s.waitFor((e) => e.ev === 'jobs')
  const base = s.of('jobs').length
  const t0 = Date.now()
  for (let i = 1; i <= 120; i++) {
    c.jobs.handle({ kind: 'progress', data: { videoId: 'a', stage: 'separate', pct: i % 100, title: 'A' } })
    await sleep(10)
  }
  c.jobs.handle({ kind: 'progress', data: { videoId: 'a', stage: 'finalize', pct: 55, title: 'A' } })
  await s.waitFor((e) => e.ev === 'jobs' && e.data[0]?.stage === 'finalize')
  const frames = s.of('jobs').slice(base)
  const span = Date.now() - t0
  assert.ok(frames.length >= 3, 'frames=' + frames.length)
  // em qualquer janela de 1 s, no máximo 4
  let worst = 0
  for (const f of frames) worst = Math.max(worst, frames.filter((g) => g.t >= f.t && g.t < f.t + 1000).length)
  assert.ok(worst <= 4, 'janela de 1 s teve ' + worst + ' quadros (total ' + frames.length + ' em ' + span + ' ms)')
  assert.equal(frames.at(-1).data[0].stage, 'finalize')
  s.close()
  await c.stop()
})

test('SSE jobs: quadro igual ao anterior não é reenviado; parar o servidor solta o assinante', async () => {
  const c = await boot()
  const t = await c.login()
  const s = sse(c.port, t)
  await s.waitFor((e) => e.ev === 'jobs')
  c.jobs.queue('a', 'a')
  await s.waitFor((e) => e.ev === 'jobs' && e.data.length === 1)
  const n = s.of('jobs').length
  c.jobs.queue('a', 'a') // mesmo conteúdo
  await sleep(400)
  assert.equal(s.of('jobs').length, n)
  s.close()
  await c.srv.stop()
  c.jobs.queue('b', 'b') // sem assinante: não pode quebrar
  await c.stop()
})
