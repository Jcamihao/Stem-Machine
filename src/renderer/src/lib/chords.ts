// nomes dos acordes em cifra (padrão brasileiro) a partir dos rótulos do detector
// ("E:maj/3", "C#:min7", "N") ou do texto digitado pelo usuário ("txt:Gm7")

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0
}

// qualidade -> sufixo da cifra; o que vem depois da barra é o intervalo do baixo
const QUALITY: Record<string, string> = {
  maj: '', min: 'm', aug: '+', dim: '°', '7': '7', maj7: '7M', min7: 'm7', hdim7: 'm7(b5)',
  dim7: '°7', maj9: '7M(9)', '9': '7(9)', min9: 'm7(9)', '11': '7(11)', '13': '7(13)',
  sus4: 'sus4', sus2: 'sus2', 'sus4(b7)': '7sus4'
}
const BASS_INTERVAL: Record<string, number> = { '2': 2, b3: 3, '3': 4, '4': 5, '5': 7, '6': 9, b7: 10, '7': 11 }

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const mod12 = (n: number): number => ((n % 12) + 12) % 12

// o baixo segue a armadura do acorde: E/G# (Mi tem sustenidos), Cm/Bb (Dó menor tem bemóis)
function bassName(rootIdx: number, minor: boolean, bassIdx: number): string {
  const flatRoots = minor ? [2, 7, 0, 5, 10, 3] : [5, 10, 3, 8, 1, 6]
  return (flatRoots.includes(rootIdx) ? FLATS : SHARPS)[mod12(bassIdx)]
}


export function formatChord(label: string, shift = 0): string {
  if (!label || label === 'N' || label === 'X') return ''
  if (label.startsWith('txt:')) {
    // texto livre: transpõe a fundamental e o baixo se reconhecer o formato
    const m = /^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/.exec(label.slice(4).trim())
    if (!m || !(m[1] in INDEX)) return label.slice(4)
    const root = mod12(INDEX[m[1]] + shift)
    const minor = /^m(?!aj)/.test(m[2])
    const bass = m[3] && m[3] in INDEX ? '/' + bassName(root, minor, INDEX[m[3]] + shift) : m[3] ? '/' + m[3] : ''
    return NAMES[root] + m[2] + bass
  }
  const [rootName, rest = 'maj'] = label.split(':')
  const [quality, bass] = rest.split('/')
  const r = INDEX[rootName]
  if (r === undefined) return label
  const root = mod12(r + shift)
  const name = NAMES[root] + (QUALITY[quality] ?? quality)
  if (!bass) return name
  const iv = BASS_INTERVAL[bass]
  const minor = quality.startsWith('min') || quality === 'hdim7' || quality === 'dim' || quality === 'dim7'
  return iv === undefined ? name : `${name}/${bassName(root, minor, root + iv)}`
}

// acorde tocando no instante t (e o próximo diferente dele)
export function chordAt(
  chords: { start: number; end: number; label: string }[],
  t: number
): { current: number; next: number } {
  let current = -1
  for (let i = 0; i < chords.length; i++) {
    if (chords[i].start <= t && t < chords[i].end) {
      current = i
      break
    }
  }
  let next = -1
  for (let i = current + 1; i < chords.length; i++) {
    if (chords[i].label !== 'N' && (current < 0 || chords[i].label !== chords[current].label)) {
      if (current >= 0 || chords[i].start > t) {
        next = i
        break
      }
    }
  }
  return { current, next }
}
