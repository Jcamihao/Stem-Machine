// metrônomo avulso: fica disponível quando não há uma música aberta. Enquanto o
// player está aberto, o comando "click" continua sendo o click sincronizado às
// batidas da música. O último BPM conhecido vira o BPM do metrônomo avulso.
import { useSyncExternalStore } from 'react'
import type { AppSettings } from '../../../shared/types'
import { sideGains, type OutputSide } from '../../../shared/remote'

export interface MetronomeState {
  playing: boolean
  bpm: number
  pan: number // -1 L, 0 centro, 1 R; ignorado na saída L/R (vale o lado)
  volume: number // 0 a 2, 1 = volume original
  side: OutputSide // lado na saída L/R
  follow: boolean // acompanha o BPM da música (songBpm) até você mexer no BPM ou no TAP
  songBpm: number | null // BPM da música aberta (null = sem música ou sem batidas)
}

class Metronome {
  private state: MetronomeState = { playing: false, bpm: 120, pan: 0, volume: 1, side: 'left', follow: false, songBpm: null }
  private listeners = new Set<() => void>()
  private ctx: AudioContext | null = null
  private source: GainNode | null = null
  private panner: StereoPannerNode | null = null
  private normalOut: GainNode | null = null
  private splitOut: GainNode | null = null
  private leftGain: GainNode | null = null
  private rightGain: GainNode | null = null
  private split = false
  private timer: ReturnType<typeof setInterval> | null = null
  private nextAt = 0
  private taps: number[] = []
  private initialized = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getState = (): MetronomeState => this.state

  private emit(): void {
    for (const cb of this.listeners) cb()
  }

  applySettings(settings: AppSettings): void {
    this.split = settings.outputSplit
    if (this.normalOut && this.splitOut) {
      this.normalOut.gain.value = this.split ? 0 : 1
      this.splitOut.gain.value = this.split ? 1 : 0
    }
    if (this.initialized) return
    this.initialized = true
    this.state = { ...this.state, bpm: settings.metronomeBpm, pan: settings.metronomePan, volume: settings.metronomeVolume, side: settings.metronomeSide }
    this.emit()
  }

  // O BPM é atualizado pelo player. Sem música, começa em 120 BPM e conserva o
  // último valor ouvido; o tap tempo entra na evolução própria do metrônomo.
  setBpm(bpm: number, persist = false): void {
    const next = Math.round(Math.max(30, Math.min(300, bpm)))
    if (next === this.state.bpm) return
    this.state = { ...this.state, bpm: next }
    if (this.ctx && this.state.playing) this.nextAt = this.ctx.currentTime + 0.04
    this.emit()
    if (persist) this.persist()
  }

  // BPM escolhido por você (botões, TAP, celular, MIDI): sai do modo "acompanhar a música"
  setBpmManual(bpm: number): void {
    if (this.state.follow) {
      this.state = { ...this.state, follow: false }
      this.emit()
    }
    this.setBpm(bpm, true)
  }

  // o player informa o BPM da música aberta (null = fechou, ou sem batidas)
  setSongBpm(bpm: number | null): void {
    const next = bpm === null ? null : Math.round(Math.max(30, Math.min(300, bpm)))
    if (next === this.state.songBpm) return
    this.state = { ...this.state, songBpm: next, follow: next === null ? false : this.state.follow }
    if (this.state.follow && next !== null) this.setBpm(next, true)
    this.emit()
  }

  // liga: adota o BPM da música agora e acompanha (inclusive se mudar a velocidade); desliga: volta a ser seu
  toggleFollow(): void {
    if (this.state.follow) {
      this.state = { ...this.state, follow: false }
      this.emit()
      return
    }
    const target = this.state.songBpm
    if (target === null) return
    this.state = { ...this.state, follow: true }
    this.setBpm(target, true)
    this.emit()
  }

  setSide(side: OutputSide): void {
    if (side === this.state.side) return
    this.state = { ...this.state, side }
    this.applySide()
    this.emit()
    this.persist()
  }

  private applySide(): void {
    if (!this.ctx || !this.leftGain || !this.rightGain) return
    const [l, r] = sideGains(this.state.side)
    this.leftGain.gain.setTargetAtTime(l, this.ctx.currentTime, 0.02)
    this.rightGain.gain.setTargetAtTime(r, this.ctx.currentTime, 0.02)
  }

