import type { StemId } from '../../../shared/types'

export type BufferMap = Partial<Record<StemId, AudioBuffer>>

export async function decodePayload(
  payload: Record<string, Uint8Array>
): Promise<BufferMap> {
  const ctx = new AudioContext()
  void ctx.resume()
  const ids = Object.keys(payload)
  // decodeAudioData detaches the source buffer — the IPC payload is throwaway,
  // so hand it over as-is (skips a full copy per stem)
  const decoded = await Promise.all(
    ids.map((id) => ctx.decodeAudioData(payload[id].buffer as ArrayBuffer))
  )
  const out: BufferMap = {}
  ids.forEach((id, i) => {
    out[id as StemId] = decoded[i]
  })
  return out
}

// click e guia continuam tocando quando outro stem está em solo; só o M os desliga
export function isAudible(id: StemId, mutes: Set<StemId>, solos: Set<StemId>): boolean {
  if (mutes.has(id)) return false
  if (id === 'click' || id === 'guide') return true
  return solos.size === 0 || solos.has(id)
}

/* click como stem: renderiza a grade de batidas num áudio do tamanho da música.
   Agudo no "1" do compasso, grave nos outros tempos */
export function renderClick(
  beats: number[],
  downbeats: number[],
  duration: number,
  sampleRate = 44100
): AudioBuffer {
  const out = new AudioBuffer({ length: Math.max(1, Math.ceil(duration * sampleRate)), sampleRate, numberOfChannels: 1 })
  const data = out.getChannelData(0)
  const tone = (freq: number, amp: number, seconds: number): Float32Array => {
    const n = Math.round(sampleRate * seconds)
    const t = new Float32Array(n)
    for (let i = 0; i < n; i++) t[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate) * Math.exp((-9 * i) / n)
    return t
  }
  const strong = tone(1600, 0.9, 0.05)
  const weak = tone(1000, 0.6, 0.04)
  const downs = new Set(downbeats.map((t) => Math.round(t * 1000)))
  for (const beat of beats) {
    const sound = downs.has(Math.round(beat * 1000)) ? strong : weak
    const at = Math.round(beat * sampleRate)
    for (let i = 0; i < sound.length && at + i < data.length; i++) data[at + i] += sound[i]
  }
  return out
}

