// ajudantes dos testes: servidor com dependências falsas, cliente HTTP cru, SSE, upload lento
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const H = require(process.env.SM_HARNESS)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// espera sem setTimeout (para rodar com relógio simulado)
const tick = () => new Promise((r) => setImmediate(r))
async function waitFor(cond, ms = 5000, step = 10) {
  const end = Date.now() + ms
  for (;;) {
    const v = await cond()
    if (v) return v
    if (Date.now() > end) throw new Error('waitFor: tempo esgotado: ' + cond.toString().slice(0, 120))
    await sleep(step)
  }
}

// captura console.warn do servidor (para provar que não vaza token/PIN)
const warns = []
const origWarn = console.warn
console.warn = (...a) => warns.push(a.map(String).join(' '))

class TestServer extends H.RemoteServer {
  constructor(deps, o = {}) {
    super(deps)
    if (o.pingMs) this.pingMs = o.pingMs
    if (o.jsonTimeoutMs) this.jsonTimeoutMs = o.jsonTimeoutMs
    if (o.uploadIdleMs) this.uploadIdleMs = o.uploadIdleMs
  }
}

const booted = new Set()
require('node:test').after(async () => {
  // teste que falhou não pode deixar servidor aberto segurando o processo
  for (const c of [...booted]) await c.stop().catch(() => {})
})

async function boot(o = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-srv-'))
  const uploadsDir = path.join(root, 'uploads')
  const calls = { cmds: [], clients: [], links: [], uploads: [], cancels: [], songs: new Set() }
  const jobs = o.jobs || new H.RemoteJobs()
  const deps = {
    page: '<!doctype html><title>t</title>',
    getPin: () => '123456',
    getLibrary: () => ({ songs: [], scenes: [] }),
    onCommand: (c) => calls.cmds.push(c),
    onClients: (n) => calls.clients.push(n),
    jobs,
    uploadsDir,
    audioExts: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'alac', 'webm'],
    hasSong: (id) => calls.songs.has(id),
    startLink: (url) => calls.links.push(url),
    startUpload: (file) => {
      const st = fs.statSync(file)
      calls.uploads.push({ file, size: st.size })
    },
    cancelJob: (id) => calls.cancels.push(id),
    ...(o.deps || {})
  }
  const srv = new TestServer(deps, o)
  await srv.start(0)
  const port = srv.port()
  const ctx = {
    srv,
    port,
    calls,
    jobs,
    root,
    uploadsDir,
    deps,
    async login() {
      const r = await req(port, 'POST', '/api/auth', { pin: '123456' })
      if (r.status !== 200) throw new Error('login falhou ' + r.status)
      return r.json.token
    },
    async stop() {
      booted.delete(ctx)
      await srv.stop()
      jobs.dispose()
      fs.rmSync(root, { recursive: true, force: true })
    },
    dirs() {
      try {
        return fs.readdirSync(uploadsDir)
      } catch {
        return []
      }
    }
  }
  booted.add(ctx)
  return ctx
}

// pedido simples; body objeto vira JSON
function req(port, method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
    const h = { ...headers }
    if (data !== null) {
      if (!Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['Content-Type'] = 'application/json'
      h['Content-Length'] = Buffer.byteLength(data)
    }
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: h, agent: false }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try {
          json = JSON.parse(text)
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json })
      })
    })
    r.on('error', reject)
    if (data !== null) r.write(data)
    r.end()
  })
}
const authed = (port, token, method, p, body, headers = {}) => req(port, method, p, body, { Authorization: 'Bearer ' + token, ...headers })

// cliente SSE
function sse(port, token) {
  const events = []
  const state = { status: 0, closed: false }
  let buf = ''
  const r = http.get({ host: '127.0.0.1', port, path: '/api/events?t=' + token, agent: false }, (res) => {
    state.status = res.statusCode
    res.setEncoding('utf8')
    res.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const m = /^event: (.+)\ndata: (.*)$/m.exec(raw)
        if (m) events.push({ ev: m[1], data: JSON.parse(m[2]), t: Date.now() })
      }
    })
    res.on('close', () => (state.closed = true))
  })
  r.on('error', () => (state.closed = true))
  return {
    events,
    state,
    of: (name) => events.filter((e) => e.ev === name),
    waitFor: (pred, ms) => waitFor(() => events.find(pred), ms),
    close: () => r.destroy()
  }
}

// envio: manda `total` bytes 'a' em pedaços, com pausa entre eles; declared = Content-Length mandado
function upload(port, token, o = {}) {
  const total = o.total ?? 1000
  const declared = o.declared === undefined ? total : o.declared
  const chunk = o.chunk ?? 64 * 1024
  const q = o.rawQuery !== undefined ? o.rawQuery : o.name === undefined ? '' : '?name=' + encodeURIComponent(o.name)
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream', ...(o.headers || {}) }
  if (declared !== null) headers['Content-Length'] = declared
  return new Promise((resolve) => {
    let sent = 0
    let done = false
    const finish = (v) => {
      if (!done) {
        done = true
        resolve({ sent, ...v })
      }
    }
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/upload' + q, headers, agent: false }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try {
          json = JSON.parse(text)
        } catch {}
        finish({ status: res.statusCode, headers: res.headers, text, json })
      })
    })
    r.on('error', (e) => finish({ error: e.code || e.message }))
    r.on('socket', (s) => o.onSocket && o.onSocket(s, r))
    ;(async () => {
      const buf = Buffer.alloc(chunk, 0x61)
      if (o.holdBeforeBody) await o.holdBeforeBody()
      while (sent < total && !done) {
        const n = Math.min(chunk, total - sent)
        const ok = r.write(n === chunk ? buf : buf.subarray(0, n))
        sent += n
        if (!ok) {
          await new Promise((rs) => {
            const on = () => {
              r.off('drain', on)
              r.off('close', on)
              rs()
            }
            r.on('drain', on)
            r.on('close', on)
          })
        }
        if (o.gap) await sleep(o.gap)
        if (o.dropAfter != null && sent >= o.dropAfter) {
          r.destroy()
          return finish({ dropped: true })
        }
        if (o.stopAfter != null && sent >= o.stopAfter) return // fica parado sem fechar (teste de ociosidade)
      }
      if (!done && o.noEnd !== true) r.end()
    })()
    o.abort && (o.abort.fn = () => r.destroy())
  })
}

module.exports = { H, sleep, tick, waitFor, boot, req, authed, sse, upload, warns, origWarn, TestServer, crypto, fs, os, path }
