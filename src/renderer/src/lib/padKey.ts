// tom de um pad importado: primeiro pelo nome do arquivo ("Warm Pad D", "Pad em Ré"),
// senão pelo áudio. Funções puras (sem Web Audio) para dar para testar fora do app

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const SOLFEGE: Record<string, number> = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 }

const mod12 = (n: number): number => ((n % 12) + 12) % 12

function accidental(s: string): number | null {
  const a = s.toLowerCase()
  if (a === '') return 0
  if (a === '#' || a === '♯' || a === 'sharp' || a === 's' || a === 'sustenido') return 1
  if (a === 'b' || a === '♭' || a === 'flat' || a === 'bemol') return -1
  return null
}

// nota no nome do arquivo; vale a ÚLTIMA encontrada ("A Warm Pad D" -> D, não o "A" do artigo)
export function keyFromName(name: string): number | null {
  const tokens = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // Ré -> Re, Fá -> Fa (tira os acentos)
    .split(/[\s_\-.,()[\]{}+]+/)
    .filter(Boolean)
  let found: number | null = null
  for (const tok of tokens) {
    // letra maiúscula + acidente opcional + "m"/"maj"/"min" opcional: D, F#, Bb, C#m, Ebmaj, Dsharp
    const m = /^([A-G])(#|♯|b|♭|sharp|flat|s)?(m|min|minor|maj|major)?$/.exec(tok)
    if (m && !(m[1] === 'B' && m[2] === 's')) {
      const acc = accidental(m[2] ?? '')
      if (acc !== null) found = mod12(LETTERS[m[1]] + acc)
      continue
    }
    // solfejo com inicial maiúscula: Re, Sol, Fa#, Sib, Mib
    const s = /^(Do|Re|Mi|Fa|Sol|La|Si)(#|♯|b|♭)?$/.exec(tok)
    if (s) found = mod12(SOLFEGE[s[1].toLowerCase()] + (accidental(s[2] ?? '') ?? 0))
  }
  return found
}

// pelo áudio: intensidade de cada semitom (E1..B5) em vários trechos de 1 s;
// o grave pesa mais (a tônica de um pad costuma ser a nota de baixo) e a quinta
// de uma nota conta a favor dela (o "Lá" forte de um pad em Ré não vira Lá)
export function keyFromAudio(mono: Float32Array, sampleRate: number, start = 0, end = mono.length / sampleRate): number | null {
  // reduz para ~12 kHz (média de blocos): sobra até ~6 kHz, mais do que o B5 (988 Hz)
  const step = Math.max(1, Math.floor(sampleRate / 12000))
  const sr = sampleRate / step
  const a = Math.floor(start * sampleRate)
  const b = Math.min(mono.length, Math.floor(end * sampleRate))
  const n = Math.floor((b - a) / step)
  if (n < sr) return null // menos de 1 s de som
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < step; j++) s += mono[a + i * step + j]
    x[i] = s / step
  }
  const win = Math.floor(sr) // 1 s: separa semitons até no grave (E1 ~ 41 Hz)
  const frames = Math.min(6, Math.floor(n / win))
  const chroma = new Array(12).fill(0)
  for (let f = 0; f < frames; f++) {
    const off = Math.floor(((n - win) * (f + 0.5)) / frames)
    for (let midi = 28; midi < 84; midi++) {
      const w = (2 * Math.PI * 440 * Math.pow(2, (midi - 69) / 12)) / sr
      let re = 0
      let im = 0
      for (let i = 0; i < win; i++) {
        const v = x[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win)) // janela de Hann
        re += v * Math.cos(w * i)
        im += v * Math.sin(w * i)
      }
      chroma[midi % 12] += Math.hypot(re, im) * (midi < 60 ? 1 : 0.4)
    }
  }
  const total = chroma.reduce((s, v) => s + v, 0)
  if (total <= 0) return null
  const score = chroma.map((v, k) => v + 0.6 * chroma[(k + 7) % 12])
  return score.indexOf(Math.max(...score))
}
