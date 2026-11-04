// controle pelo celular, lado do app: junta o estado do player e do App e publica ao servidor
// (main), e repassa os comandos que chegam do celular ao canal único (lib/commands)
import type { RemoteSection, RemoteState } from '../../../shared/remote'
import { runCommand } from './commands'

export interface RemotePlayer {
  song: { id: string; title: string }
  playing: boolean
  loading: boolean
  position: number
  duration: number
  bpm: number | null
  keyLabel: string | null
  semitones: number
  sections: RemoteSection[]
  pendingSection: number | null
  clickOn: boolean
  loopOn: boolean
}

export interface RemoteApp {
  pad: RemoteState['pad']
  metronome: RemoteState['metronome']
  outputSplit: boolean
  scene: RemoteState['scene']
}

// posição muda o tempo todo: no máximo 4 envios por segundo só por ela
const POSITION_MS = 250

let player: RemotePlayer | null = null
let app: RemoteApp = {
  pad: { playing: false, key: 0, volume: 0.7, pan: 0 },
  metronome: { playing: false, bpm: 120, pan: 0 },
  outputSplit: false,
  scene: null
}
let lastFull = ''
let lastDiscrete = ''
let lastAt = -Infinity
let queued = false
let timer: ReturnType<typeof setTimeout> | null = null

// parte atual pela posição (a posição vem do relógio do áudio, não do React)
function currentSection(sections: RemoteSection[], position: number): number {
  return sections.findIndex((s) => position >= s.start && position < s.end)
}

function compose(): RemoteState {
  if (!player) {
    return {
      song: null,
      playing: false,
      loading: false,
      position: 0,
      duration: 0,
      bpm: null,
      keyLabel: null,
      semitones: 0,
      sections: [],
      currentSection: -1,
      pendingSection: null,
      clickOn: app.metronome.playing,
      loopOn: false,
      ...app
    }
  }
  const p = player
  return {
    song: p.song,
    playing: p.playing,
    loading: p.loading,
    position: Math.round(p.position * 10) / 10,
    duration: p.duration,
    bpm: p.bpm,
    keyLabel: p.keyLabel,
    semitones: p.semitones,
    sections: p.sections,
    currentSection: currentSection(p.sections, p.position),
    pendingSection: p.pendingSection,
    clickOn: p.clickOn,
    loopOn: p.loopOn,
    ...app
  }
}

function send(state: RemoteState): void {
  if (typeof window !== 'undefined' && window.stemkit) window.stemkit.publishRemoteState(state)
}

function flush(): void {
  queued = false
  const state = compose()
  const full = JSON.stringify(state)
  if (full === lastFull) return // nada mudou: não publica
  const discrete = JSON.stringify({ ...state, position: 0 })
  const wait = POSITION_MS - (Date.now() - lastAt)
  if (discrete === lastDiscrete && wait > 0) {
    // só a posição andou e o último envio foi há pouco: espera, e manda o valor mais novo
    if (!timer) {
      timer = setTimeout(() => {
        timer = null
        flush()
      }, wait)
    }
    return
  }
  lastFull = full
  lastDiscrete = discrete
  lastAt = Date.now()
  send(state)
}

// vários setters no mesmo ciclo (ex.: trocar de música) viram um envio só
function schedule(): void {
  if (queued) return
  queued = true
  queueMicrotask(flush)
}

// null = o player foi fechado (nenhuma música aberta)
export function setPlayer(next: RemotePlayer | null): void {
  player = next
  schedule()
}

// intervalo de 250 ms do player enquanto toca
export function setPosition(position: number): void {
  if (!player || player.position === position) return
  player = { ...player, position }
  schedule()
}

export function setApp(patch: Partial<RemoteApp>): void {
  app = { ...app, ...patch }
  schedule()
}

// quando o servidor liga, ele ainda não conhece o estado: manda de novo mesmo sem mudança
function republish(): void {
  lastFull = ''
  lastDiscrete = ''
  schedule()
}

// chamado uma vez no App
export function startRemote(): () => void {
  const offCommand = window.stemkit.onRemoteCommand((command) => {
    runCommand(command)
  })
  let running = false
  const offStatus = window.stemkit.onRemoteStatus((status) => {
    if (status.running && !running) republish()
    running = status.running
  })
  void window.stemkit.remoteStatus().then((status) => {
    if (status.running && !running) republish()
    running = status.running
  })
  return () => {
    offCommand()
    offStatus()
  }
}
