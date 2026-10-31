// servidor HTTP do controle pelo celular: SEM dependência do Electron (testável com Node puro).
// Contrato: .superpowers/sdd/remote/contrato.md
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { createWriteStream } from 'fs'
import { lstat, mkdir, readdir, rm } from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import type { AddressInfo } from 'net'
import {
  MAX_UPLOAD_BYTES,
  parseAddLink,
  parseRemoteCommand,
  PIN_RE,
  safeUploadName,
  type RemoteCommand,
  type RemoteLibrary,
  type RemoteState
} from '../shared/remote'
import { localSongId } from '../shared/local'
import type { RemoteJobs } from './remoteJobs'

export interface RemoteServerDeps {
  page: string // HTML servido em GET /
  getPin(): string
  getLibrary(): RemoteLibrary
  onCommand(command: RemoteCommand): void // comando já validado
  onClients(count: number): void // número de celulares com a conexão de eventos aberta
  // ---- adicionar músicas pelo celular ----
  jobs: RemoteJobs // lista de jobs (alimentada pelo pipeline na cola com o Electron)
  uploadsDir: string // pasta de envios; cada envio ganha uma subpasta aleatória
  audioExts: string[] // extensões aceitas no envio (AUDIO_EXTENSIONS da biblioteca)
  hasSong(id: string): boolean // a música já está na biblioteca
  startLink(url: string): void // inicia o job de link sem esperar
  startUpload(file: string): void // inicia o job do arquivo gravado; quem chama apaga a pasta no fim
  cancelJob(id: string): void
}

const MAX_BODY = 4096
const PIN_FAILS = 5 // erros de PIN do mesmo IP...
const PIN_WINDOW_MS = 60_000 // ...dentro desta janela bloqueiam o IP...
const PIN_LOCK_MS = 60_000 // ...por este tempo
const CMDS_PER_SECOND = 30
const MAX_TOKENS = 64 // limite de celulares logados; o mais antigo sai quando passa
const SSE_MAX_BACKLOG = 256 * 1024 // cliente que não lê (rede morta) é derrubado em vez de crescer a memória
const JSON_TIMEOUT_MS = 10_000 // pedido JSON (ou GET) que não chega inteiro neste tempo é cortado (slowloris)
const UPLOAD_IDLE_MS = 60_000 // envio sem nenhum byte por este tempo é abortado; o envio inteiro NÃO tem limite de tempo
const UPLOADS_PER_TOKEN = 2
const UPLOADS_TOTAL = 4 // teto geral: vários tokens não enchem o disco juntos
const JOBS_MIN_GAP_MS = 260 // SSE de jobs: no máximo 4 por segundo (juntando progressos)
const UPLOAD_DIR_RE = /^[0-9a-f]{32}$/ // nome das subpastas que nós criamos
// nomes que o Windows trata como dispositivo, mesmo com extensão
const WIN_RESERVED_RE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

// Host só como IP ou localhost: um site malicioso que aponta o próprio nome para o IP do PC
// (DNS rebinding) chega aqui com o nome dele no Host e é recusado
const HOST_RE = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\]|localhost)(:\d{1,5})?$/i

const PAGE_CSP = "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"

interface TokenInfo {
  windowStart: number
  count: number
}

interface IpGuard {
  fails: number[] // instantes dos erros ainda dentro da janela
  lockedUntil: number
}

// PIN e token são comparados por hash: tamanho fixo, então timingSafeEqual nunca lança nem vaza o tamanho
function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

// ::ffff:192.168.0.5 e 192.168.0.5 são o mesmo celular
function clientIp(req: IncomingMessage): string {
  const a = req.socket.remoteAddress ?? 'unknown'
  return a.startsWith('::ffff:') ? a.slice(7) : a
}

// lê o corpo abortando ao passar do limite; null = grande demais
function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > max) return resolve(null)
    const chunks: Buffer[] = []
    let size = 0
    const done = (v: string | null | Error): void => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onErr)
      req.off('close', onClose)
      if (v instanceof Error) reject(v)
      else resolve(v)
    }
    const onData = (c: Buffer): void => {
      size += c.length
      if (size > max) {
        req.pause() // para de ler; a resposta 413 fecha a conexão
        done(null)
      } else chunks.push(c)
    }
    const onEnd = (): void => done(Buffer.concat(chunks).toString('utf8'))
    const onErr = (e: Error): void => done(e)
    const onClose = (): void => done(new Error('aborted'))
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onErr)
    req.on('close', onClose)
  })
}

