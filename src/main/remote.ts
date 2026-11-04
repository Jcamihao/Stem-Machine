// cola do controle pelo celular com o Electron: IPC, PIN, endereços da rede local.
// Contrato: .superpowers/sdd/remote/contrato.md
import { app, ipcMain, type BrowserWindow } from 'electron'
import { randomInt } from 'crypto'
import { join } from 'path'
import { networkInterfaces, type NetworkInterfaceInfo } from 'os'
import pageHtml from './remote/page.html?raw' // página do celular, embutida no build como texto
import { loadSettings, saveSettings } from './settings'
import { AUDIO_EXTENSIONS, loadSongs } from './library'
import { cancelJob, onJobEvent, startJob, startLocalJob } from './pipeline'
import { loadScenes } from './scenes'
import { RemoteServer, pruneUploads, removeUploadFolder } from './remoteServer'
import { RemoteJobs } from './remoteJobs'
import { localSongId } from '../shared/local'
import { parseVideoId } from '../shared/url'
import { PIN_RE, REMOTE_PORT, REMOTE_STEM_IDS, type RemoteLibrary, type RemoteState, type RemoteStatus } from '../shared/remote'

export const REMOTE_PAGE: string = pageHtml

const MAX_STR = 300
const MAX_SECTIONS = 200

// 6 dígitos com zeros à esquerda; randomInt é criptograficamente seguro (Math.random não serve para PIN)
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// ordem de preferência para o QR: Wi-Fi/roteador doméstico (192.168) primeiro, depois 10.x, 172.16-31
function rank(ip: string): number {
  if (ip.startsWith('192.168.')) return 0
  if (ip.startsWith('10.')) return 1
  const m = /^172\.(\d+)\./.exec(ip)
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2
  return 3
}

// http://<ip>:<porta> de cada IPv4 externo; 169.254.x.x (sem DHCP) não serve para o celular
export function lanUrls(port: number, ifaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const ips: string[] = []
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      const v4 = i.family === 'IPv4' || (i.family as unknown) === 4
      if (v4 && !i.internal && !i.address.startsWith('169.254.')) ips.push(i.address)
    }
  }
  return [...new Set(ips)].sort((a, b) => rank(a) - rank(b)).map((ip) => `http://${ip}:${port}`)
}

const str = (v: unknown): string => (typeof v === 'string' ? v.slice(0, MAX_STR) : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const int = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isInteger(v) ? v : fallback)

// o renderer é de confiança, mas o que vai para a rede é remontado campo a campo: formato fixo, strings curtas
export function cleanState(raw: unknown): RemoteState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, any>
  const song = r.song && typeof r.song === 'object' ? { id: str(r.song.id), title: str(r.song.title) } : null
  const sections = (Array.isArray(r.sections) ? r.sections.slice(0, MAX_SECTIONS) : [])
    .filter((s: unknown) => s && typeof s === 'object')
    .map((s: Record<string, unknown>) => ({ label: str(s.label), name: str(s.name), start: num(s.start), end: num(s.end) }))
  const sc = r.scene && typeof r.scene === 'object' ? r.scene : null
  const pad = r.pad && typeof r.pad === 'object' ? r.pad : {}
  const key = int(pad.key, 0)
  const stems = (Array.isArray(r.stems) ? r.stems.slice(0, 12) : [])
    .filter((s: unknown) => s && typeof s === 'object')
    .map((s: Record<string, unknown>) => {
      const max = s.max === 2 ? 2 : 1
      return { id: str(s.id), label: str(s.label), volume: Math.min(max, Math.max(0, num(s.volume))), max, muted: s.muted === true, soloed: s.soloed === true }
    })
    .filter((s: { id: string }) => REMOTE_STEM_IDS.includes(s.id))
  return {
    song,
    playing: r.playing === true,
    loading: r.loading === true,
    position: num(r.position),
    duration: num(r.duration),
    bpm: typeof r.bpm === 'number' && Number.isFinite(r.bpm) ? r.bpm : null,
    keyLabel: typeof r.keyLabel === 'string' ? r.keyLabel.slice(0, MAX_STR) : null,
    semitones: int(r.semitones, 0),
    sections,
    currentSection: int(r.currentSection, -1),
    pendingSection: typeof r.pendingSection === 'number' && Number.isInteger(r.pendingSection) ? r.pendingSection : null,
    clickOn: r.clickOn === true,
    loopOn: r.loopOn === true,
    stems,
    pad: { playing: pad.playing === true, key: key >= 0 && key <= 11 ? key : 0, volume: typeof pad.volume === 'number' && Number.isFinite(pad.volume) ? Math.min(1, Math.max(0, pad.volume)) : 0.7 },
    scene: sc
      ? {
          id: str(sc.id),
          name: str(sc.name),
          index: int(sc.index, 0),
          total: int(sc.total, 0),
          hasPrev: sc.hasPrev === true,
          hasNext: sc.hasNext === true
        }
      : null
  }
}

