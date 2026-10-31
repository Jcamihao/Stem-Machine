// operações puras de cena (testáveis fora do app)
import type { Scene } from '../../../shared/types'

// move o item `i` para cima (-1) ou para baixo (+1); nas pontas não faz nada
export function moveSong(songs: string[], i: number, delta: -1 | 1): string[] {
  const j = i + delta
  if (i < 0 || i >= songs.length || j < 0 || j >= songs.length) return songs
  const next = [...songs]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function removeSong(songs: string[], i: number): string[] {
  return songs.filter((_, k) => k !== i)
}

// próxima/anterior dentro da cena, ignorando músicas que saíram da biblioteca;
// null = chegou na ponta
export function stepSong(scene: Scene, from: number, delta: -1 | 1, exists: (id: string) => boolean): number | null {
  for (let i = from + delta; i >= 0 && i < scene.songs.length; i += delta) {
    if (exists(scene.songs[i])) return i
  }
  return null
}

export function newSceneId(): string {
  return `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// uma música do setlist com o que o músico precisa ver: tom (já com a transposição salva), BPM e duração
export interface SceneSong {
  id: string
  title: string
  key: string | null
  bpm: number | null
  duration: number // segundos
  missing?: boolean // saiu da biblioteca
}

// arrastar: leva o item `from` para a posição `to` (os outros se ajeitam)
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// "24 min" ou "1 h 05 min"
export function fmtTotal(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

const norm = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// busca sem acento e sem diferença de maiúscula; todas as palavras precisam aparecer
export function filterSongs<T extends { title: string }>(songs: T[], query: string): T[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return songs
  return songs.filter((s) => {
    const t = norm(s.title)
    return words.every((w) => t.includes(w))
  })
}

// nome que não repete os que já existem: "Culto 31/10", "Culto 31/10 (2)"...
function unique(base: string, existing: string[]): string {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`
}

export function todayName(date: Date, existing: string[]): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return unique(`Culto ${dd}/${mm}`, existing)
}

export function copyName(name: string, existing: string[]): string {
  return unique(`${name} (cópia)`, existing)
}

// o que o player precisa saber da cena em andamento
export interface SceneView {
  name: string
  index: number
  total: number
  songs: SceneSong[] // todas as músicas na ordem, para a gaveta do setlist
  onPrev?: () => void
  onNext?: () => void
  onJump: (index: number) => void
}
