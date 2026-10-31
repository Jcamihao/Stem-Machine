// lista de músicas sendo adicionadas, como o celular vê: SEM dependência do Electron (testável com Node puro).
// Recebe os JobEvent do pipeline e mantém um RemoteJob[] enxuto. Contrato: .superpowers/sdd/remote-add/contrato.md
import type { JobEvent } from '../shared/types'
import type { RemoteJob } from '../shared/remote'

const MAX_JOBS = 20
const FINISHED_TTL_MS = 60 * 60 * 1000 // pronto/erro some da lista depois de 1 h
const MAX_TEXT = 300

// o pipeline manda esta mensagem quando já existe um job do mesmo id rodando: não é falha do job que roda
const ALREADY_RUNNING = 'This song is already being processed'

interface Entry {
  job: RemoteJob
  finishedAt: number | null
}

export interface RemoteJobsOptions {
  now?: () => number // relógio injetável (testes)
  ttlMs?: number
}

// texto vindo do pipeline vai para a rede: uma linha, curto, sem caminho do disco do PC
// (mensagens de erro do ffmpeg/yt-dlp às vezes citam pastas)
function clean(text: unknown, max = MAX_TEXT): string {
  if (typeof text !== 'string') return ''
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  return line
    .replace(/[A-Za-z]:\\[^\s"'<>|]*/g, '…')
    .replace(/(?:^|(?<=[\s"'(=:]))\/(?:home|Users|tmp|var|mnt|root|opt|usr|private|Volumes)\b[^\s"'<>|]*/g, '…')
    .trim()
    .slice(0, max)
}

export class RemoteJobs {
  private entries: Entry[] = [] // mais novo primeiro
  private listeners = new Set<() => void>()
  private timer: NodeJS.Timeout | null = null
  private readonly now: () => number
  private readonly ttl: number

  constructor(opts: RemoteJobsOptions = {}) {
    this.now = opts.now ?? Date.now
    this.ttl = opts.ttlMs ?? FINISHED_TTL_MS
  }

  list(): RemoteJob[] {
    this.prune()
    return this.entries.map((e) => ({ ...e.job }))
  }

  // true = job ainda não terminou (na fila ou rodando)
  isActive(id: string): boolean {
    this.prune()
    const e = this.entries.find((x) => x.job.id === id)
    return !!e && e.finishedAt === null
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  // criado por add-link/upload: aparece na hora, antes do primeiro evento do pipeline
  queue(id: string, title: string): void {
    this.put({ id, title: clean(title) || id, stage: 'queued', pct: 0 }, true)
  }

  // o pipeline nunca avisou nem terminou (ex.: arquivo ilegível recusado sem id): não deixa o cartão preso na fila
  failIfQueued(id: string, message: string): void {
    const e = this.entries.find((x) => x.job.id === id)
    if (e && e.finishedAt === null && e.job.stage === 'queued') this.put({ ...e.job, stage: 'error', error: clean(message) }, false)
  }

  // cancelamento pedido pelo celular sem evento do pipeline
  failActive(id: string, message: string): void {
    const e = this.entries.find((x) => x.job.id === id)
    if (e && e.finishedAt === null) this.put({ ...e.job, stage: 'error', error: clean(message) }, false)
  }

  handle(ev: JobEvent): void {
    const id = ev.data.videoId
    // adicionar faixa a uma música da biblioteca (resplit) tem a barra própria no player; id vazio = recusa antes de existir job
    if (!id || ('resplit' in ev.data && ev.data.resplit)) return
    const prev = this.entries.find((x) => x.job.id === id)?.job
    const prevDone = !prev || prev.stage === 'done' || prev.stage === 'error' // nova rodada do mesmo id sobe para o topo
    if (ev.kind === 'progress') {
      const d = ev.data
      const job: RemoteJob = {
        id,
        title: clean(d.title) || prev?.title || id,
        stage: d.stage,
        pct: Number.isFinite(d.pct) ? Math.min(100, Math.max(0, d.pct)) : 0
      }
      const message = clean(d.message, 200)
      if (message) job.message = message
      this.put(job, prevDone)
    } else if (ev.kind === 'done') {
      this.put({ id, title: clean(ev.data.song?.title) || prev?.title || id, stage: 'done', pct: 100 }, prevDone)
    } else {
      const d = ev.data
      // job que roda não falhou só porque alguém tentou iniciar o mesmo id; job já terminado não muda de estado
      if (d.message === ALREADY_RUNNING || (prev && prevDone)) return
      const error = d.message === 'Cancelled' ? 'Cancelado' : clean(d.message, 200) || 'Erro'
      this.put({ id, title: prev?.title || id, stage: 'error', pct: prev?.pct ?? 0, error }, !prev)
    }
  }

  // tira os terminados há mais de 1 h; devolve se mudou algo
  prune(): boolean {
    const now = this.now()
    const before = this.entries.length
    this.entries = this.entries.filter((e) => e.finishedAt === null || now - e.finishedAt < this.ttl)
    this.schedule()
    return this.entries.length !== before
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.listeners.clear()
  }

  // ---------- internos ----------

  // grava o job; toFront = job novo (ou nova rodada do mesmo id) sobe para o topo
  private put(job: RemoteJob, toFront: boolean): void {
    const finished = job.stage === 'done' || job.stage === 'error'
    const i = this.entries.findIndex((x) => x.job.id === job.id)
    const old = i >= 0 ? this.entries[i] : null
    if (old && !toFront && sameJob(old.job, job)) return // sem mudança: não acorda ninguém
    const entry: Entry = { job, finishedAt: finished ? (old?.finishedAt ?? this.now()) : null }
    if (i >= 0 && !toFront) this.entries[i] = entry
    else {
      if (i >= 0) this.entries.splice(i, 1)
      this.entries.unshift(entry)
      this.trim()
    }
    this.prune()
    for (const cb of [...this.listeners]) {
      try {
        cb()
      } catch {
        // um ouvinte com defeito não derruba a lista
      }
    }
  }

  // passou de 20: sai o terminado mais antigo; sem terminados, o mais antigo de todos
  private trim(): void {
    while (this.entries.length > MAX_JOBS) {
      let drop = -1
      for (let i = this.entries.length - 1; i >= 0; i--) {
        if (this.entries[i].finishedAt !== null) {
          drop = i
          break
        }
      }
      this.entries.splice(drop >= 0 ? drop : this.entries.length - 1, 1)
    }
  }

  // um timer só, para o próximo vencimento (unref: não segura o processo)
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    let next = Infinity
    for (const e of this.entries) if (e.finishedAt !== null) next = Math.min(next, e.finishedAt + this.ttl)
    if (!Number.isFinite(next)) return
    this.timer = setTimeout(
      () => {
        this.timer = null
        if (this.prune()) for (const cb of [...this.listeners]) cb()
      },
      Math.min(2 ** 31 - 1, Math.max(50, next - this.now()))
    )
    this.timer.unref()
  }
}

function sameJob(a: RemoteJob, b: RemoteJob): boolean {
  return a.title === b.title && a.stage === b.stage && a.pct === b.pct && a.message === b.message && a.error === b.error
}
