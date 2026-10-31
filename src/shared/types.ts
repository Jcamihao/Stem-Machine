import type { RemoteState, RemoteStatus, RemoteCommand } from './remote'
// 'click' e 'guide' não vêm da separação: são gerados no player (batidas e seções)
export type StemId = 'vocals' | 'drums' | 'bass' | 'other' | 'piano' | 'guitar' | 'click' | 'guide'

// which GPU vendor GPU acceleration targets: NVIDIA via CUDA torch (windows
// + linux), AMD via ROCm torch (linux only)
export type GpuVendor = 'nvidia' | 'amd'

export const DEFAULT_STEMS: string[] = ['vocals', 'drums', 'bass', 'other']

// roformer_hybrid = mel-band roformer vocals + htdemucs drums/bass/other
export const MODEL_DEFAULT = 'roformer_hybrid'
export const MODEL_EXTENDED = 'htdemucs_6s'

export interface Song {
  videoId: string
  title: string
  duration: number
  addedAt: number
  model?: string
  stems?: string[]
  took?: number
  // local audio files carry their own mix; absent means a YouTube source
  source?: 'local'
}

export interface AppSettings {
  shifts: 1 | 2
  htdemucsFt: boolean
  roformerVocals: boolean
  // windows/linux: separate on the GPU instead of the CPU. The toggle is only
  // rendered when an NVIDIA GPU (cuda torch) or an AMD GPU on linux (rocm
  // torch) is detected; enabling it downloads the ~2.5GB GPU build of torch
  // on first use
  gpuSplit: boolean
  // hide the YouTube video while playing: stems are always played locally,
  // this stops streaming the video and falls back to cached thumbnails
  hideVideo: boolean
  // format used when exporting stems: wav is the lossless source format,
  // aac (.m4a) is transcoded on export via the bundled ffmpeg. mp3 isn't an
  // option — the bundled ffmpeg is a minimal static build without libmp3lame
  exportFormat: 'wav' | 'aac'
  // playback: click e guia em mono no canal L (retorno), música em mono no R (PA)
  outputSplit: boolean
  // pad contínuo (lib/pad.ts): 'synth' ou o id de um pad importado; tom 0 = C ... 11 = B
  padSource: string
  padKey: number
  padVolume: number // 0..1
  padBrightness: number // 0..1 (filtro: escuro -> aberto)
  padTransition: PadTransition
  // clique numa parte: 'bar' espera a virada do compasso (tocando), 'now' salta na hora
  sectionSwitch: 'bar' | 'now'
  // ao fim da música, abre a próxima da cena sozinho (padrão: não, no culto quem decide é você)
  sceneAutoAdvance: boolean
  // numa cena, ao passar para a próxima música o pad entra no tom dela e some quando ela der play
  padBetween: boolean
  // controle MIDI: tecla ("note:1:60", "cc:1:64") -> id da ação (shared/midi.ts)
  midiMap: Record<string, string>
  // controle pelo celular: servidor na rede local, desligado por padrão
  remoteEnabled: boolean
  remotePin: string // 6 dígitos, gerado na primeira vez que liga
}

// mixagem salva por música (mix.json): só o que difere do padrão
export interface MixState {
  vols?: Record<string, number>
  mutes?: string[]
  solos?: string[]
  pans?: Record<string, number>
  eqs?: Record<string, { low: number; mid: number; high: number }>
  master?: number
  speed?: number
  semitones?: number
  tuningHz?: number
  clickFactor?: number
}

// cena (setlist): músicas em ordem; o tom de cada uma vem da mixagem salva dela
export interface Scene {
  id: string
  name: string
  songs: string[] // videoId da biblioteca
}

export type PadTransition = 'fast' | 'slow'

// pad importado: arquivo copiado para a pasta pads, com o tom em que ele foi gravado
export interface PadSample {
  id: string
  name: string
  key: number // 0 = C ... 11 = B
  file: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  shifts: 1,
  htdemucsFt: false,
  roformerVocals: false,
  gpuSplit: false,
  hideVideo: false,
  exportFormat: 'wav',
  outputSplit: false,
  padSource: 'synth',
  padKey: 0,
  padVolume: 0.7,
  padBrightness: 0.75,
  padTransition: 'slow',
  sectionSwitch: 'bar',
  sceneAutoAdvance: false,
  padBetween: false,
  midiMap: {},
  remoteEnabled: false,
  remotePin: ''
}

export interface EngineStatus {
  vocalsDownloading: boolean
  vocalsReady: boolean
  ftDownloading: boolean
  ftVerified: boolean
  // gpu torch engine (windows/linux; cuda for nvidia, rocm for amd on linux)
  gpuDownloading: boolean
  gpuReady: boolean
}

export interface EnvStatus {
  python: { found: boolean; path?: string; version?: string }
  ffmpeg: { found: boolean; path?: string }
  ready: boolean
  bootstrapping: boolean
  updating: boolean
  gpu?: boolean
  // windows/linux only: which GPU vendor was detected (gates the GPU toggle
  // in Settings; amd is only detected on linux)
  gpuVendor?: GpuVendor
}

export interface EnvEvent {
  message: string
  level: 'info' | 'error' | 'success'
}

// click inteligente: batidas e "1" de cada compasso, em segundos (python/beats.py)
export interface BeatGrid {
  version: number
  bpm: number
  beatsPerBar: number
  beats: number[]
  downbeats: number[]
  // o usuário marcou o "1" à mão em algum ponto ("marcar o 1")
  edited?: boolean
}

