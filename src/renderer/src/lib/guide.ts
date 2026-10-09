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

/* encurta uma fala para caber no tempo da música SEM mudar o tom (WSOLA:
   recorta janelas sobrepostas, alinhando cada uma pela forma de onda, e anda
   mais rápido na entrada do que na saída). Nunca estica: fala lenta fica natural */
export function fitToLength(clip: Float32Array, maxSeconds: number): Float32Array {
  const target = Math.round(maxSeconds * SR)
  if (target <= 0) return new Float32Array(0)
  if (clip.length <= target) return clip
  const ratio = Math.max(0.35, target / clip.length)
  const frame = Math.round(0.03 * SR)
  const hopOut = frame >> 1
  const hopIn = hopOut / ratio
  const tolerance = Math.round(0.008 * SR)
  const window = new Float32Array(frame)
  for (let i = 0; i < frame; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame)
  const outLen = Math.round(clip.length * ratio)
  const out = new Float32Array(outLen + frame)
  const norm = new Float32Array(outLen + frame)
  let prevPos = 0
  for (let k = 0; k * hopOut < outLen; k++) {
    const nominal = Math.round(k * hopIn)
    let pos = Math.min(nominal, clip.length - frame)
    if (k > 0) {
      // escolhe o deslocamento que melhor continua o trecho anterior
      const natural = prevPos + hopOut
      let best = pos
      let bestScore = -Infinity
      for (let d = -tolerance; d <= tolerance; d += 4) {
        const cand = Math.max(0, Math.min(clip.length - frame, nominal + d))
        let score = 0
        for (let i = 0; i < hopOut; i += 2) score += clip[cand + i] * (clip[natural + i] ?? 0)
        if (score > bestScore) {
          bestScore = score
          best = cand
        }
      }
      pos = best
    }
    if (pos < 0) break
    const at = k * hopOut
    for (let i = 0; i < frame && pos + i < clip.length; i++) {
      out[at + i] += clip[pos + i] * window[i]
      norm[at + i] += window[i]
    }
    prevPos = pos
  }
  const result = new Float32Array(Math.min(target, outLen))
  for (let i = 0; i < result.length; i++) result[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0
  // fade curto no fim para não estalar
  const fade = Math.min(result.length, Math.round(0.012 * SR))
  for (let i = 0; i < fade; i++) result[result.length - 1 - i] *= i / fade
  return result
}

// onde a seção começa no compasso: o detector marca onde ela começa a SOAR, e o
// cantor costuma entrar antes do "1" (anacruse). Então a entrada é o primeiro "1"
// do click a partir do início marcado, tolerando até meio tempo de atraso
export function sectionEntry(start: number, grid: BeatGrid): number | null {
  const beat = 60 / grid.bpm
  return grid.downbeats.find((t) => t >= start - 0.5 * beat) ?? null
}

/* guia de voz: para cada seção nova, fala o nome no "1" de 2 compassos antes da
   entrada e conta "um, dois, três, quatro" nos tempos do último compasso.
   Usa as batidas do click (grade aprovada) para cair exatamente no tempo */
export function renderGuide(
  sections: Section[],
  grid: BeatGrid,
  clips: GuideClips,
  duration: number
): AudioBuffer {
  const out = new AudioBuffer({ length: Math.max(1, Math.ceil(duration * SR)), sampleRate: SR, numberOfChannels: 1 })
  const data = out.getChannelData(0)
  const beat = 60 / grid.bpm
  // cada fala no tempo da música: comprimida (sem mudar o tom) para caber no espaço dela
  const place = (clip: Float32Array | undefined, at: number, gain: number, maxSeconds: number): void => {
    if (!clip) return
    const fitted = fitToLength(clip, maxSeconds)
    const start = Math.round(at * SR)
    for (let i = 0; i < fitted.length && start + i < data.length; i++) {
      if (start + i >= 0) data[start + i] += fitted[i] * gain
    }
  }
  const downs = grid.downbeats
  let previous = ''
  for (const section of sections) {
    if (section.label === previous) continue
    previous = section.label
    const entry = sectionEntry(section.start, grid)
    if (entry === null) continue
    const before = downs.filter((t) => t < entry - 0.05)
    if (before.length < 2) continue // começo da música: não há tempo para avisar
    // nome: no "1" de 2 compassos antes, cabendo naquele compasso
    place(clips[section.label], before[before.length - 2], 1, before[before.length - 1] - before[before.length - 2] - 0.05)
    // contagem: os tempos do último compasso, cada palavra cabendo no seu tempo
    const lastBar = grid.beats.filter((t) => t >= before[before.length - 1] - 0.02 && t < entry - 0.05)
    lastBar.slice(0, 4).forEach((t, i) => place(clips[`c${i + 1}`], t, 0.85, beat * 0.9))
  }
  return out
}
