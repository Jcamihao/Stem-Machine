// controle MIDI: interpretação das mensagens, catálogo de ações e validação do mapa.
// Sem dependências, usado pelo renderer (escuta) e pelo main (valida o que grava)

export interface MidiMessage {
  kind: 'note' | 'cc'
  channel: number // 1..16
  number: number // nota ou controlador, 0..127
  value: number // velocidade ou valor, 1..127
}

// só nota ligada e controlador contam: nota desligada, pitch bend, clock etc. viram null
export function parseMidi(data: ArrayLike<number>): MidiMessage | null {
  if (!data || data.length < 3) return null
  const type = data[0] & 0xf0
  const channel = (data[0] & 0x0f) + 1
  if (type === 0x90 && data[2] > 0) return { kind: 'note', channel, number: data[1] & 0x7f, value: data[2] & 0x7f }
  if (type === 0xb0) return { kind: 'cc', channel, number: data[1] & 0x7f, value: data[2] & 0x7f }
  return null
}

export function bindingKey(m: Pick<MidiMessage, 'kind' | 'channel' | 'number'>): string {
  return `${m.kind}:${m.channel}:${m.number}`
}

const KEY_RE = /^(note|cc):([1-9]|1[0-6]):(\d{1,3})$/
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// "Nota C4 (canal 1)" / "CC 64 (canal 1)"
export function describeBinding(key: string): string {
  const m = KEY_RE.exec(key)
  if (!m) return key
  const n = Number(m[3])
  return m[1] === 'note' ? `Nota ${NOTES[n % 12]}${Math.floor(n / 12) - 1} (canal ${m[2]})` : `CC ${n} (canal ${m[2]})`
}

export interface MidiActionInfo {
  id: string
  label: string
  group: string
}

export const SECTION_NAMES: Record<string, string> = {
  intro: 'Intro',
  verse: 'Verso',
  prechorus: 'Pré-refrão',
  chorus: 'Refrão',
  bridge: 'Ponte',
  solo: 'Solo',
  inst: 'Instrumental',
  break: 'Pausa',
  outro: 'Final'
}
export const PAD_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const MIDI_SECTION_SLOTS = 8

export const MIDI_ACTIONS: MidiActionInfo[] = [
  { id: 'toggle', label: 'Tocar / pausar', group: 'Reprodução' },
  { id: 'loop', label: 'Loop A–B ligar / desligar', group: 'Reprodução' },
  { id: 'click', label: 'Click ligar / desligar', group: 'Reprodução' },
  { id: 'nextSong', label: 'Próxima música da cena', group: 'Músicas' },
  { id: 'prevSong', label: 'Música anterior da cena', group: 'Músicas' },
  ...Array.from({ length: MIDI_SECTION_SLOTS }, (_, i) => ({ id: `section:${i + 1}`, label: `Ir para a parte ${i + 1}`, group: 'Partes' })),
  ...Object.entries(SECTION_NAMES).map(([label, name]) => ({ id: `next:${label}`, label: `Ir para o próximo: ${name}`, group: 'Partes' })),
  { id: 'semitones:+1', label: 'Tom +1 semitom', group: 'Tom e BPM' },
  { id: 'semitones:-1', label: 'Tom −1 semitom', group: 'Tom e BPM' },
  { id: 'bpm:+1', label: 'BPM +1', group: 'Tom e BPM' },
  { id: 'bpm:-1', label: 'BPM −1', group: 'Tom e BPM' },
  { id: 'pad:toggle', label: 'Pad ligar / desligar', group: 'Pad' },
  ...PAD_NOTE_NAMES.map((n, i) => ({ id: `pad:${i}`, label: `Pad na nota ${n}`, group: 'Pad' }))
]

const ACTION_IDS = new Set(MIDI_ACTIONS.map((a) => a.id))
export const isMidiAction = (id: string): boolean => ACTION_IDS.has(id)

// mapa tecla -> ação vindo do disco ou da tela: só chaves válidas e ações que existem
export function cleanMidiMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, action] of Object.entries(raw as Record<string, unknown>)) {
    const m = KEY_RE.exec(key)
    if (m && Number(m[3]) <= 127 && typeof action === 'string' && ACTION_IDS.has(action)) out[key] = action
    if (Object.keys(out).length >= 300) break
  }
  return out
}