// seções detectadas (python/sections.py); label: intro, verse, chorus, bridge,
// solo, inst, break, outro. `edited` marca que o usuário corrigiu à mão
export interface Section {
  start: number
  end: number
  label: string
}

export interface SectionMap {
  version: number
  sections: Section[]
  edited?: boolean
}

// acordes detectados (python/chords.py); label no formato "E:maj/3", "C#:min7"; "N" = sem acorde.
// Editado à mão: "txt:Gm7" (texto livre digitado pelo usuário)
export interface ChordSegment {
  start: number
  end: number
  label: string
}

export interface ChordMap {
  version: number
  chords: ChordSegment[]
  edited?: boolean
}

export type JobStage = 'metadata' | 'download' | 'convert' | 'separate' | 'finalize'

export interface JobProgress {
  videoId: string
  title?: string
  stage: JobStage
  pct: number
  message?: string
  model?: string
  // "adicionar stem" numa música da biblioteca: o progresso aparece no player
  resplit?: boolean
}

export interface JobDone {
  videoId: string
  song: Song
}

export interface JobFailed {
  videoId: string
  message: string
  resplit?: boolean
}

export type JobEvent =
  | { kind: 'progress'; data: JobProgress }
  | { kind: 'done'; data: JobDone }
  | { kind: 'failed'; data: JobFailed }

export interface SearchResult {
  videoId: string
  title: string
  channel?: string
  duration?: number
}

export interface UpdateEvent {
  status: 'checking' | 'available' | 'none' | 'progress' | 'downloaded' | 'error'
  version?: string
  pct?: number
}

export interface StemKitApi {
  envStatus(): Promise<EnvStatus>
  envBootstrap(): Promise<boolean>
  envUpdateYtDlp(): Promise<boolean>
  listSongs(): Promise<Song[]>
  deleteSong(videoId: string): Promise<void>
  getBuffers(videoId: string): Promise<Record<string, Uint8Array>>
  getBeats(videoId: string): Promise<BeatGrid | null>
  analyzeBeats(videoId: string): Promise<BeatGrid>
  saveBeats(videoId: string, grid: BeatGrid): Promise<void>
  saveGenerated(videoId: string, stem: 'click' | 'guide', wav: Uint8Array): Promise<void>
  getGuideClips(): Promise<Record<string, Uint8Array>>
  // nota do pad (0 = C ... 11 = B) para a música: tom dos acordes + transposição salva; null = sem acordes
  songPadKey(videoId: string): Promise<number | null>
  remoteStatus(): Promise<RemoteStatus>
  remoteSetEnabled(on: boolean): Promise<RemoteStatus>
  remoteNewPin(): Promise<RemoteStatus>
  publishRemoteState(state: RemoteState): void // o app avisa o servidor do que mostrar no celular
  onRemoteCommand(cb: (command: RemoteCommand) => void): () => void
  onRemoteStatus(cb: (status: RemoteStatus) => void): () => void
  listScenes(): Promise<Scene[]>
  saveScenes(scenes: Scene[]): Promise<Scene[]>
  getMix(videoId: string): Promise<MixState | null>
  saveMix(videoId: string, mix: MixState | null): Promise<void>
  listPads(): Promise<PadSample[]>
  importPad(): Promise<PadSample | null>
  updatePad(id: string, patch: { key?: number }): Promise<PadSample[]>
  removePad(id: string): Promise<PadSample[]>
  readPad(id: string): Promise<Uint8Array>
  addStems(videoId: string, stems: string[]): Promise<void>
  getSections(videoId: string): Promise<SectionMap | null>
  // key = tom original; keyShift = já com a transposição salva na mixagem da música
  libraryMeta(): Promise<Record<string, { bpm: number | null; key: string | null; keyShift: string | null }>>
  getChords(videoId: string): Promise<ChordMap | null>
  analyzeChords(videoId: string): Promise<ChordMap>
  saveChords(videoId: string, map: ChordMap): Promise<void>
  analyzeSections(videoId: string): Promise<SectionMap>
  saveSections(videoId: string, map: SectionMap): Promise<void>
  exportStem(videoId: string, stem: string): Promise<{ saved: boolean; path?: string }>
  exportAllStems(videoId: string): Promise<{ saved: boolean; path?: string; count?: number }>
  searchYouTube(query: string): Promise<SearchResult[]>
  startJob(url: string, model?: string, stems?: string[]): Promise<{ started: boolean }>
  pickAudioFile(): Promise<string | null>
  startLocalJob(filePath: string, model?: string, stems?: string[]): Promise<{ started: boolean }>
  cancelJob(videoId?: string): Promise<void>
  openExternal(url: string): Promise<void>
  getAppVersion(): Promise<string>
  checkForUpdates(): Promise<{ ok: boolean }>
  installUpdate(): void
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getThumb(videoId: string): Promise<string | null>
  onThumbCached(cb: (videoId: string) => void): () => void
  enginesStatus(): Promise<EngineStatus>
  fetchEngine(which: 'vocals' | 'ft' | 'gpu'): Promise<void>
  onUpdateEvent(cb: (ev: UpdateEvent) => void): () => void
  onShowAbout(cb: () => void): () => void
  onJobEvent(cb: (ev: JobEvent) => void): () => void
  onEnvEvent(cb: (ev: EnvEvent) => void): () => void
  onSettingsChange(cb: (settings: AppSettings) => void): () => void
}