export class RemoteServer {
  private server: Server | null = null
  private state: string = 'null' // último RemoteState já em JSON
  private tokens = new Map<string, TokenInfo>()
  private sse = new Map<ServerResponse, string>() // conexão de eventos -> token
  private guards = new Map<string, IpGuard>()
  private pingTimer: NodeJS.Timeout | null = null
  protected pingMs = 15_000
  protected jsonTimeoutMs = JSON_TIMEOUT_MS
  protected uploadIdleMs = UPLOAD_IDLE_MS
  private uploadsByToken = new Map<string, number>()
  private uploadAborts = new Set<AbortController>()
  private jobsTimer: NodeJS.Timeout | null = null
  private jobsLastAt = 0
  private jobsLastFrame = ''
  private unsubJobs: (() => void) | null = null

  constructor(protected deps: RemoteServerDeps) {}

  // escuta em 0.0.0.0; port 0 = qualquer porta livre (testes). Rejeita se a porta estiver em uso
  start(port: number): Promise<void> {
    if (this.server) return Promise.reject(new Error('servidor já iniciado'))
    const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
      this.handle(req, res).catch((e) => {
        // nunca loga corpo, URL nem cabeçalhos (têm PIN e token)
        console.warn('[remote] erro no pedido:', e instanceof Error ? e.message : 'desconhecido')
        if (!res.headersSent) this.json(res, 500, { error: 'internal' }, { Connection: 'close' })
        else res.destroy()
      })
    })
    // requestTimeout do Node cortaria QUALQUER pedido que leve mais de 10 s para chegar, inclusive um
    // upload grande: fica desligado e o corte de 10 s é feito por pedido em handle() (só as rotas
    // que não são upload); o upload tem a própria parada por falta de dados
    server.requestTimeout = 0
    server.headersTimeout = 5_000
    server.keepAliveTimeout = 5_000
    server.maxConnections = 200
    this.server = server
    return new Promise<void>((resolve, reject) => {
      const onListenError = (e: Error): void => {
        this.server = null
        reject(e)
      }
      server.once('error', onListenError)
      server.listen(port, '0.0.0.0', () => {
        server.off('error', onListenError)
        server.on('error', (e) => console.warn('[remote] erro do servidor:', e.message))
        this.unsubJobs = this.deps.jobs.onChange(() => this.scheduleJobs())
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const server = this.server
    if (!server) return
    this.server = null
    const had = this.sse.size
    this.stopPing()
    this.unsubJobs?.()
    this.unsubJobs = null
    if (this.jobsTimer) clearTimeout(this.jobsTimer)
    this.jobsTimer = null
    this.abortUploads()
    for (const res of this.sse.keys()) res.destroy()
    this.sse.clear()
    this.tokens.clear()
    this.guards.clear()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections() // keep-alive parado seguraria o close() por segundos
    })
    if (had > 0) this.deps.onClients(0)
  }

  port(): number | null {
    const a = this.server?.address()
    return a && typeof a === 'object' ? (a as AddressInfo).port : null
  }

  // guarda o último estado e o envia a todos os celulares conectados
  setState(state: RemoteState | null): void {
    this.state = JSON.stringify(state ?? null)
    const frame = `event: state\ndata: ${this.state}\n\n`
    for (const res of [...this.sse.keys()]) this.write(res, frame)
  }

  // derruba todos os tokens (novo PIN) e fecha as conexões de eventos
  invalidateTokens(): void {
    this.tokens.clear()
    this.abortUploads() // envio em andamento era de um celular que acabou de perder o acesso
    this.dropAll()
  }

  clients(): number {
    return this.sse.size
  }

  // ---------- internos ----------

  private json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
    const text = JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra
    })
    res.end(text)
  }

  // resposta antes de ler o corpo do POST: fecha a conexão para não ficar lendo lixo
  private reject(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
    this.json(res, status, body, { Connection: 'close', ...extra })
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      return this.reject(res, 400, { error: 'url' })
    }
    const path = url.pathname
    const method = req.method ?? ''
    if (!HOST_RE.test(req.headers.host ?? '')) return this.reject(res, 400, { error: 'host' })

    const allowed: Record<string, string> = {
      '/': 'GET',
      '/api/auth': 'POST',
      '/api/state': 'GET',
      '/api/library': 'GET',
      '/api/events': 'GET',
      '/api/cmd': 'POST',
      '/api/add-link': 'POST',
      '/api/upload': 'POST',
      '/api/job-cancel': 'POST',
      '/api/jobs': 'GET'
    }
    const want = allowed[path]
    if (!want) return this.reject(res, 404, { error: 'notfound' })
    if (method !== want) return this.reject(res, 405, { error: 'method' }, { Allow: want })

    // pedido que não termina de chegar em 10 s é cortado (slowloris). O upload fica de fora: tem a própria regra
    if (path !== '/api/upload') {
      const timer = setTimeout(() => {
        if (req.complete || res.headersSent) return
        this.reject(res, 408, { error: 'timeout' })
        setTimeout(() => req.socket.destroy(), 1000).unref()
      }, this.jsonTimeoutMs)
      timer.unref()
      res.on('close', () => clearTimeout(timer))
    }

    if (path === '/') return this.servePage(res)
    if (path === '/api/auth') return this.auth(req, res)
    if (path === '/api/events') return this.events(req, res, url.searchParams.get('t'))

    const token = this.bearer(req)
    if (!token) return this.reject(res, 401, { error: 'auth' })
    if (path === '/api/state') return this.rawJson(res, this.state)
    if (path === '/api/library') return this.json(res, 200, this.deps.getLibrary())
    if (path === '/api/jobs') return this.json(res, 200, this.deps.jobs.list())
    if (path === '/api/upload') return this.upload(req, res, token)
    if (path === '/api/add-link') return this.addLink(req, res, token)
    if (path === '/api/job-cancel') return this.jobCancel(req, res, token)
    return this.cmd(req, res, token)
  }

  private servePage(res: ServerResponse): void {
    const html = this.deps.page
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Content-Security-Policy': PAGE_CSP,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer' // o token de /api/events vai na URL; nada de vazar por referrer
    })
    res.end(html)
  }

  // JSON já serializado (o estado guardado)
  private rawJson(res: ServerResponse, text: string): void {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    })
    res.end(text)
  }

  // exige JSON: assim um site qualquer não consegue postar daqui sem preflight (que não existe: sem CORS)
  private isJson(req: IncomingMessage): boolean {
    return /^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')
  }

  private async auth(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = clientIp(req)
    const now = Date.now()
    const guard = this.guards.get(ip)
    if (guard && guard.lockedUntil > now) {
      return this.reject(res, 429, { error: 'locked', retryAfter: Math.ceil((guard.lockedUntil - now) / 1000) })
    }
    if (!this.isJson(req)) return this.reject(res, 415, { error: 'type' })
    const text = await readBody(req, MAX_BODY)
    if (text === null) return this.reject(res, 413, { error: 'size' })
    let pin: unknown
    try {
      const body = JSON.parse(text)
      pin = body && typeof body === 'object' ? (body as Record<string, unknown>).pin : undefined
    } catch {
      pin = undefined
    }
    if (typeof pin !== 'string' || !PIN_RE.test(pin)) return this.json(res, 400, { error: 'body' })

    if (!sameSecret(pin, this.deps.getPin())) {
      this.sweepGuards(now)
      const g = this.guards.get(ip) ?? { fails: [], lockedUntil: 0 }
      g.fails = g.fails.filter((t) => now - t < PIN_WINDOW_MS)
      g.fails.push(now)
      if (g.fails.length >= PIN_FAILS) {
        g.lockedUntil = now + PIN_LOCK_MS
        g.fails = []
      }
      this.guards.set(ip, g)
      return this.json(res, 401, { error: 'pin' })
    }
    this.guards.delete(ip) // acerto zera o contador
    const token = randomBytes(32).toString('hex')
    this.tokens.set(token, { windowStart: now, count: 0 })
    if (this.tokens.size > MAX_TOKENS) {
      const oldest = this.tokens.keys().next().value as string
      this.tokens.delete(oldest)
      for (const [r, t] of [...this.sse]) if (t === oldest) this.dropClient(r)
    }
    this.json(res, 200, { token })
  }

  // esquece IPs que já passaram da janela, para o mapa não crescer
  private sweepGuards(now: number): void {
    if (this.guards.size < 256) return
    for (const [ip, g] of this.guards) {
      if (g.lockedUntil <= now && g.fails.every((t) => now - t >= PIN_WINDOW_MS)) this.guards.delete(ip)
    }
  }

  private bearer(req: IncomingMessage): string | null {
    const h = req.headers.authorization
    if (typeof h !== 'string' || !h.startsWith('Bearer ')) return null
    const t = h.slice(7).trim()
    return this.tokens.has(t) ? t : null
  }

  // 30 pedidos JSON por segundo por token (cmd, add-link, job-cancel dividem a mesma conta); true = passou
  private rateOk(token: string, res: ServerResponse): boolean {
    const info = this.tokens.get(token)!
    const now = Date.now()
    if (now - info.windowStart >= 1000) {
      info.windowStart = now
      info.count = 0
    }
    if (++info.count > CMDS_PER_SECOND) {
      this.reject(res, 429, { error: 'rate' }, { 'Retry-After': '1' })
      return false
    }
    return true
  }

  // corpo JSON de um POST: valida limite e tipo; null = já respondeu o erro
  private async jsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
    if (!this.isJson(req)) {
      this.reject(res, 415, { error: 'type' })
      return null
    }
    const text = await readBody(req, MAX_BODY)
    if (text === null) {
      this.reject(res, 413, { error: 'size' })
      return null
    }
    try {
      return JSON.parse(text) ?? undefined
    } catch {
      return undefined
    }
  }

  private async cmd(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
    if (!this.rateOk(token, res)) return
    const body = await this.jsonBody(req, res)
    if (body === null) return
    const cmd = parseRemoteCommand(body)
    if (!cmd) return this.json(res, 400, { error: 'command' })
    this.deps.onCommand(cmd)
    this.json(res, 200, { ok: true })
  }

  private async addLink(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
    if (!this.rateOk(token, res)) return
    const body = await this.jsonBody(req, res)
    if (body === null) return
    const link = parseAddLink(body)
    if (!link) return this.json(res, 400, { error: 'url' })
    if (this.deps.hasSong(link.id)) return this.json(res, 200, { ok: true, id: link.id, exists: true })
    if (this.deps.jobs.isActive(link.id)) return this.json(res, 409, { error: 'busy' })
    this.deps.jobs.queue(link.id, link.id)
    this.deps.startLink(link.url)
    this.json(res, 202, { ok: true, id: link.id })
  }

  private async jobCancel(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
    if (!this.rateOk(token, res)) return
    const body = await this.jsonBody(req, res)
    if (body === null) return
    const id = body && typeof body === 'object' ? (body as Record<string, unknown>).id : undefined
    if (typeof id !== 'string' || id.length === 0 || id.length > 200) return this.json(res, 400, { error: 'id' })
    if (!this.deps.jobs.isActive(id)) return this.json(res, 404, { error: 'notfound' })
    this.deps.cancelJob(id)
    this.deps.jobs.failActive(id, 'Cancelado') // o pipeline já avisa; isto cobre o job que ele não conhecia
    this.json(res, 200, { ok: true })
  }

  // ---------- upload de arquivo ----------

  private abortUploads(): void {
    for (const ac of [...this.uploadAborts]) ac.abort(new Error('aborted'))
  }

  private async upload(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
    // tudo abaixo recusa ANTES de ler o corpo; reject() manda Connection: close
    const rawName = rawQueryParam(req.url ?? '', 'name')
    if (!rawName || rawName.length > 1000) return this.reject(res, 400, { error: 'name' })
    // o nome fica codificado: safeUploadName decodifica uma vez só (searchParams decodificaria duas)
    const safe = safeUploadName(rawName, this.deps.audioExts)
    if (!safe) return this.reject(res, 415, { error: 'ext' })
    if (!/^application\/octet-stream\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return this.reject(res, 415, { error: 'type' })
    const lenHeader = req.headers['content-length']
    if (req.headers['transfer-encoding'] || typeof lenHeader !== 'string' || !/^\d{1,15}$/.test(lenHeader)) {
      return this.reject(res, 411, { error: 'length' })
    }
    const declared = Number(lenHeader)
    if (declared > MAX_UPLOAD_BYTES) return this.reject(res, 413, { error: 'size' })
    if (declared === 0) return this.reject(res, 400, { error: 'empty' })
    const mine = this.uploadsByToken.get(token) ?? 0
    if (mine >= UPLOADS_PER_TOKEN || this.uploadAborts.size >= UPLOADS_TOTAL) return this.reject(res, 429, { error: 'uploads' })

    // a partir daqui o envio ocupa uma vaga (contada antes de qualquer await)
    this.uploadsByToken.set(token, mine + 1)
    const ac = new AbortController()
    this.uploadAborts.add(ac)
    let idle: NodeJS.Timeout | undefined
    const arm = (): void => {
      clearTimeout(idle)
      idle = setTimeout(() => ac.abort(new Error('idle')), this.uploadIdleMs)
    }
    const root = resolve(this.deps.uploadsDir)
    const dir = join(root, randomBytes(16).toString('hex'))
    let made = false
    // a vaga volta assim que o envio acaba (antes de apagar a pasta, que pode demorar)
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      this.uploadAborts.delete(ac)
      const left = (this.uploadsByToken.get(token) ?? 1) - 1
      if (left > 0) this.uploadsByToken.set(token, left)
      else this.uploadsByToken.delete(token)
    }
    try {
      const stem = safe.slice(0, safe.lastIndexOf('.'))
      const fileName = WIN_RESERVED_RE.test(stem) ? `_${safe}` : safe
      const file = join(dir, fileName)
      // pasta aleatória nossa dentro da pasta de envios, arquivo direto dentro dela: nada fora disso
      const rel = relative(root, dir)
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || dirname(file) !== dir) throw new Error('caminho fora da pasta de envios')
      await mkdir(dir, { recursive: true })
      made = true

      let got = 0
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          got += chunk.length
          if (got > declared) return cb(new Error('over'))
          arm()
          cb(null, chunk)
        }
      })
      arm()
      await pipeline(req, counter, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: ac.signal })
      if (got !== declared) throw new Error('short')
      clearTimeout(idle)

      const id = localSongId(file)
      this.deps.jobs.queue(id, stem)
      try {
        this.deps.startUpload(file)
      } catch (e) {
        this.deps.jobs.failActive(id, 'Não foi possível iniciar')
        throw e
      }
      made = false // daqui em diante a pasta é do job; quem chamou apaga ao terminar
      this.json(res, 202, { ok: true, id }, { Connection: 'close' })
    } catch (e) {
      clearTimeout(idle)
      release()
      if (made) await rmDir(dir)
      const reason = ac.signal.aborted ? ac.signal.reason : e // abort() troca o erro por um AbortError genérico; o motivo fica em reason
      const msg = reason instanceof Error ? reason.message : ''
      // conexão que caiu, parou ou foi derrubada já não tem a quem responder
      if (!res.headersSent && res.socket && !res.socket.destroyed) {
        if (msg === 'over') this.reject(res, 413, { error: 'size' })
        else if (msg === 'idle') this.reject(res, 408, { error: 'timeout' })
        else if (msg === 'aborted') this.reject(res, 401, { error: 'auth' }) // novo PIN ou servidor parando
        else this.reject(res, 500, { error: 'internal' })
      }
      // log sem caminho, nome, token nem cabeçalho
      console.warn('[remote] envio abortado:', msg === 'idle' || msg === 'over' || msg === 'aborted' ? msg : 'erro')
    } finally {
      clearTimeout(idle)
      release()
    }
  }

  // ---------- SSE de jobs ----------

  // no máximo 4 quadros por segundo: a primeira mudança sai logo, as seguintes esperam e viram um só quadro
  private scheduleJobs(): void {
    if (this.sse.size === 0 || this.jobsTimer) return
    const wait = Math.max(0, this.jobsLastAt + JOBS_MIN_GAP_MS - Date.now())
    this.jobsTimer = setTimeout(() => {
      this.jobsTimer = null
      const frame = this.jobsFrame()
      if (frame === this.jobsLastFrame) return
      this.jobsLastFrame = frame
      this.jobsLastAt = Date.now()
      for (const res of [...this.sse.keys()]) this.write(res, frame)
    }, wait)
  }

  private jobsFrame(): string {
    return `event: jobs\ndata: ${JSON.stringify(this.deps.jobs.list())}\n\n`
  }

  private events(req: IncomingMessage, res: ServerResponse, token: string | null): void {
    if (!token || !this.tokens.has(token)) return this.reject(res, 401, { error: 'auth' })
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no'
    })
    req.socket.setNoDelay(true)
    req.socket.setTimeout(0) // sem timeout de ociosidade: o ping de 15 s mantém vivo
    res.write(': conectado\n\n') // abre o fluxo já (headers saem junto)
    if (this.state !== 'null') res.write(`event: state\ndata: ${this.state}\n\n`)
    res.write(this.jobsFrame()) // sempre, mesmo vazio ([]), para a página saber o ponto de partida
    this.sse.set(res, token)
    res.on('close', () => this.dropClient(res))
    this.startPing()
    this.deps.onClients(this.sse.size)
  }

  private write(res: ServerResponse, frame: string): void {
    if (res.destroyed || res.writableLength > SSE_MAX_BACKLOG) return this.dropClient(res, true)
    res.write(frame)
  }

  // tira uma conexão de eventos (idempotente) e avisa a contagem nova
  private dropClient(res: ServerResponse, destroy = false): void {
    if (!this.sse.delete(res)) return
    if (destroy) res.destroy()
    else if (!res.writableEnded) res.end()
    if (this.sse.size === 0) this.stopPing()
    this.deps.onClients(this.sse.size)
  }

  // fecha todas de uma vez e avisa só uma vez
  private dropAll(): void {
    if (this.sse.size === 0) return
    const all = [...this.sse.keys()]
    this.sse.clear()
    this.stopPing()
    for (const res of all) res.end()
    this.deps.onClients(0)
  }

  // um timer só para todos os celulares; existe só enquanto há alguém conectado
  private startPing(): void {
    if (this.pingTimer) return
    this.pingTimer = setInterval(() => {
      for (const res of [...this.sse.keys()]) this.write(res, 'event: ping\ndata: {}\n\n')
    }, this.pingMs)
    this.pingTimer.unref()
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }
}

