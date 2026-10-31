const test = require('node:test')
const assert = require('node:assert/strict')
const { H } = require('./lib.cjs')

const prog = (videoId, stage, pct, extra = {}) => ({ kind: 'progress', data: { videoId, stage, pct, ...extra } })
const done = (videoId, title = 'T') => ({ kind: 'done', data: { videoId, song: { videoId, title } } })
const failed = (videoId, message, extra = {}) => ({ kind: 'failed', data: { videoId, message, ...extra } })

function mk(o = {}) {
  let t = 1_000_000
  const jobs = new H.RemoteJobs({ now: () => t, ...o })
  return { jobs, adv: (ms) => (t += ms) }
}

test('progress cria job com stage, pct limitado, message e título (cai para o id)', () => {
  const { jobs } = mk()
  jobs.handle(prog('abc', 'download', 150, { message: 'Downloading', title: 'Música' }))
  jobs.handle(prog('xyz', 'convert', -5))
  const l = jobs.list()
  assert.deepEqual(l[1], { id: 'abc', title: 'Música', stage: 'download', pct: 100, message: 'Downloading' })
  assert.deepEqual(l[0], { id: 'xyz', title: 'xyz', stage: 'convert', pct: 0 })
  jobs.dispose()
})

test('todas as etapas, em ordem, atualizam no mesmo lugar', () => {
  const { jobs } = mk()
  for (const s of ['metadata', 'download', 'convert', 'separate', 'finalize']) {
    jobs.handle(prog('a', s, 50))
    assert.equal(jobs.list()[0].stage, s)
  }
  assert.equal(jobs.list().length, 1)
  jobs.handle(done('a', 'Título final'))
  assert.deepEqual(jobs.list()[0], { id: 'a', title: 'Título final', stage: 'done', pct: 100 })
  jobs.dispose()
})

test('failed vira error; Cancelled vira Cancelado; mensagem mantém título e pct', () => {
  const { jobs } = mk()
  jobs.handle(prog('a', 'separate', 40, { title: 'Faixa' }))
  jobs.handle(failed('a', 'ffmpeg exploded'))
  assert.deepEqual(jobs.list()[0], { id: 'a', title: 'Faixa', stage: 'error', pct: 40, error: 'ffmpeg exploded' })
  jobs.handle(prog('b', 'download', 10))
  jobs.handle(failed('b', 'Cancelled'))
  assert.equal(jobs.list()[0].error, 'Cancelado')
  jobs.dispose()
})

test('queued: criado por queue(), vira etapa real no primeiro evento, mantém posição', () => {
  const { jobs } = mk()
  jobs.queue('a', 'a')
  jobs.queue('b', 'Arquivo')
  assert.equal(jobs.list()[0].stage, 'queued')
  assert.equal(jobs.isActive('b'), true)
  jobs.handle(prog('a', 'metadata', 0, { title: undefined }))
  assert.deepEqual(jobs.list().map((j) => [j.id, j.stage]), [['b', 'queued'], ['a', 'metadata']])
  jobs.dispose()
})

test('resplit e videoId vazio são ignorados', () => {
  const { jobs } = mk()
  jobs.handle(prog('a', 'separate', 10, { resplit: true }))
  jobs.handle(failed('a', 'x', { resplit: true }))
  jobs.handle(failed('', 'Could not parse'))
  jobs.handle(prog('', 'download', 1))
  assert.deepEqual(jobs.list(), [])
  jobs.dispose()
})

test('"already being processed" não derruba o job que roda', () => {
  const { jobs } = mk()
  jobs.handle(prog('a', 'download', 30))
  jobs.handle(failed('a', 'This song is already being processed'))
  assert.equal(jobs.list()[0].stage, 'download')
  jobs.dispose()
})

