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
