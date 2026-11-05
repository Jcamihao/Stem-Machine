// pad contínuo: toca independente do player (contexto de áudio próprio), então
// segue tocando ao pausar, trocar de música ou voltar para a biblioteca.
// Duas fontes: o pad sintetizado (tônica + quinta + oitavas, sem terça: serve para
// tom maior e menor) e pads importados, transpostos por velocidade de leitura
// (muda o tom; no máximo meio tom de oitava para cima ou para baixo).
// Troca de tom/fonte = crossfade de potência constante entre duas vozes.
import { useSyncExternalStore } from 'react'
import type { AppSettings, PadSample, PadTransition } from '../../../shared/types'
import { sideGains, type OutputSide } from '../../../shared/remote'
import { keyFromAudio, keyFromName } from './padKey'
import { registerCommandHandler } from './commands'

export const PAD_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const TRANSITION_SECONDS: Record<PadTransition, number> = { fast: 0.5, slow: 2 }
const START_FADE = 2.5
const STOP_FADE = 3
// volume médio (RMS) que as duas fontes miram: trocar sintetizado <-> importado
// não muda o volume, e o controle de volume vale igual para os dois
const TARGET_RMS = 0.12
const SYNTH_MAKEUP = 8 // medido: o sintetizado sai com RMS ~0,015 antes deste ganho

const mod12 = (n: number): number => ((n % 12) + 12) % 12

export interface PadState {
  playing: boolean
  key: number
  source: string // 'synth' ou id do pad importado
  volume: number
  pan: number // -1 L, 0 centro, 1 R; ignorado na saída L/R (vale o lado)
  side: OutputSide // lado na saída L/R
  brightness: number
  transition: PadTransition
  samples: PadSample[]
  loading: boolean
  error: string | null
  songKey: number | null // tom da música aberta no player (só destaque visual)
  // resultado da detecção do tom no último import (o painel mostra "Detectado: D")
  detected: { id: string; key: number | null; how: 'name' | 'audio' | null } | null
}

interface Voice {
  out: GainNode
  stop(at: number): void
  fullAt?: number // quando o fade de entrada termina
}

// curvas de potência constante: na metade do crossfade cada voz está em ~0,707
const CURVE_N = 64
const FADE_IN = Float32Array.from({ length: CURVE_N }, (_, i) => Math.sin(((i / (CURVE_N - 1)) * Math.PI) / 2))
const FADE_OUT = Float32Array.from({ length: CURVE_N }, (_, i) => Math.cos(((i / (CURVE_N - 1)) * Math.PI) / 2))

// semitons para levar o arquivo (gravado em `base`) até `key`, pelo caminho mais curto
export function sampleShift(base: number, key: number): number {
  const d = mod12(key - base)
  return d > 6 ? d - 12 : d
}

// filtro do brilho: 0 = 250 Hz (bem escuro) ... 1 = 18 kHz (som original)
export function brightnessHz(b: number): number {
  return 250 * Math.pow(72, Math.min(1, Math.max(0, b)))
}

// trecho do arquivo que entra no loop: sem o fade de entrada/saída da gravação
// (onde o volume fica abaixo da metade do volume típico)
export function loopRegion(buf: AudioBuffer): { start: number; end: number } {
  const win = Math.max(1, Math.round(buf.sampleRate * 0.1))
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const rms: number[] = []
  for (let i = 0; i + win <= buf.length; i += win) {
    let sum = 0
    for (const ch of chans) for (let j = i; j < i + win; j++) sum += ch[j] * ch[j]
    rms.push(Math.sqrt(sum / (win * chans.length)))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const limit = (sorted[Math.floor(sorted.length / 2)] ?? 0) * 0.5
  const first = rms.findIndex((r) => r >= limit)
  let last = rms.length - 1
  while (last > 0 && rms[last] < limit) last--
  if (first < 0 || last <= first) return { start: 0, end: buf.duration }
  return { start: (first * win) / buf.sampleRate, end: Math.min(buf.duration, ((last + 1) * win) / buf.sampleRate) }
}

// ganho que leva o trecho do loop ao volume alvo, sem passar de 0,95 de pico
export function normalizeGain(buf: AudioBuffer, region: { start: number; end: number }): number {
  const a = Math.floor(region.start * buf.sampleRate)
  const b = Math.min(buf.length, Math.floor(region.end * buf.sampleRate))
  let sum = 0
  let peak = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = a; i < b; i++) {
      sum += d[i] * d[i]
      peak = Math.max(peak, Math.abs(d[i]))
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, (b - a) * buf.numberOfChannels))
  if (rms < 1e-5) return 1
  return Math.min(TARGET_RMS / rms, 0.95 / peak, 8)
}

