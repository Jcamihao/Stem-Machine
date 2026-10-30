// tom da música a partir dos acordes detectados (ou corrigidos à mão): perfil de
// notas ponderado pelo tempo de cada acorde, comparado com os perfis de
// Krumhansl-Kessler dos 24 tons; o tempo no acorde do próprio tom desempata os
// relativos (Gm x Bb). Sem dependências: usado pelo player e pela biblioteca

export interface MusicKey {
  tonic: number // 0 = C ... 11 = B
  minor: boolean
}

const INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
}
const INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], aug: [0, 4, 8], dim: [0, 3, 6], '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], hdim7: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  maj9: [0, 4, 7, 11, 2], '9': [0, 4, 7, 10, 2], min9: [0, 3, 7, 10, 2], '11': [0, 4, 7, 10, 2, 5],
  '13': [0, 4, 7, 10, 2, 9], sus4: [0, 5, 7], sus2: [0, 2, 7], 'sus4(b7)': [0, 5, 7, 10]
}
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

// grafia usual dos tons (Eb e não D#, F#m e não Gbm...)
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']

const mod12 = (n: number): number => ((n % 12) + 12) % 12

// fundamental, se é menor e as notas do acorde
function chordNotes(label: string): { root: number; minor: boolean; notes: number[] } | null {
  if (!label || label === 'N' || label === 'X') return null
  if (label.startsWith('txt:')) {
    const m = /^([A-G](?:#|b)?)(.*?)(?:\/.*)?$/.exec(label.slice(4).trim())
    if (!m || !(m[1] in INDEX)) return null
    const minor = /^m(?!aj)/.test(m[2])
    const seventh = /7/.test(m[2]) ? [/7M|maj7/.test(m[2]) ? 11 : 10] : []
    return { root: INDEX[m[1]], minor, notes: [0, minor ? 3 : 4, 7, ...seventh] }
  }
  const [root, rest = 'maj'] = label.split(':')
  if (!(root in INDEX)) return null
  const quality = rest.split('/')[0]
  return {
    root: INDEX[root],
    minor: quality.startsWith('min') || quality === 'hdim7' || quality === 'dim' || quality === 'dim7',
    notes: INTERVALS[quality] ?? [0, 4, 7]
  }
}

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length
  const mb = b.reduce((s, x) => s + x, 0) / b.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0
}

export function detectKey(chords: { start: number; end: number; label: string }[]): MusicKey | null {
  const hist = new Array(12).fill(0)
  const tonicTime = new Map<string, number>()
  let total = 0
  for (const c of chords) {
    const parsed = chordNotes(c.label)
    const d = c.end - c.start
    if (!parsed || d <= 0) continue
    total += d
    parsed.notes.forEach((iv, k) => {
      // fundamental pesa mais; 7ª e extensões, menos
      hist[mod12(parsed.root + iv)] += d * (k === 0 ? 1.5 : k >= 3 ? 0.5 : 1)
    })
    const key = `${parsed.root}:${parsed.minor}`
    tonicTime.set(key, (tonicTime.get(key) ?? 0) + d)
  }
  if (total === 0) return null
  let best: MusicKey | null = null
  let bestScore = -Infinity
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const profile = (minor ? MINOR : MAJOR).map((_, i, p) => p[mod12(i - tonic)])
      const score = correlation(hist, profile) + (0.5 * (tonicTime.get(`${tonic}:${minor}`) ?? 0)) / total
      if (score > bestScore) {
        bestScore = score
        best = { tonic, minor }
      }
    }
  }
  return best
}

// nota (0 = C ... 11 = B) da tônica do tom, já transposta: é o tom em que o pad toca
export function shiftedTonic(key: MusicKey, shift = 0): number {
  return mod12(key.tonic + shift)
}

// nome do tom, já transposto (ex.: Gm com +2 -> Am)
export function keyName(key: MusicKey, shift = 0): string {
  return (key.minor ? MINOR_NAMES : MAJOR_NAMES)[mod12(key.tonic + shift)]
}