export class StemEngine {
  private ctx: AudioContext | null = null
  private buffers: BufferMap = {}
  private gains: Partial<Record<StemId, GainNode>> = {}
  // pan L/R por faixa: volume -> pan -> master
  private pans: Partial<Record<StemId, StereoPannerNode>> = {}
  private master: GainNode | null = null
  /* saída L/R (playback): click e guia em mono no L, música em mono no R. Os
     dois caminhos existem sempre; a troca só liga/desliga um ganho em cada um */
  private normalOut: GainNode | null = null
  private splitOut: GainNode | null = null
  private cueBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private split = false
  private sources: AudioBufferSourceNode[] = []
  private playing = false
  private anchorYt = 0
  private anchorCtx = 0
  private loopA: number | null = null
  private loopB: number | null = null
  private loopOn = false
  rate = 1

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      const ctx = this.ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(ctx.destination)
      this.normalOut = ctx.createGain()
      this.normalOut.connect(this.master)
      this.splitOut = ctx.createGain()
      this.splitOut.connect(this.master)
      // barramentos mono: o estéreo de cada faixa é somado num canal só
      const monoBus = (): GainNode => {
        const g = ctx.createGain()
        g.channelCount = 1
        g.channelCountMode = 'explicit'
        g.channelInterpretation = 'speakers'
        return g
      }
      this.cueBus = monoBus()
      this.musicBus = monoBus()
      const merger = ctx.createChannelMerger(2)
      this.cueBus.connect(merger, 0, 0) // L
      this.musicBus.connect(merger, 0, 1) // R
      merger.connect(this.splitOut)
      this.applyOutputMode()
    }
    return this.ctx
  }

  private applyOutputMode(): void {
    if (!this.normalOut || !this.splitOut) return
    this.normalOut.gain.value = this.split ? 0 : 1
    this.splitOut.gain.value = this.split ? 1 : 0
  }

  // liga/desliga a saída L/R (click + guia no L, música no R)
  setOutputSplit(on: boolean): void {
    this.split = on
    this.applyOutputMode()
  }

  private getGain(id: StemId): GainNode {
    const ctx = this.ensureCtx()
    let g = this.gains[id]
    if (!g) {
      g = ctx.createGain()
      const pan = ctx.createStereoPanner()
      g.connect(pan)
      pan.connect(this.normalOut!)
      // caminho L/R: click e guia vão para o L, o resto para o R
      g.connect(id === 'click' || id === 'guide' ? this.cueBus! : this.musicBus!)
      this.gains[id] = g
      this.pans[id] = pan
    }
    return g
  }

  // -1 (esquerda) a 1 (direita)
  setPan(id: StemId, value: number): void {
    this.getGain(id)
    const pan = this.pans[id]
    if (pan && this.ctx) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, value)), this.ctx.currentTime, 0.012)
  }

  resume(): void {
    void this.ensureCtx().resume()
  }

  async decode(payload: Record<string, Uint8Array>): Promise<void> {
    const buffers = await decodePayload(payload)
    this.buffers = buffers
  }

  setBuffers(buffers: BufferMap): void {
    this.stopAll()
    // cópia: setStemBuffer não pode alterar o objeto que o player guarda em cache
    this.buffers = { ...buffers }
  }

  hasBuffers(): boolean {
    return Object.keys(this.buffers).length > 0
  }

  setPlaying(playing: boolean, time: number): void {
    if (playing) this.resume()
    this.playing = playing
    this.align(time)
  }

  // loop A-B toca em repeticao nativa (sem corte) enquanto estiver ligado
  private looping(): boolean {
    return this.loopOn && this.loopA !== null && this.loopB !== null && this.loopB > this.loopA
  }

  setLoop(a: number | null, b: number | null, on: boolean): void {
    const t = this.expected()
    this.loopA = a
    this.loopB = b
    this.loopOn = on
    if (this.playing) this.align(t)
  }

  align(time: number): void {
    this.stopSources()
    // fora da regiao (depois do B) volta para o A; antes do A toca ate o B e entra no loop
    if (this.looping() && time >= this.loopB!) time = this.loopA!
    this.anchorYt = time
    if (!this.ctx || !this.playing || !this.hasBuffers()) return
    const ctx = this.ctx
    const startAt = ctx.currentTime + 0.04
    for (const id of Object.keys(this.buffers) as StemId[]) {
      const buf = this.buffers[id]
      if (!buf) continue
      const gain = this.getGain(id)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = this.rate
      if (this.looping()) {
        src.loop = true
        src.loopStart = this.loopA!
        src.loopEnd = Math.min(this.loopB!, buf.duration)
      }
      src.connect(gain)
      src.start(startAt, Math.min(Math.max(0, time), Math.max(0, buf.duration - 0.01)))
      this.sources.push(src)
    }
    this.anchorCtx = startAt
  }

  expected(): number {
    if (!this.ctx || !this.playing) return this.anchorYt
    const raw = this.anchorYt + (this.ctx.currentTime - this.anchorCtx) * this.rate
    if (this.looping() && raw >= this.loopB!) {
      return this.loopA! + ((raw - this.loopA!) % (this.loopB! - this.loopA!))
    }
    return raw
  }

  trackDuration(): number {
    let d = 0
    for (const buf of Object.values(this.buffers)) {
      if (buf && buf.duration > d) d = buf.duration
    }
    return d
  }

  applyMix(
    vols: Partial<Record<StemId, number>>,
    mutes: Set<StemId>,
    solos: Set<StemId>,
    masterVol: number
  ): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const id of Object.keys(vols) as StemId[]) {
      const audible = isAudible(id, mutes, solos)
      this.getGain(id).gain.setTargetAtTime(audible ? vols[id] ?? 1 : 0, now, 0.012)
    }
    this.master?.gain.setTargetAtTime(masterVol, now, 0.012)
  }

  stopAll(): void {
    this.playing = false
    this.stopSources()
  }

  // troca/adiciona um stem com a música tocando (ex.: o click gerado das batidas)
  setStemBuffer(id: StemId, buffer: AudioBuffer | null): void {
    const t = this.expected()
    if (buffer) this.buffers[id] = buffer
    else delete this.buffers[id]
    if (this.playing) this.align(t)
  }

  private stopSources(): void {
    for (const s of this.sources) {
      try {
        s.stop()
      } catch {}
      try {
        s.disconnect()
      } catch {}
    }
    this.sources = []
  }
}

export const engine = new StemEngine()