// resposta ao impulso de um reverb longo (ruído estéreo com decaimento exponencial)
function reverbImpulse(ctx: BaseAudioContext, seconds = 5): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5)
  }
  return ir
}

// pad sintetizado no tom `key`: cada nota com 3 serras levemente desafinadas
// abertas no estéreo, um filtro que "respira" devagar e o reverb longo
export function synthVoice(ctx: BaseAudioContext, dest: AudioNode, key: number, at: number): Voice {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(dest)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2200
  filter.Q.value = 0.4
  filter.connect(out)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 700
  lfo.connect(lfoDepth)
  lfoDepth.connect(filter.frequency)
  // tônica entre F#2 e F3: grave o bastante para encorpar, sem embolar
  const rootMidi = 42 + mod12(key - 6)
  const notes: [number, number][] = [
    [-12, 0.35],
    [0, 1],
    [7, 0.7],
    [12, 0.6],
    [19, 0.25],
    [24, 0.15]
  ]
  const oscs: OscillatorNode[] = [lfo]
  for (const [offset, level] of notes) {
    const freq = 440 * Math.pow(2, (rootMidi + offset - 69) / 12)
    ;[-7, 0, 7].forEach((cents, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      osc.detune.value = cents
      const g = ctx.createGain()
      g.gain.value = level * 0.045
      const pan = ctx.createStereoPanner()
      pan.pan.value = (i - 1) * 0.6
      osc.connect(g)
      g.connect(pan)
      pan.connect(filter)
      oscs.push(osc)
    })
  }
  for (const o of oscs) o.start(at)
  return {
    out,
    stop: (when) => {
      for (const o of oscs) o.stop(when)
      setTimeout(() => out.disconnect(), Math.max(0, (when - ctx.currentTime) * 1000) + 200)
    }
  }
}

// pad importado: o trecho útil do arquivo em loop, cada volta se fundindo na
// próxima (sem emenda audível mesmo que o arquivo não tenha sido feito para loop)
function sampleVoice(ctx: AudioContext, dest: AudioNode, sample: LoadedSample, shift: number, at: number): Voice {
  const out = ctx.createGain()
  out.gain.value = 0
  const level = ctx.createGain()
  level.gain.value = sample.gain
  out.connect(level)
  level.connect(dest)
  const { buf, region } = sample
  const rate = Math.pow(2, shift / 12)
  const seg = (region.end - region.start) / rate // duração real de uma volta
  const xf = Math.min(3, seg / 4)
  const sources = new Set<AudioBufferSourceNode>()
  let next = at
  let first = true
  const scheduleOne = (): void => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    src.connect(g)
    g.connect(out)
    const t = next
    if (!first) g.gain.setValueCurveAtTime(FADE_IN, t, xf)
    g.gain.setValueCurveAtTime(FADE_OUT, t + seg - xf, xf)
    src.start(t, region.start)
    src.stop(t + seg)
    src.onended = () => {
      g.disconnect()
      sources.delete(src)
    }
    sources.add(src)
    next = t + seg - xf
    first = false
  }
  scheduleOne()
  const timer = setInterval(() => {
    while (next - ctx.currentTime < 3) scheduleOne()
  }, 500)
  return {
    out,
    stop: (when) => {
      clearInterval(timer)
      for (const s of sources) s.stop(when)
      setTimeout(() => level.disconnect(), Math.max(0, (when - ctx.currentTime) * 1000) + 200)
    }
  }
}

interface LoadedSample {
  buf: AudioBuffer
  region: { start: number; end: number }
  gain: number
}