test('failIfQueued só mexe em job parado na fila; failActive em qualquer ativo', () => {
  const { jobs } = mk()
  jobs.queue('a', 'a')
  jobs.queue('b', 'b')
  jobs.handle(prog('b', 'download', 5))
  jobs.failIfQueued('a', 'não leu')
  jobs.failIfQueued('b', 'não leu')
  assert.equal(jobs.list().find((j) => j.id === 'a').stage, 'error')
  assert.equal(jobs.list().find((j) => j.id === 'b').stage, 'download')
  jobs.failActive('b', 'Cancelado')
  assert.equal(jobs.list().find((j) => j.id === 'b').error, 'Cancelado')
  assert.equal(jobs.isActive('b'), false)
  jobs.dispose()
})

test('mais novo primeiro, máximo 20, sai o terminado mais antigo antes dos ativos', () => {
  const { jobs, adv } = mk()
  jobs.queue('ativo-velho', 'x') // ativo e o mais antigo
  for (let i = 0; i < 25; i++) {
    jobs.handle(done('d' + i))
    adv(10)
  }
  const l = jobs.list()
  assert.equal(l.length, 20)
  assert.equal(l[0].id, 'd24')
  assert.ok(l.some((j) => j.id === 'ativo-velho'), 'ativo antigo preservado')
  assert.ok(!l.some((j) => j.id === 'd0'))
  jobs.dispose()
})

test('só ativos: passou de 20 sai o mais antigo', () => {
  const { jobs } = mk()
  for (let i = 0; i < 22; i++) jobs.queue('q' + i, 'q')
  const l = jobs.list()
  assert.equal(l.length, 20)
  assert.equal(l[0].id, 'q21')
  assert.equal(l[19].id, 'q2')
  jobs.dispose()
})

test('done/error somem depois de 1 h; ativos nunca', () => {
  const { jobs, adv } = mk()
  jobs.handle(done('a'))
  jobs.handle(prog('b', 'download', 1))
  jobs.handle(prog('c', 'download', 1))
  jobs.handle(failed('c', 'x'))
  adv(59 * 60_000)
  assert.equal(jobs.list().length, 3)
  adv(61_000)
  assert.deepEqual(jobs.list().map((j) => j.id), ['b'])
  jobs.dispose()
})

test('expiração dispara onChange sozinha (timer real, ttl curto)', async () => {
  const jobs = new H.RemoteJobs({ ttlMs: 120 })
  let changes = 0
  jobs.onChange(() => changes++)
  jobs.handle(done('a'))
  assert.equal(changes, 1)
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(changes, 2)
  assert.equal(jobs.list().length, 0)
  jobs.dispose()
})

test('mesmo id rodado de novo depois de terminar sobe para o topo e limpa o erro', () => {
  const { jobs } = mk()
  jobs.handle(prog('a', 'download', 1))
  jobs.handle(failed('a', 'boom'))
  jobs.handle(done('b'))
  jobs.queue('a', 'a')
  jobs.handle(prog('a', 'metadata', 0))
  assert.deepEqual(jobs.list().map((j) => j.id), ['a', 'b'])
  assert.equal(jobs.list()[0].error, undefined)
  jobs.dispose()
})

test('onChange: só quando muda de verdade', () => {
  const { jobs } = mk()
  let n = 0
  jobs.onChange(() => n++)
  jobs.handle(prog('a', 'download', 10))
  jobs.handle(prog('a', 'download', 10))
  jobs.handle(prog('a', 'download', 11))
  assert.equal(n, 2)
  jobs.dispose()
})

test('erro sem caminho do disco, uma linha, curto', () => {
  const { jobs } = mk()
  jobs.handle(failed('a', 'ffmpeg falhou em C:\\Users\\joao\\AppData\\x\\mix.wav\nlinha dois'))
  jobs.handle(failed('b', 'não abriu /home/caminhao/.config/stem/songs/b/mix.wav: erro'))
  jobs.handle(failed('c', 'x'.repeat(1000)))
  const l = Object.fromEntries(jobs.list().map((j) => [j.id, j.error]))
  assert.ok(!/Users|AppData|C:\\/.test(l.a) && !l.a.includes('\n'), l.a)
  assert.ok(!/home|caminhao/.test(l.b), l.b)
  assert.ok(l.c.length <= 200)
  jobs.dispose()
})