  setPan(pan: number): void {
    const next = Math.min(1, Math.max(-1, pan))
    if (next === this.state.pan) return
    this.state = { ...this.state, pan: next }
    if (this.ctx && this.panner) this.panner.pan.setTargetAtTime(next, this.ctx.currentTime, 0.05)
    this.emit()
    this.persist()
  }

  setVolume(volume: number): void {
    const next = Math.min(2, Math.max(0, volume))
    if (next === this.state.volume) return
    this.state = { ...this.state, volume: next }
    if (this.ctx && this.source) this.source.gain.setTargetAtTime(next, this.ctx.currentTime, 0.02)
    this.emit()
    this.persist()
  }

  // Até quatro toques recentes formam uma média. Uma pausa longa começa uma
  // nova contagem, para o tap não misturar dois andamentos diferentes.
  tap(): void {
    const now = performance.now()
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2_000) this.taps = []
    this.taps.push(now)
    if (this.taps.length > 5) this.taps.shift()
    if (this.taps.length < 2) return
    const intervals = this.taps.slice(1).map((t, i) => t - this.taps[i])
    const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    if (avg > 0) this.setBpmManual(60_000 / avg)
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void window.stemkit.setSettings({ metronomeBpm: this.state.bpm, metronomePan: this.state.pan, metronomeVolume: this.state.volume, metronomeSide: this.state.side })
    }, 250)
  }

  private ensureCtx(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    this.ctx = ctx
    this.source = ctx.createGain()
    this.source.gain.value = this.state.volume
    this.panner = ctx.createStereoPanner()
    this.panner.pan.value = this.state.pan
    this.normalOut = ctx.createGain()
    this.splitOut = ctx.createGain()
    this.normalOut.connect(ctx.destination)
    this.splitOut.connect(ctx.destination)
    // No modo L/R, o lado (L, L+R ou R) vale no lugar do pan; o padrão é o L, com o click da música.
    const merger = ctx.createChannelMerger(2)
    this.source.connect(this.panner)
    this.panner.connect(this.normalOut)
    this.leftGain = ctx.createGain()
    this.rightGain = ctx.createGain()
    this.source.connect(this.leftGain)
    this.source.connect(this.rightGain)
    this.leftGain.connect(merger, 0, 0)
    this.rightGain.connect(merger, 0, 1)
    merger.connect(this.splitOut)
    const [l, r] = sideGains(this.state.side)
    this.leftGain.gain.value = l
    this.rightGain.gain.value = r
    this.normalOut.gain.value = this.split ? 0 : 1
    this.splitOut.gain.value = this.split ? 1 : 0
    return ctx
  }

  // A fonte alimenta as duas rotas; uma delas fica muda conforme o modo L/R.
  private output(ctx: AudioContext): AudioNode {
    return this.source ?? ctx.destination
  }

  private tick = (): void => {
    const ctx = this.ctx
    if (!ctx || !this.state.playing) return
    const horizon = ctx.currentTime + 0.12
    while (this.nextAt < horizon) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1760, this.nextAt)
      gain.gain.setValueAtTime(0.18, this.nextAt)
      gain.gain.exponentialRampToValueAtTime(0.0001, this.nextAt + 0.045)
      osc.connect(gain)
      gain.connect(this.output(ctx))
      osc.start(this.nextAt)
      osc.stop(this.nextAt + 0.05)
      this.nextAt += 60 / this.state.bpm
    }
  }

  async start(): Promise<void> {
    if (this.state.playing) return
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    this.nextAt = ctx.currentTime + 0.04
    this.state = { ...this.state, playing: true }
    this.tick()
    this.timer = setInterval(this.tick, 25)
    this.emit()
  }

  stop(): void {
    if (!this.state.playing) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.state = { ...this.state, playing: false }
    this.emit()
  }

  toggle(): void {
    if (this.state.playing) this.stop()
    else void this.start()
  }
}

export const metronome = new Metronome()

export function useMetronome(): MetronomeState {
  return useSyncExternalStore(metronome.subscribe, metronome.getState)
}
