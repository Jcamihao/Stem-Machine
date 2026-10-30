import SignalsmithStretch from 'signalsmith-stretch'
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

const isCue = (id: StemId): boolean => id === 'click' || id === 'guide'

export class StemEngine {
  private ctx: AudioContext | null = null
  private buffers: BufferMap = {}
  private gains: Partial<Record<StemId, GainNode>> = {}
  // pan L/R por faixa: volume -> pan -> master
  private pans: Partial<Record<StemId, StereoPannerNode>> = {}
  // EQ de 3 bandas por faixa (graves, médios, agudos): volume -> EQ -> pan
  private eqs: Partial<Record<StemId, [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode]>> = {}
  private master: GainNode | null = null
  /* roteamento: cada faixa -> volume -> pan -> barramento de música ou de
     click/guia (cue). Música: velocidade nas próprias faixas (playbackRate,
     instantâneo) e um corretor de tom em tempo real (Signalsmith Stretch) que
     desfaz a mudança de tom da velocidade e aplica transposição/afinação. Cue:
     gerado já na velocidade certa, atrasado pela latência do corretor.
     Saída normal (estéreo) ou L/R (cue mono no L, música mono no R) */
  private musicIn: GainNode | null = null
  private cueIn: GainNode | null = null
  private dry: GainNode | null = null
  private wet: GainNode | null = null
  private cueDelay: DelayNode | null = null
  private stretch: (AudioNode & Record<string, any>) | null = null
  private stretchLatency = 0 // segundos; o atraso do click/guia acompanha
  private normalOut: GainNode | null = null
  private splitOut: GainNode | null = null
  private split = false
  private sources: AudioBufferSourceNode[] = []
  // salto agendado (troca de parte na virada do compasso): fontes novas já programadas
  // para entrar em `at` (relógio do áudio); as atuais param nesse mesmo instante
  private pending: { at: number; to: number; incoming: AudioBufferSourceNode[] } | null = null
  private playing = false
  private anchorYt = 0
  private anchorCtx = 0
  private loopA: number | null = null
  private loopB: number | null = null
  private loopOn = false
  // velocidade (1 = original) e tom: semitons + afinação de referência (A4 em Hz)
  rate = 1
  private semitones = 0
  private tuningHz = 440

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
      const monoBus = (): GainNode => {
        const g = ctx.createGain()
        g.channelCount = 1
        g.channelCountMode = 'explicit'
        g.channelInterpretation = 'speakers'
        return g
      }
      // música: entrada -> (seco | corretor) -> saídas
      this.musicIn = ctx.createGain()
      this.dry = ctx.createGain()
      this.wet = ctx.createGain()
      this.wet.gain.value = 0
      this.musicIn.connect(this.dry)
      const musicOut = ctx.createGain()
      this.dry.connect(musicOut)
      this.wet.connect(musicOut)
      // click/guia: entrada -> atraso (latência do corretor) -> saídas
      this.cueIn = ctx.createGain()
      this.cueDelay = ctx.createDelay(1)
      this.cueIn.connect(this.cueDelay)
      const cueOut = ctx.createGain()
      this.cueDelay.connect(cueOut)
      // saída normal: tudo em estéreo
      musicOut.connect(this.normalOut)
      cueOut.connect(this.normalOut)
      // saída L/R: cue mono no L, música mono no R
      const cueMono = monoBus()
      const musicMono = monoBus()
      cueOut.connect(cueMono)
      musicOut.connect(musicMono)
      const merger = ctx.createChannelMerger(2)
      cueMono.connect(merger, 0, 0)
      musicMono.connect(merger, 0, 1)
      merger.connect(this.splitOut)
      this.applyOutputMode()
      // o corretor carrega em segundo plano (WASM); até lá a música toca seca
      void SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
        .then((node: AudioNode & Record<string, any>) => {
          this.stretch = node
          this.musicIn!.connect(node)
          node.connect(this.wet!)
          node.start()
          this.applyPitch()
          // latency() é assíncrona: guarda quando chegar e reaplica o atraso do cue
          void Promise.resolve(node.latency()).then((l: unknown) => {
            this.stretchLatency = Number(l) || 0
            this.applyPitch()
          })
        })
        .catch(() => {})
    }
    return this.ctx
  }

  // quanto o corretor desloca o tom: transposição + afinação − o efeito da velocidade
  private pitchShift(): number {
    return this.semitones + 12 * Math.log2(this.tuningHz / 440) - 12 * Math.log2(this.rate)
  }

  private applyPitch(): void {
    if (!this.ctx || !this.dry || !this.wet || !this.cueDelay) return
    const shift = this.pitchShift()
    const active = !!this.stretch && Math.abs(shift) > 0.001
    const now = this.ctx.currentTime
    if (this.stretch) {
      this.stretch.schedule({
        output: now,
        semitones: shift,
        // formantes: desfaz o deslocamento da velocidade; na transposição, preserva
        formantCompensation: true,
        formantSemitones: -12 * Math.log2(this.rate)
      })
    }
    this.dry.gain.setValueAtTime(active ? 0 : 1, now)
    this.wet.gain.setValueAtTime(active ? 1 : 0, now)
    const latency = active ? this.stretchLatency : 0
    this.cueDelay.delayTime.setValueAtTime(Math.min(0.9, latency), now)
  }

  // transposição em semitons e afinação de referência (A4 = tuningHz)
  setPitch(semitones: number, tuningHz: number): void {
    this.semitones = semitones
    this.tuningHz = tuningHz
    this.ensureCtx()
    this.applyPitch()
  }

  // velocidade: mantém a posição na música e reinicia as fontes no novo ritmo
  setRate(rate: number): void {
    if (rate === this.rate) return
    const t = this.expected()
    this.rate = rate
    this.applyPitch()
    if (this.playing) this.align(t)
    else this.anchorYt = t
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
      const band = (type: BiquadFilterType, freq: number): BiquadFilterNode => {
        const f = ctx.createBiquadFilter()
        f.type = type
        f.frequency.value = freq
        f.gain.value = 0
        return f
      }
      const eq: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode] = [
        band('lowshelf', 200),
        band('peaking', 1000),
        band('highshelf', 6000)
      ]
      eq[1].Q.value = 0.8 // médios largos: soa musical, sem "buraco"
      g.connect(eq[0])
      eq[0].connect(eq[1])
      eq[1].connect(eq[2])
      eq[2].connect(pan)
      pan.connect(isCue(id) ? this.cueIn! : this.musicIn!)
      this.gains[id] = g
      this.pans[id] = pan
      this.eqs[id] = eq
    }
    return g
  }

  // EQ em dB (−12 a +12) para graves, médios e agudos
  setEq(id: StemId, low: number, mid: number, high: number): void {
    this.getGain(id)
    const eq = this.eqs[id]
    if (!eq || !this.ctx) return
    const now = this.ctx.currentTime
    ;[low, mid, high].forEach((db, i) => eq[i].gain.setTargetAtTime(Math.max(-12, Math.min(12, db)), now, 0.015))
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
    const startAt = this.ctx.currentTime + 0.04
    this.sources = this.makeSources(time, startAt)
    this.anchorCtx = startAt
  }

  // uma fonte por faixa, começando em `startAt` (relógio do áudio) no ponto `time` da música
  private makeSources(time: number, startAt: number): AudioBufferSourceNode[] {
    const ctx = this.ctx!
    const out: AudioBufferSourceNode[] = []
    for (const id of Object.keys(this.buffers) as StemId[]) {
      const buf = this.buffers[id]
      if (!buf) continue
      const gain = this.getGain(id)
      const src = ctx.createBufferSource()
      src.buffer = buf
      // música toca no ritmo escolhido; click/guia já vêm gerados nele (tempo / rate)
      const k = isCue(id) ? this.rate : 1
      if (!isCue(id)) src.playbackRate.value = this.rate
      if (this.looping()) {
        src.loop = true
        src.loopStart = this.loopA! / k
        src.loopEnd = Math.min(this.loopB! / k, buf.duration)
      }
      src.connect(gain)
      src.start(startAt, Math.min(Math.max(0, time / k), Math.max(0, buf.duration - 0.01)))
      out.push(src)
    }
    return out
  }

  /* salto sem corte: quando a música chegar em `at` (segundos da música, ex.: o
     próximo "1"), passa para `target`. Agendado no relógio do áudio, não em
     setTimeout: cai no mesmo instante em todas as faixas. false = não deu
     (parado, sem faixas, loop A-B ligado): quem chama salta na hora. Qualquer
     align (velocidade, loop, parar) cancela o salto */
  scheduleJump(at: number, target: number): boolean {
    const ctx = this.ctx
    if (!ctx || !this.playing || !this.hasBuffers() || this.looping()) return false
    const now = this.expected()
    const startAt = ctx.currentTime + Math.max(0.05, (at - now) / this.rate)
    if (this.pending) this.dropIncoming()
    for (const s of this.sources) {
      try {
        s.stop(startAt) // a última chamada vale: troca o instante de um salto anterior
      } catch {}
    }
    this.pending = { at: startAt, to: target, incoming: this.makeSources(target, startAt) }
    return true
  }

  // posição de destino do salto ainda por vir (null = nenhum)
  jumpPending(): number | null {
    this.settle()
    return this.pending ? this.pending.to : null
  }

  private dropIncoming(): void {
    if (!this.pending) return
    for (const s of this.pending.incoming) {
      try {
        s.stop()
      } catch {}
      try {
        s.disconnect()
      } catch {}
    }
    this.pending = null
  }

  // chegou a hora do salto: as fontes novas viram as atuais e a âncora acompanha
  private settle(): void {
    const p = this.pending
    if (!p || !this.ctx || this.ctx.currentTime < p.at) return
    for (const s of this.sources) {
      try {
        s.disconnect()
      } catch {}
    }
    this.sources = p.incoming
    this.anchorYt = p.to
    this.anchorCtx = p.at
    this.pending = null
  }

  expected(): number {
    if (!this.ctx || !this.playing) return this.anchorYt
    this.settle()
    const raw = this.anchorYt + (this.ctx.currentTime - this.anchorCtx) * this.rate
    if (this.looping() && raw >= this.loopB!) {
      return this.loopA! + ((raw - this.loopA!) % (this.loopB! - this.loopA!))
    }
    return raw
  }

  // duração da música: só as faixas separadas (click/guia são gerados no ritmo)
  trackDuration(): number {
    let d = 0
    for (const [id, buf] of Object.entries(this.buffers)) {
      if (buf && !isCue(id as StemId) && buf.duration > d) d = buf.duration
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
    this.dropIncoming()
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
