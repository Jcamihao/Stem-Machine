// controle MIDI: escuta os controladores (Web MIDI do Chromium) e traduz cada tecla
// aprendida em um comando do canal único (lib/commands). O mapa fica nas configurações
import { useSyncExternalStore } from 'react'
import type { AppSettings } from '../../../shared/types'
import { bindingKey, cleanMidiMap, describeBinding, parseMidi, type MidiMessage } from '../../../shared/midi'
import { runCommand, type Command } from './commands'

export interface MidiState {
  supported: boolean
  inputs: string[] // nomes dos controladores conectados
  map: Record<string, string> // tecla -> id da ação
  learning: string | null // id da ação esperando uma tecla
  last: string | null // última mensagem recebida (para conferir o controlador)
  error: string | null
}

// id da ação -> comando. null = id desconhecido
export function actionToCommand(id: string): Command | null {
  if (id === 'toggle' || id === 'click' || id === 'loop' || id === 'nextSong' || id === 'prevSong') return { type: id }
  let m = /^section:(\d+)$/.exec(id)
  if (m) return { type: 'goToSection', index: Number(m[1]) - 1 }
  m = /^next:(\w+)$/.exec(id)
  if (m) return { type: 'goToNext', label: m[1] }
  m = /^semitones:([+-]1)$/.exec(id)
  if (m) return { type: 'semitones', delta: Number(m[1]) }
  m = /^bpm:([+-]1)$/.exec(id)
  if (m) return { type: 'bpm', delta: Number(m[1]) }
  if (id === 'pad:toggle') return { type: 'pad' }
  m = /^pad:(\d+)$/.exec(id)
  if (m && Number(m[1]) < 12) return { type: 'pad', key: Number(m[1]) }
  return null
}

class MidiEngine {
  private state: MidiState = { supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess, inputs: [], map: {}, learning: null, last: null, error: null }
  private listeners = new Set<() => void>()
  private ccLast = new Map<string, number>() // controlador contínuo: só conta ao cruzar 64 para cima
  private attached: MIDIInput[] = []
  private access: MIDIAccess | null = null

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getState = (): MidiState => this.state

  private set(patch: Partial<MidiState>): void {
    this.state = { ...this.state, ...patch }
    for (const cb of this.listeners) cb()
  }

  // mapa vindo das configurações (só quando mudou)
  applySettings(settings: AppSettings): void {
    const map = cleanMidiMap(settings.midiMap)
    if (JSON.stringify(map) !== JSON.stringify(this.state.map)) this.set({ map })
  }

  // (re)liga nos controladores; chamado na abertura e no botão "Reconectar"
  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      this.set({ supported: false })
      return
    }
    try {
      const access = await navigator.requestMIDIAccess()
      this.access = access
      access.onstatechange = () => this.attach()
      this.set({ supported: true, error: null })
      this.attach()
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  private attach(): void {
    for (const input of this.attached) input.onmidimessage = null
    this.attached = this.access ? [...this.access.inputs.values()] : []
    for (const input of this.attached) input.onmidimessage = (ev) => this.handle(ev.data)
    this.set({ inputs: this.attached.map((i) => i.name ?? 'Controlador') })
  }

  // uma mensagem recebida: aprende a tecla ou executa a ação ligada a ela
  handle(data: ArrayLike<number> | null | undefined): void {
    const msg = data ? parseMidi(data) : null
    if (!msg) return
    const key = bindingKey(msg)
    this.set({ last: `${describeBinding(key)}, valor ${msg.value}` })
    if (!this.triggers(key, msg)) return
    const learning = this.state.learning
    if (learning) {
      this.bind(key, learning)
      return
    }
    const action = this.state.map[key]
    const command = action ? actionToCommand(action) : null
    if (command) runCommand(command)
  }

  // nota sempre conta; controlador contínuo (botão giratório) só ao subir de 64, para um botão não disparar cem vezes
  private triggers(key: string, msg: MidiMessage): boolean {
    if (msg.kind === 'note') return true
    const before = this.ccLast.get(key) ?? 0
    this.ccLast.set(key, msg.value)
    return before < 64 && msg.value >= 64
  }

  learn(actionId: string | null): void {
    this.set({ learning: actionId })
  }

  // liga a tecla à ação (uma tecla serve para uma ação só) e guarda nas configurações
  bind(key: string, actionId: string): void {
    const map = { ...this.state.map, [key]: actionId }
    this.set({ map, learning: null })
    this.persist(map)
  }

  unbind(key: string): void {
    const { [key]: _drop, ...map } = this.state.map
    this.set({ map })
    this.persist(map)
  }

  private persist(map: Record<string, string>): void {
    void window.stemkit.setSettings({ midiMap: map })
  }
}

export const midi = new MidiEngine()

export function useMidi(): MidiState {
  return useSyncExternalStore(midi.subscribe, midi.getState)
}
