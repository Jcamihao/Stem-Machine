// servidor falso do contrato inteiro (fase 1 + adicionar músicas) para testar page.html
'use strict'
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const PAGE = path.join(__dirname, '..', '..', '..', 'src', 'main', 'remote', 'page.html')
const PIN = '123456'
const CSP = "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"

function createFake() {
  const S = {
    tokens: new Set(),
    state: null,
    library: {
      songs: [
        { id: 'aaaaaaaaaaa', title: 'Grande é o Senhor' },
        { id: 'bbbbbbbbbbb', title: 'Tua Graça me Basta' },
        { id: 'ccccccccccc', title: 'Oceanos (Where Feet May Fail)' }
      ],
      scenes: [{ id: 's1', name: 'Culto domingo', songs: [{ id: 'aaaaaaaaaaa', title: 'Grande é o Senhor' }, { id: 'bbbbbbbbbbb', title: 'Tua Graça me Basta' }] }]
    },
    jobs: [],
    sse: new Set(),
    log: { cmds: [], links: [], cancels: [], uploads: [], libraryGets: 0, jobsGets: 0, uploadsAborted: 0 },
    cfg: { delayMs: 0, respondMs: 0 }, // atraso por pedaço de 64 KB e antes da resposta final
    activeUploads: 0,
    maxUploads: 0,
    failNextUploads: {} // nome -> quantas vezes ainda falhar
  }

  function json(res, code, obj, extra) {
    const body = JSON.stringify(obj)
    res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, extra || {}))
    res.end(body)
  }
  function authed(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
    return !!m && S.tokens.has(m[1])
  }
  function readBody(req, cb) {
    const bufs = []
    req.on('data', (c) => bufs.push(c))
    req.on('end', () => cb(Buffer.concat(bufs).toString('utf8')))
  }
  function sseSend(res, ev, data) {
    res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n')
  }
  function pushJobs() {
    for (const r of S.sse) sseSend(r, 'jobs', S.jobs)
  }
  function pushState() {
    for (const r of S.sse) sseSend(r, 'state', S.state)
  }
  S.pushJobs = pushJobs
  S.pushState = pushState
  S.setJobs = (j) => { S.jobs = j; pushJobs() }
  S.setState = (st) => { S.state = st; pushState() }
  S.addJob = (j) => { S.jobs = [j].concat(S.jobs.filter((x) => x.id !== j.id)); pushJobs() }
  S.dropSse = () => { for (const r of S.sse) r.destroy(); S.sse.clear() }
  S.invalidate = () => { S.tokens.clear(); S.dropSse() }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const p = url.pathname
    if (req.method === 'GET' && p === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' })
      return res.end(fs.readFileSync(PAGE))
    }
    if (req.method === 'POST' && p === '/api/auth') {
      return readBody(req, (b) => {
        let j = null
        try { j = JSON.parse(b) } catch { /* */ }
        if (!j) return json(res, 400, { error: 'body' })
        if (j.pin !== PIN) return json(res, 401, { error: 'pin' })
        const t = crypto.randomBytes(32).toString('hex')
        S.tokens.add(t)
        json(res, 200, { token: t })
      })
    }
    if (req.method === 'GET' && p === '/api/events') {
      if (!S.tokens.has(url.searchParams.get('t') || '')) return json(res, 401, { error: 'auth' })
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write(':ok\n\n')
      if (S.state) sseSend(res, 'state', S.state)
      sseSend(res, 'jobs', S.jobs)
      S.sse.add(res)
      req.on('close', () => S.sse.delete(res))
      return
    }
    // ---- controle do teste (sem auth) ----
    if (p.indexOf('/__') === 0) {
      return readBody(req, (b) => {
        let j = null
        try { j = b ? JSON.parse(b) : null } catch { /* */ }
        if (p === '/__log') return json(res, 200, Object.assign({}, S.log, { maxUploads: S.maxUploads, activeUploads: S.activeUploads }))
        if (p === '/__jobs') { S.setJobs(j); return json(res, 200, {}) }
        if (p === '/__state') { S.setState(j); return json(res, 200, {}) }
        if (p === '/__cfg') { Object.assign(S.cfg, j); return json(res, 200, {}) }
        if (p === '/__drop') { S.dropSse(); return json(res, 200, {}) }
        if (p === '/__invalidate') { S.invalidate(); return json(res, 200, {}) }
        if (p === '/__reset') { S.log = { cmds: [], links: [], cancels: [], uploads: [], libraryGets: 0, jobsGets: 0, uploadsAborted: 0 }; S.maxUploads = 0; S.failNextUploads = {}; return json(res, 200, {}) }
        if (p === '/__fail') { S.failNextUploads[j.name] = j.times; return json(res, 200, {}) }
        if (p === '/__library') { S.library = j; return json(res, 200, {}) }
        json(res, 404, {})
      })
    }
    // ---- API autenticada ----
    if (!authed(req)) return json(res, 401, { error: 'auth' })
    if (req.method === 'GET' && p === '/api/state') return json(res, 200, S.state)
    if (req.method === 'GET' && p === '/api/library') { S.log.libraryGets++; return json(res, 200, S.library) }
    if (req.method === 'GET' && p === '/api/jobs') { S.log.jobsGets++; return json(res, 200, S.jobs) }
    if (req.method === 'POST' && p === '/api/cmd') {
      if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'type' })
      return readBody(req, (b) => {
        let j = null
        try { j = JSON.parse(b) } catch { /* */ }
        if (!j || typeof j.type !== 'string') return json(res, 400, { error: 'command' })
        S.log.cmds.push(j)
        json(res, 200, { ok: true })
      })
    }
    if (req.method === 'POST' && p === '/api/add-link') {
      if (!/^application\/json/.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'type' })
      return readBody(req, (b) => {
        let j = null
        try { j = JSON.parse(b) } catch { /* */ }
        const u = j && typeof j.url === 'string' ? j.url : ''
        S.log.links.push(u)
        const m = /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(u)
        if (!m) return json(res, 400, { error: 'url' })
        const id = m[1]
        if (u.indexOf('RATE') >= 0) return json(res, 429, { error: 'rate' }, { 'Retry-After': '1' })
        if (u.indexOf('BOOM') >= 0) return json(res, 500, { error: 'internal' })
        if (id === 'aaaaaaaaaaa') return json(res, 200, { ok: true, id, exists: true })
        if (S.jobs.some((x) => x.id === id && x.stage !== 'done' && x.stage !== 'error') || id === 'busybusybus') return json(res, 409, { error: 'busy' })
        json(res, 202, { ok: true, id })
        S.addJob({ id, title: id, stage: 'queued', pct: 0 })
      })
    }
    if (req.method === 'POST' && p === '/api/job-cancel') {
      return readBody(req, (b) => {
        let j = null
        try { j = JSON.parse(b) } catch { /* */ }
        S.log.cancels.push(j && j.id)
        const job = S.jobs.find((x) => j && x.id === j.id && x.stage !== 'done' && x.stage !== 'error')
        if (!job) return json(res, 404, { error: 'notfound' })
        json(res, 200, { ok: true })
        if (!S.cfg.noCancelEvent) S.setJobs(S.jobs.map((x) => (x === job ? Object.assign({}, x, { stage: 'error', error: 'Cancelado' }) : x)))
      })
    }
    if (req.method === 'POST' && p === '/api/upload') {
      const rawM = /[?&]name=([^&]*)/.exec(req.url)
      const rawName = rawM ? rawM[1] : null
      const entry = { name: null, rawName, auth: req.headers.authorization, type: req.headers['content-type'], length: Number(req.headers['content-length']) || 0, bytes: 0, sha: null, status: null, aborted: false }
      S.log.uploads.push(entry)
      if (!rawName) { entry.status = 400; return json(res, 400, { error: 'name' }) }
      let name
      try { name = decodeURIComponent(rawName) } catch { entry.status = 400; return json(res, 400, { error: 'name' }) }
      entry.name = name
      if (!/\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|aiff|aif|alac|webm)$/i.test(name)) { entry.status = 415; return json(res, 415, { error: 'ext' }) }
      if (!req.headers['content-length']) { entry.status = 411; return json(res, 411, { error: 'length' }) }
      S.activeUploads++
      S.maxUploads = Math.max(S.maxUploads, S.activeUploads)
      const hash = crypto.createHash('sha256')
      let done = false
      const finish = () => { if (!done) { done = true; S.activeUploads-- } }
      req.on('aborted', () => { entry.aborted = true; S.log.uploadsAborted++; finish() })
      req.socket.on('close', () => { if (!req.complete) { if (!entry.aborted) { entry.aborted = true; S.log.uploadsAborted++ } finish() } })
      // early413: responde sem ler o corpo e fecha (como o servidor real faz acima do limite)
      if (/^early413/.test(name)) { entry.status = 413; finish(); res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' }); return res.end('{"error":"size"}') }
      // neterr: derruba a conexão no meio (só na 1a vez; depois funciona)
      let killAt = 0
      if (S.failNextUploads[name] > 0 && /^neterr/.test(name)) { S.failNextUploads[name]--; killAt = 600 * 1024 }
      req.on('data', (c) => {
        entry.bytes += c.length
        hash.update(c)
        if (killAt && entry.bytes >= killAt) { entry.status = 'killed'; req.socket.destroy(); return }
        if (S.cfg.delayMs) { req.pause(); setTimeout(() => req.resume(), S.cfg.delayMs) }
      })
      req.on('end', () => {
        entry.sha = hash.digest('hex')
        const reply = () => {
          finish()
          const forced = /^err(\d{3})/.exec(name)
          if (forced) {
            const code = Number(forced[1])
            if (code === 429 && S.failNextUploads[name] === 0) { /* já liberado */ } else {
              if (code === 429 && S.failNextUploads[name] > 0) S.failNextUploads[name]--
              entry.status = code
              return json(res, code, { error: 'x' })
            }
          }
          entry.status = 202
          const id = 'local-' + crypto.createHash('md5').update(name).digest('hex').slice(0, 8)
          json(res, 202, { ok: true, id })
          S.addJob({ id, title: name.replace(/\.[^.]+$/, ''), stage: 'queued', pct: 0 })
        }
        if (S.cfg.respondMs) setTimeout(reply, S.cfg.respondMs); else reply()
      })
      return
    }
    json(res, 404, { error: 'notfound' })
  })
  S.server = server
  S.start = () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => { S.port = server.address().port; resolve(S) }))
  S.stop = () => { S.dropSse(); server.closeAllConnections && server.closeAllConnections(); return new Promise((r) => server.close(r)) }
  return S
}

module.exports = { createFake, PIN }

if (require.main === module) {
  createFake().start().then((s) => console.log('http://127.0.0.1:' + s.port + '/  PIN ' + PIN))
}
