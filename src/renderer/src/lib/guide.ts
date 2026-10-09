import type { BeatGrid, Section } from '../../../shared/types'

export type GuideClips = Record<string, Float32Array>

const SR = 44100

/* decodifica as falas (wav do TTS), tira o silêncio que o TTS põe nas pontas e
   nivela o volume, para o encaixe no tempo depender só do início da fala */
export async function decodeGuideClips(raw: Record<string, Uint8Array>): Promise<GuideClips> {
  const ctx = new OfflineAudioContext(1, 1, SR)
  const out: GuideClips = {}
  for (const [key, bytes] of Object.entries(raw)) {
    const copy = bytes.slice().buffer
    const data = (await ctx.decodeAudioData(copy)).getChannelData(0)
    let a = 0
    let b = data.length - 1
    while (a < b && Math.abs(data[a]) < 0.01) a++
    while (b > a && Math.abs(data[b]) < 0.01) b--
    const clip = data.slice(a, b + 1)
    let peak = 0
    for (const v of clip) peak = Math.max(peak, Math.abs(v))
    const gain = peak > 0 ? 0.9 / peak : 1
    for (let i = 0; i < clip.length; i++) clip[i] *= gain
    out[key] = clip
  }
  return out
}

/* guia de voz: para cada seção nova, fala o nome 2 compassos antes e conta
   "um, dois, três, quatro" nos tempos do último compasso antes dela.
   Usa as batidas do click (grade aprovada) para cair exatamente no tempo */
export function renderGuide(
  sections: Section[],
  grid: BeatGrid,
  clips: GuideClips,
  duration: number
): AudioBuffer {
  const out = new AudioBuffer({ length: Math.max(1, Math.ceil(duration * SR)), sampleRate: SR, numberOfChannels: 1 })
  const data = out.getChannelData(0)
  const place = (clip: Float32Array | undefined, at: number, gain: number): void => {
    if (!clip) return
    const start = Math.round(at * SR)
    for (let i = 0; i < clip.length && start + i < data.length; i++) {
      if (start + i >= 0) data[start + i] += clip[i] * gain
    }
  }
  const downs = grid.downbeats
  let previous = ''
  for (const section of sections) {
    if (section.label === previous) continue
    previous = section.label
    // o detector de seções tem a própria grade: encaixa no "1" mais próximo do click
    const near = downs.reduce((best, t) => (Math.abs(t - section.start) < Math.abs(best - section.start) ? t : best), Infinity)
    const entry = Math.abs(near - section.start) <= 0.35 ? near : section.start
    const before = downs.filter((t) => t < entry - 0.05)
    if (before.length < 2) continue // começo da música: não há tempo para avisar
    place(clips[section.label], before[before.length - 2], 1)
    const lastBar = grid.beats.filter((t) => t >= before[before.length - 1] - 0.02 && t < entry - 0.05).slice(0, 4)
    lastBar.forEach((t, i) => place(clips[`c${i + 1}`], t, 0.8))
  }
  return out
}