class PadEngine {
  private state: PadState = {
    playing: false,
    key: 0,
    source: 'synth',
    volume: 0.7,
    pan: 0,
    side: 'right',
    brightness: 0.75,
    transition: 'slow',
    samples: [],
    loading: false,
    error: null,
    songKey: null,
    detected: null
  }
  private listeners = new Set<() => void>()
  private ctx: AudioContext | null = null
  private synthBus: GainNode | null = null
  private sampleBus: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private volume: GainNode | null = null
  private panner: StereoPannerNode | null = null
  private normalOut: GainNode | null = null
  private splitOut: GainNode | null = null
  private leftGain: GainNode | null = null
  private rightGain: GainNode | null = null
  private split = false
  private voice: Voice | null = null
  private buffers = new Map<string, LoadedSample>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private initialized = false

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getState = (): PadState => this.state

  private set(patch: Partial<PadState>, persist = false): void {
    this.state = { ...this.state, ...patch }
    for (const cb of this.listeners) cb()
    if (persist) this.persist()
  }

  // grava as preferências (nunca o "tocando": o pad sempre abre desligado)
  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      const s = this.state
      void window.stemkit.setSettings({
        padSource: s.source,
        padKey: s.key,
        padVolume: s.volume,
        padPan: s.pan,
        padSide: s.side,
        padBrightness: s.brightness,
        padTransition: s.transition
      })
    }, 400)
  }

  // chamado quando as configurações chegam: preferências só na primeira vez
  applySettings(settings: AppSettings): void {
    this.split = settings.outputSplit
    this.applyOutputMode()
    if (this.initialized) return
    this.initialized = true
    this.set({
      key: settings.padKey,
      source: settings.padSource,
      volume: settings.padVolume,
      pan: settings.padPan,
      side: settings.padSide,
      brightness: settings.padBrightness,
      transition: settings.padTransition
    })
    void window.stemkit.listPads().then((samples) => {
      const source = samples.some((p) => p.id === this.state.source) ? this.state.source : 'synth'
      this.set({ samples, source })
    })
  }

  private ensureCtx(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    this.ctx = ctx
    this.synthBus = ctx.createGain()
    this.synthBus.gain.value = SYNTH_MAKEUP
    this.sampleBus = ctx.createGain()
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = 0.5
    this.filter.frequency.value = brightnessHz(this.state.brightness)
    this.volume = ctx.createGain()
    this.volume.gain.value = this.state.volume
    this.panner = ctx.createStereoPanner()
    this.panner.pan.value = this.state.pan
    // o sintetizado passa pelo reverb (seco + molhado); o importado já vem pronto
    const reverb = ctx.createConvolver()
    reverb.buffer = reverbImpulse(ctx)
    const dry = ctx.createGain()
    dry.gain.value = 0.55
    const wet = ctx.createGain()
    wet.gain.value = 0.6
    this.synthBus.connect(dry)
    this.synthBus.connect(reverb)
    reverb.connect(wet)
    dry.connect(this.filter)
    wet.connect(this.filter)
    this.sampleBus.connect(this.filter)
    this.filter.connect(this.volume)
    // saída normal em estéreo; no modo L/R o pad vai em mono para o R, com a música
    this.normalOut = ctx.createGain()
    this.splitOut = ctx.createGain()
    this.volume.connect(this.panner)
    this.panner.connect(this.normalOut)
    const mono = ctx.createGain()
    mono.channelCount = 1
    mono.channelCountMode = 'explicit'
    mono.channelInterpretation = 'speakers'
    this.volume.connect(mono)
    const merger = ctx.createChannelMerger(2)
    // no PAN L/R o lado (L, L+R ou R) vale no lugar do pan; o padrão é o R, com a música
    this.leftGain = ctx.createGain()
    this.rightGain = ctx.createGain()
    mono.connect(this.leftGain)
    mono.connect(this.rightGain)
    this.leftGain.connect(merger, 0, 0)
    this.rightGain.connect(merger, 0, 1)
    const [l, r] = sideGains(this.state.side)
    this.leftGain.gain.value = l
    this.rightGain.gain.value = r
    merger.connect(this.splitOut)
    this.normalOut.connect(ctx.destination)
    this.splitOut.connect(ctx.destination)
    this.applyOutputMode()
    return ctx
  }

  private applyOutputMode(): void {
    if (!this.normalOut || !this.splitOut) return
    this.normalOut.gain.value = this.split ? 0 : 1
    this.splitOut.gain.value = this.split ? 1 : 0
  }

  private async loadSample(id: string): Promise<{ sample: LoadedSample; base: number } | null> {
    const info = this.state.samples.find((p) => p.id === id)
    if (!info) return null
    let sample = this.buffers.get(id)
    if (!sample) {
      this.set({ loading: true, error: null })
      let buf: AudioBuffer
      try {
        const bytes = await window.stemkit.readPad(id)
        const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        buf = await this.ensureCtx().decodeAudioData(copy)
      } catch {
        this.set({ loading: false, error: 'Não consegui abrir esse arquivo de áudio.' })
        return null
      }
      const region = loopRegion(buf)
      if (region.end - region.start < 4) {
        this.set({ loading: false, error: 'O pad precisa ter pelo menos 4 segundos de som.' })
        return null
      }
      sample = { buf, region, gain: normalizeGain(buf, region) }
      this.buffers.set(id, sample)
      this.set({ loading: false })
    }
    return { sample, base: info.key }
  }

  // cria a voz do estado atual e funde com a anterior (ou entra do silêncio)
  private async crossfade(fade: number): Promise<void> {
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    const { source, key } = this.state
    let voice: Voice
    const at = ctx.currentTime + 0.05
    if (source === 'synth') {
      voice = synthVoice(ctx, this.synthBus!, key, at)
    } else {
      const loaded = await this.loadSample(source)
      if (!loaded) return
      // o estado pode ter mudado durante o carregamento: vale o mais recente
      if (this.state.source !== source || this.state.key !== key || !this.state.playing) return
      voice = sampleVoice(ctx, this.sampleBus!, loaded.sample, sampleShift(loaded.base, key), ctx.currentTime + 0.05)
    }
    const t = ctx.currentTime + 0.05
    voice.out.gain.setValueCurveAtTime(FADE_IN, t, fade)
    voice.fullAt = t + fade
    this.fadeOutCurrent(t, fade)
    this.voice = voice
  }

  private fadeOutCurrent(t: number, fade: number): void {
    const old = this.voice
    if (!old) return
    const g = old.out.gain
    if ((old.fullAt ?? 0) <= t) {
      // voz cheia: curva de potência constante, espelho da que entra
      g.cancelScheduledValues(t)
      g.setValueCurveAtTime(FADE_OUT, t, fade)
    } else {
      // ainda entrando (cliques rápidos): segura onde está e desce dali
      g.cancelAndHoldAtTime(t)
      g.linearRampToValueAtTime(0, t + fade)
    }
    old.stop(t + fade + 0.05)
    this.voice = null
  }

  start(): Promise<void> {
    if (this.state.playing) return Promise.resolve()
    this.set({ playing: true, error: null })
    return this.crossfade(START_FADE)
  }

  stop(): void {
    if (!this.state.playing) return
    this.set({ playing: false })
    if (this.ctx) this.fadeOutCurrent(this.ctx.currentTime + 0.02, STOP_FADE)
  }

  toggle(): void {
    if (this.state.playing) this.stop()
    else void this.start()
  }

  // toque numa nota: liga nesse tom; tocar de novo a nota ativa desliga
  pressKey(key: number): Promise<void> {
    key = mod12(key)
    if (this.state.playing && this.state.key === key) {
      this.stop()
      return Promise.resolve()
    }
    return this.playKey(key)
  }

  // liga o pad nessa nota, ou troca para ela; se já está tocando nela, não faz nada
  // (diferente de pressKey, que desliga). É o que a cena usa entre músicas
  playKey(key: number): Promise<void> {
    key = mod12(key)
    if (this.state.playing && this.state.key === key) return Promise.resolve()
    const wasPlaying = this.state.playing
    this.set({ key, playing: true, error: null }, true)
    return this.crossfade(wasPlaying ? TRANSITION_SECONDS[this.state.transition] : START_FADE)
  }

  setSource(source: string): Promise<void> {
    if (source === this.state.source) return Promise.resolve()
    this.set({ source, error: null }, true)
    return this.state.playing ? this.crossfade(TRANSITION_SECONDS[this.state.transition]) : Promise.resolve()
  }

  setVolume(v: number): void {
    this.set({ volume: v }, true)
    if (this.ctx && this.volume) this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  setPan(v: number): void {
    v = Math.min(1, Math.max(-1, v))
    this.set({ pan: v }, true)
    if (this.ctx && this.panner) this.panner.pan.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  setSide(side: OutputSide): void {
    if (side === this.state.side) return
    this.set({ side }, true)
    if (this.ctx && this.leftGain && this.rightGain) {
      const [l, r] = sideGains(side)
      this.leftGain.gain.setTargetAtTime(l, this.ctx.currentTime, 0.02)
      this.rightGain.gain.setTargetAtTime(r, this.ctx.currentTime, 0.02)
    }
  }

  setBrightness(b: number): void {
    this.set({ brightness: b }, true)
    if (this.ctx && this.filter) this.filter.frequency.setTargetAtTime(brightnessHz(b), this.ctx.currentTime, 0.08)
  }

  setTransition(transition: PadTransition): void {
    this.set({ transition }, true)
  }

  setSongKey(songKey: number | null): void {
    if (songKey !== this.state.songKey) this.set({ songKey })
  }

  async importSample(): Promise<void> {
    try {
      const pad = await window.stemkit.importPad()
      if (!pad) return
      this.set({ samples: [...this.state.samples, pad], loading: true, error: null })
      // tom do arquivo: pelo nome; se o nome não diz, pelo áudio
      let key = keyFromName(pad.name)
      let how: 'name' | 'audio' | null = key === null ? null : 'name'
      if (key === null) {
        key = await this.detectFromAudio(pad.id)
        if (key !== null) how = 'audio'
      }
      if (key !== null && key !== pad.key) this.set({ samples: await window.stemkit.updatePad(pad.id, { key }) })
      this.set({ detected: { id: pad.id, key, how }, loading: false })
      await this.setSource(pad.id)
    } catch {
      this.set({ error: 'Não consegui importar esse arquivo.' })
    }
  }

  // decodifica fora do contexto que toca (não liga nada) e analisa o trecho do loop
  private async detectFromAudio(id: string): Promise<number | null> {
    try {
      const bytes = await window.stemkit.readPad(id)
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(copy)
      const mono = new Float32Array(buf.length)
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c)
        for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels
      }
      const region = loopRegion(buf)
      return keyFromAudio(mono, buf.sampleRate, region.start, region.end)
    } catch {
      return null
    }
  }

  // tom em que o arquivo importado foi gravado
  async setSampleKey(id: string, key: number): Promise<void> {
    const samples = await window.stemkit.updatePad(id, { key })
    this.set({ samples })
    if (this.state.playing && this.state.source === id) void this.crossfade(TRANSITION_SECONDS.fast)
  }

  async removeSample(id: string): Promise<void> {
    if (this.state.source === id) await this.setSource('synth')
    const samples = await window.stemkit.removePad(id)
    this.buffers.delete(id)
    this.set({ samples })
  }
}

export const pad = new PadEngine()

// o pad responde aos comandos de qualquer origem (teclado, celular, MIDI)
registerCommandHandler((c) => {
  if (c.type === 'padVolume') {
    pad.setVolume(Math.min(1, Math.max(0, c.value)))
    return true
  }
  if (c.type === 'padPan') {
    pad.setPan(c.value)
    return true
  }
  if (c.type === 'padSide') {
    pad.setSide(c.value)
    return true
  }
  if (c.type !== 'pad') return false
  if (c.key === undefined) pad.toggle()
  else void pad.pressKey(c.key)
  return true
})

export function usePad(): PadState {
  return useSyncExternalStore(pad.subscribe, pad.getState)
}
