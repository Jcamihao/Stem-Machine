// servidor HTTP do controle pelo celular: SEM dependência do Electron (testável com Node puro).
// Contrato: .superpowers/sdd/remote/contrato.md
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { AddressInfo } from 'net'
import { parseRemoteCommand, PIN_RE, type RemoteCommand, type RemoteLibrary, type RemoteState } from '../shared/remote'

export interface RemoteServerDeps {
  page: string // HTML servido em GET /
  getPin(): string
  getLibrary(): RemoteLibrary
  onCommand(command: RemoteCommand): void // comando já validado
  onClients(count: number): void // número de celulares com a conexão de eventos aberta
}

const MAX_BODY = 4096
const PIN_FAILS = 5 // erros de PIN do mesmo IP...
const PIN_WINDOW_MS = 60_000 // ...dentro desta janela bloqueiam o IP...
const PIN_LOCK_MS = 60_000 // ...por este tempo
const CMDS_PER_SECOND = 30
const MAX_TOKENS = 64 // limite de celulares logados; o mais antigo sai quando passa
const SSE_MAX_BACKLOG = 256 * 1024 // cliente que não lê (rede morta) é derrubado em vez de crescer a memória

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

  constructor(protected deps: RemoteServerDeps) {}

  // escuta em 0.0.0.0; port 0 = qualquer porta livre (testes). Rejeita se a porta estiver em uso
  start(port: number): Promise<void> {
    if (this.server) return Promise.reject(new Error('servidor já iniciado'))
    const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
      this.handle(req, res).catch((e) => {
        // nunca loga corpo, URL nem cabeçalhos (têm PIN e token)
        console.warn('[remote] erro no pedido:', e instanceof Error ? e.message : 'desconhecido')
        if (!res.headersSent) this.json(res, 500, { error: 'internal' })
        else res.destroy()
      })
    })
    server.requestTimeout = 10_000 // pedido incompleto (slowloris) é cortado; não afeta o SSE (é resposta)
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
      '/api/cmd': 'POST'
    }
    const want = allowed[path]
    if (!want) return this.reject(res, 404, { error: 'notfound' })
    if (method !== want) return this.reject(res, 405, { error: 'method' }, { Allow: want })

    if (path === '/') return this.servePage(res)
    if (path === '/api/auth') return this.auth(req, res)
    if (path === '/api/events') return this.events(req, res, url.searchParams.get('t'))

    const token = this.bearer(req)
    if (!token) return this.reject(res, 401, { error: 'auth' })
    if (path === '/api/state') return this.rawJson(res, this.state)
    if (path === '/api/library') return this.json(res, 200, this.deps.getLibrary())
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

  private async cmd(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
    const info = this.tokens.get(token)!
    const now = Date.now()
    if (now - info.windowStart >= 1000) {
      info.windowStart = now
      info.count = 0
    }
    if (++info.count > CMDS_PER_SECOND) return this.reject(res, 429, { error: 'rate' }, { 'Retry-After': '1' })
    if (!this.isJson(req)) return this.reject(res, 415, { error: 'type' })
    const text = await readBody(req, MAX_BODY)
    if (text === null) return this.reject(res, 413, { error: 'size' })
    let cmd: RemoteCommand | null = null
    try {
      cmd = parseRemoteCommand(JSON.parse(text))
    } catch {
      cmd = null
    }
    if (!cmd) return this.json(res, 400, { error: 'command' })
    this.deps.onCommand(cmd)
    this.json(res, 200, { ok: true })
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
