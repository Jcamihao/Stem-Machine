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

export class StemEngine {
  private ctx: AudioContext | null = null
  private buffers: BufferMap = {}
  private gains: Partial<Record<StemId, GainNode>> = {}
  private master: GainNode | null = null
  private sources: AudioBufferSourceNode[] = []
  private playing = false
  private anchorYt = 0
  private anchorCtx = 0
  private loopA: number | null = null
  private loopB: number | null = null
  private loopOn = false
  // click inteligente: grade de batidas (segundos da música) tocada por um
  // agendador com antecedência, no relógio do Web Audio (precisão de amostra)
  private clickBeats: number[] = []
  private clickDowns = new Set<number>()
  private clickOn = false
  private clickVolume = 0.8
  private clickGain: GainNode | null = null
  private clickSounds: { strong: AudioBuffer; weak: AudioBuffer } | null = null
  private clickSources: AudioBufferSourceNode[] = []
  private clickTimer: ReturnType<typeof setInterval> | null = null
  private clickScheduledRaw = 0
  rate = 1

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  private getGain(id: StemId): GainNode {
    const ctx = this.ensureCtx()
    let g = this.gains[id]
    if (!g) {
      g = ctx.createGain()
      g.connect(this.master!)
      this.gains[id] = g
    }
    return g
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
    this.buffers = buffers
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
    this.stopClicks()
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
    this.restartClicks()
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
      const audible = !mutes.has(id) && (solos.size === 0 || solos.has(id))
      this.getGain(id).gain.setTargetAtTime(audible ? vols[id] ?? 1 : 0, now, 0.012)
    }
    this.master?.gain.setTargetAtTime(masterVol, now, 0.012)
  }

  stopAll(): void {
    this.playing = false
    this.stopSources()
    this.stopClicks()
  }

  setClickGrid(beats: number[], downbeats: number[]): void {
    this.clickBeats = beats
    this.clickDowns = new Set(downbeats.map((t) => Math.round(t * 1000)))
    this.restartClicks()
  }

  setClickEnabled(on: boolean): void {
    this.clickOn = on
    this.restartClicks()
  }

  setClickVolume(v: number): void {
    this.clickVolume = v
    if (this.clickGain && this.ctx) {
      this.clickGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.012)
    }
  }

  // som do click gerado uma vez: agudo no "1" do compasso, grave nos outros tempos
  private ensureClickSounds(ctx: AudioContext): { strong: AudioBuffer; weak: AudioBuffer } {
    if (!this.clickSounds) {
      const make = (freq: number, amp: number, seconds: number): AudioBuffer => {
        const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate)
        const d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) {
          const t = i / ctx.sampleRate
          d[i] = amp * Math.sin(2 * Math.PI * freq * t) * Math.exp((-9 * i) / d.length)
        }
        return buf
      }
      this.clickSounds = { strong: make(1600, 0.9, 0.05), weak: make(1000, 0.6, 0.04) }
    }
    return this.clickSounds
  }

  private restartClicks(): void {
    this.stopClicks()
    if (!this.ctx || !this.playing || !this.clickOn || this.clickBeats.length === 0) return
    if (!this.clickGain) {
      this.clickGain = this.ctx.createGain()
      this.clickGain.gain.value = this.clickVolume
      // fora do master: o volume da música não abafa o click
      this.clickGain.connect(this.ctx.destination)
    }
    this.clickScheduledRaw = this.anchorYt
    this.scheduleClicks()
    this.clickTimer = setInterval(() => this.scheduleClicks(), 25)
  }

  private stopClicks(): void {
    if (this.clickTimer) clearInterval(this.clickTimer)
    this.clickTimer = null
    for (const s of this.clickSources) {
      try {
        s.stop()
      } catch {}
      try {
        s.disconnect()
      } catch {}
    }
    this.clickSources = []
  }

  /* agenda os clicks dos próximos ~200ms. Trabalha no tempo "corrido" da música
     (raw, sem dar a volta no loop) e converte cada batida para o relógio do
     contexto; com o loop ligado, as batidas de [A,B) se repetem a cada volta */
  private scheduleClicks(): void {
    const ctx = this.ctx
    if (!ctx || !this.clickGain) return
    const toRaw = (t: number): number => this.anchorYt + (t - this.anchorCtx) * this.rate
    const lo = this.clickScheduledRaw
    const hi = toRaw(ctx.currentTime + 0.2)
    if (hi <= lo) return
    const play = (beat: number, raw: number): void => {
      const when = this.anchorCtx + (raw - this.anchorYt) / this.rate
      if (when < ctx.currentTime) return
      const sounds = this.ensureClickSounds(ctx)
      const src = ctx.createBufferSource()
      src.buffer = this.clickDowns.has(Math.round(beat * 1000)) ? sounds.strong : sounds.weak
      src.connect(this.clickGain!)
      src.start(when)
      src.onended = () => {
        this.clickSources = this.clickSources.filter((s) => s !== src)
      }
      this.clickSources.push(src)
    }
    const looping = this.looping()
    const a = this.loopA ?? 0
    const b = this.loopB ?? 0
    for (const t of this.clickBeats) {
      if (looping && t >= b) break
      if (t >= lo && t < hi) play(t, t)
    }
    if (looping) {
      const len = b - a
      const first = Math.max(1, Math.floor((lo - a) / len))
      const last = Math.ceil((hi - a) / len)
      for (let m = first; m <= last; m++) {
        for (const t of this.clickBeats) {
          if (t < a) continue
          if (t >= b) break
          const raw = t + m * len
          if (raw >= b && raw >= lo && raw < hi) play(t, raw)
        }
      }
    }
    this.clickScheduledRaw = hi
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