// biblioteca para o celular: título cai para o id; cena só lista músicas que existem
export function buildLibrary(
  songs: { videoId: string; title: string }[],
  scenes: { id: string; name: string; songs: string[] }[]
): RemoteLibrary {
  const titles = new Map(songs.map((s) => [s.videoId, s.title || s.videoId]))
  return {
    songs: songs.map((s) => ({ id: s.videoId, title: s.title || s.videoId })),
    scenes: scenes.map((sc) => ({
      id: sc.id,
      name: sc.name,
      songs: sc.songs.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id)! }))
    }))
  }
}

export function initRemote(getWindow: () => BrowserWindow | null): void {
  if (REMOTE_PAGE.length === 0) throw new Error('página do celular vazia')

  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  let pin = ''
  const getPin = (): string => {
    if (!pin) {
      const saved = loadSettings().remotePin
      pin = PIN_RE.test(saved) ? saved : generatePin()
      if (pin !== saved) saveSettings({ remotePin: pin })
    }
    return pin
  }

  let error: string | null = null
  // todos os jobs do pipeline (inclusive os iniciados no PC) alimentam a lista que o celular vê
  const jobs = new RemoteJobs()
  onJobEvent((ev) => jobs.handle(ev))
  const uploadsDir = join(app.getPath('userData'), 'uploads')
  const server = new RemoteServer({
    page: REMOTE_PAGE,
    getPin,
    getLibrary: () => buildLibrary(loadSongs(), loadScenes()),
    onCommand: (cmd) => send('remote:command', cmd),
    onClients: () => send('remote:status', status()),
    jobs,
    uploadsDir,
    audioExts: AUDIO_EXTENSIONS,
    hasSong: (id) => loadSongs().some((s) => s.videoId === id),
    startLink: (url) => {
      const id = parseVideoId(url)
      // startJob só resolve quando o job inteiro termina; o resultado chega pelos eventos
      void startJob(url)
        .catch(() => undefined)
        .finally(() => {
          if (id) jobs.failIfQueued(id, 'Não foi possível iniciar')
        })
    },
    startUpload: (file) => {
      const id = localSongId(file)
      void startLocalJob(file)
        .catch(() => undefined)
        .finally(() => {
          jobs.failIfQueued(id, 'Não foi possível ler o arquivo')
          // a cópia temporária só serve até o pipeline converter; depois a biblioteca tem os próprios arquivos
          void removeUploadFolder(uploadsDir, file)
        })
    },
    cancelJob: (id) => cancelJob(id)
  })

  function status(): RemoteStatus {
    const port = server.port()
    return {
      enabled: loadSettings().remoteEnabled,
      running: port !== null,
      port: port ?? REMOTE_PORT,
      urls: port !== null ? lanUrls(port) : [],
      pin: getPin(),
      clients: server.clients(),
      error
    }
  }

  async function start(): Promise<void> {
    if (server.port() !== null) return
    try {
      await server.start(REMOTE_PORT)
      error = null
      void pruneUploads(uploadsDir, 24 * 3600_000) // sobras de envios de uma queda anterior
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      error = code === 'EADDRINUSE' ? `Porta ${REMOTE_PORT} em uso` : `Não foi possível iniciar: ${(e as Error).message}`
    }
  }

  // liga/desliga e novo PIN em fila: dois cliques rápidos não disputam a mesma porta
  let queue: Promise<unknown> = Promise.resolve()
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job)
    queue = run.catch(() => undefined)
    return run
  }

  ipcMain.handle('remote:status', () => status())

  ipcMain.handle('remote:set-enabled', (_e, on: unknown) =>
    enqueue(async () => {
      const enabled = on === true
      saveSettings({ remoteEnabled: enabled })
      if (enabled) await start()
      else {
        await server.stop()
        error = null
      }
      return status()
    })
  )

  ipcMain.handle('remote:new-pin', () =>
    enqueue(async () => {
      pin = generatePin()
      saveSettings({ remotePin: pin })
      server.invalidateTokens() // celulares logados com o PIN velho caem
      return status()
    })
  )

  ipcMain.on('remote:state', (_e, raw: unknown) => {
    const state = cleanState(raw)
    if (state) server.setState(state)
  })

  app.on('before-quit', () => {
    void server.stop()
  })

  if (loadSettings().remoteEnabled) {
    void enqueue(start).then(() => send('remote:status', status()))
  }
}
