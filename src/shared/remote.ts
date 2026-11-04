// controle pelo celular: tipos e validação compartilhados entre o servidor (main),
// a página do celular e o app (renderer). Contrato completo em .superpowers/sdd/remote/contrato.md

import { parseVideoId } from './url'

export const REMOTE_PORT = 8787
// arquivo enviado pelo celular: limite de tamanho (o PC grava num temporário e separa)
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

export interface RemoteSection {
  label: string // chave: 'verse', 'chorus'... (SECTION_NAMES em shared/midi.ts)
  name: string // nome em português: "Verso", "Refrão"
  start: number // segundos
  end: number
}

// o que o app mostra ao celular; o app (renderer) publica, o servidor guarda o último e repassa
export interface RemoteState {
  song: { id: string; title: string } | null // null = nenhuma música aberta (biblioteca)
  playing: boolean
  loading?: boolean // as faixas ainda estão carregando: o play fica na fila até ficar pronto
  position: number // segundos
  duration: number
  bpm: number | null // já com a velocidade
  keyLabel: string | null // tom já transposto, ex. "Gm"
  semitones: number
  sections: RemoteSection[]
  currentSection: number // índice em sections, -1 = nenhuma
  pendingSection: number | null // parte escolhida esperando a virada do compasso
  clickOn: boolean
  loopOn: boolean
  pad: { playing: boolean; key: number; volume: number; pan: number } // pan: -1 L ... 1 R
  // fora de uma música, o metrônomo avulso usa o último BPM conhecido (120 inicial)
  metronome: { playing: boolean; bpm: number; pan: number }
  outputSplit: boolean // click/guia no L, música no R
  scene: { id: string; name: string; index: number; total: number; hasPrev: boolean; hasNext: boolean } | null
}

export interface RemoteLibrary {
  songs: { id: string; title: string }[]
  scenes: { id: string; name: string; songs: { id: string; title: string }[] }[]
}

// comandos que o celular pode mandar (subconjunto de lib/commands do renderer)
export type RemoteCommand =
  | { type: 'toggle' | 'play' | 'pause' | 'click' | 'metronomeToggle' | 'loop' | 'nextSong' | 'prevSong' }
  | { type: 'goToSection'; index: number }
  | { type: 'semitones' | 'bpm'; delta: -1 | 1 }
  | { type: 'pad'; key?: number } // sem key: liga/desliga; com key (0..11): toca nessa nota
  | { type: 'padVolume'; value: number } // volume do pad, 0..1
  | { type: 'padPan'; value: number }
  | { type: 'metronomeBpm'; value: number }
  | { type: 'metronomeTap' }
  | { type: 'metronomePan'; value: number }
  | { type: 'outputSplit' }
  | { type: 'openSong'; id: string }
  | { type: 'openScene'; id: string }

const SIMPLE = new Set(['toggle', 'play', 'pause', 'click', 'metronomeToggle', 'loop', 'nextSong', 'prevSong', 'outputSplit', 'metronomeTap'])
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200

// valida o JSON vindo da rede: só o que o contrato permite, campos extras são descartados
export function parseRemoteCommand(raw: unknown): RemoteCommand | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const type = r.type
  if (typeof type !== 'string') return null
  if (SIMPLE.has(type)) return { type } as RemoteCommand
  if (type === 'goToSection') return isInt(r.index, 0, 999) ? { type, index: r.index } : null
  if (type === 'semitones' || type === 'bpm') return r.delta === 1 || r.delta === -1 ? { type, delta: r.delta } : null
  if (type === 'pad') {
    if (r.key === undefined) return { type }
    return isInt(r.key, 0, 11) ? { type, key: r.key } : null
  }
  if (type === 'padVolume') {
    return typeof r.value === 'number' && Number.isFinite(r.value) ? { type, value: Math.round(Math.min(1, Math.max(0, r.value)) * 100) / 100 } : null
  }
  if (type === 'padPan' || type === 'metronomePan') {
    return typeof r.value === 'number' && Number.isFinite(r.value) ? { type, value: Math.round(Math.min(1, Math.max(-1, r.value)) * 100) / 100 } : null
  }
  if (type === 'metronomeBpm') return isInt(r.value, 30, 300) ? { type, value: r.value } : null
  if (type === 'openSong' || type === 'openScene') return isId(r.id) ? { type, id: r.id } : null
  return null
}

// PIN de 6 dígitos
export const PIN_RE = /^\d{6}$/

// estado do servidor mostrado no painel "Celular"
export interface RemoteStatus {
  enabled: boolean
  running: boolean
  port: number
  urls: string[] // endereços na rede local, ex. "http://192.168.0.10:8787"
  pin: string
  clients: number // celulares conectados agora
  error: string | null // ex. porta em uso
}

// ---------- adicionar músicas pelo celular ----------

// uma música sendo adicionada (por link ou arquivo), como o celular vê
export type RemoteJobStage = 'queued' | 'metadata' | 'download' | 'convert' | 'separate' | 'finalize' | 'done' | 'error'

export interface RemoteJob {
  id: string // videoId da biblioteca ('local-xxxxxxxx' para arquivo)
  title: string
  stage: RemoteJobStage
  pct: number // 0..100 da etapa atual
  message?: string // texto curto do pipeline (ex.: "Downloading")
  error?: string // só em stage 'error'
}

// pedido de POST /api/add-link: só links do YouTube; devolve o videoId ou null
export function parseAddLink(raw: unknown): { url: string; id: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const url = (raw as Record<string, unknown>).url
  if (typeof url !== 'string' || url.length === 0 || url.length > 300) return null
  const id = parseVideoId(url)
  return id ? { url: url.trim(), id } : null
}

// nome de arquivo vindo da rede -> nome seguro para gravar em disco (sem pasta, sem caracteres de
// controle, extensão numa lista permitida). null = recusar
export function safeUploadName(raw: string, allowedExts: string[]): string | null {
  let name = raw
  try {
    name = decodeURIComponent(raw)
  } catch {
    return null
  }
  name = name.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f<>:"|?*]/g, '').replace(/^\.+/, '').trim()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  const ext = name.slice(dot + 1).toLowerCase()
  if (!allowedExts.includes(ext)) return null
  const stem = name.slice(0, dot).trim().slice(0, 100)
  return stem ? `${stem}.${ext}` : null
}