// valor ainda codificado de ?chave=... (URLSearchParams já decodifica, e o nome do arquivo precisa chegar cru)
function rawQueryParam(rawUrl: string, key: string): string | null {
  const q = rawUrl.split('?')[1]
  if (!q) return null
  for (const part of q.split('&')) {
    if (part.startsWith(key + '=')) return part.slice(key.length + 1)
  }
  return null
}

// apaga uma subpasta de envio (só a que tem o nome aleatório que nós criamos)
async function rmDir(dir: string): Promise<void> {
  try {
    if (UPLOAD_DIR_RE.test(dir.split(/[\\/]/).pop() ?? '')) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    // no Windows um arquivo ainda aberto pode resistir; a limpeza das 24 h pega depois
  }
}

// o job de um envio terminou: apaga a subpasta dele (file = caminho que foi para startUpload)
export async function removeUploadFolder(uploadsDir: string, file: string): Promise<void> {
  const dir = dirname(resolve(file))
  const rel = relative(resolve(uploadsDir), dir)
  if (!UPLOAD_DIR_RE.test(rel)) return // só filho direto da pasta de envios com o nome aleatório
  await rmDir(dir)
}

// ao subir: apaga subpastas de envio com mais de maxAgeMs (sobras de queda do app)
export async function pruneUploads(uploadsDir: string, maxAgeMs: number, now = Date.now()): Promise<number> {
  let removed = 0
  let names: string[]
  try {
    names = await readdir(uploadsDir)
  } catch {
    return 0
  }
  for (const n of names) {
    if (!UPLOAD_DIR_RE.test(n)) continue
    const dir = join(uploadsDir, n)
    try {
      const st = await lstat(dir) // lstat: link simbólico não é seguido
      if (st.isDirectory() && now - st.mtimeMs > maxAgeMs) {
        await rm(dir, { recursive: true, force: true })
        removed++
      }
    } catch {
      // sumiu no meio: ok
    }
  }
  return removed
}
