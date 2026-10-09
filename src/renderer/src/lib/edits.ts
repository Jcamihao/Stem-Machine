import type { BeatGrid, Section } from '../../../shared/types'

const MIN_SECTION = 0.5 // segundos: uma seção nunca fica menor que isso

const nearestIndex = (times: number[], t: number): number => {
  let best = 0
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i
  return best
}

export const snapTo = (times: number[], t: number): number => (times.length ? times[nearestIndex(times, t)] : t)

/* "marcar o 1": a batida do click mais próxima de `at` vira o "1" e os compassos
   seguem de 4 em 4 a partir dela. Só daqui para frente (o que veio antes fica
   como estava) ou na música toda */
export function markDownbeat(grid: BeatGrid, at: number, wholeSong: boolean): BeatGrid {
  if (!grid.beats.length) return grid
  const perBar = grid.beatsPerBar || 4
  const i0 = nearestIndex(grid.beats, at)
  const t0 = grid.beats[i0]
  const kept = wholeSong ? [] : grid.downbeats.filter((t) => t < t0 - 0.05)
  const marked = grid.beats.filter((_, i) => (wholeSong || i >= i0) && (((i - i0) % perBar) + perBar) % perBar === 0)
  return { ...grid, edited: true, downbeats: [...kept, ...marked] }
}

// move o começo da seção i (e o fim da anterior junto), sem deixar nenhuma minúscula
export function moveBoundary(sections: Section[], i: number, t: number): Section[] {
  if (i <= 0 || i >= sections.length) return sections
  const lo = sections[i - 1].start + MIN_SECTION
  const hi = sections[i].end - MIN_SECTION
  const at = Math.max(lo, Math.min(hi, t))
  return sections.map((s, k) => (k === i - 1 ? { ...s, end: at } : k === i ? { ...s, start: at } : s))
}

// divide a seção que contém `t` em duas com o mesmo nome (depois é só renomear)
export function splitAt(sections: Section[], t: number): Section[] {
  const i = sections.findIndex((s) => t > s.start + MIN_SECTION && t < s.end - MIN_SECTION)
  if (i < 0) return sections
  const s = sections[i]
  return [...sections.slice(0, i), { ...s, end: t }, { ...s, start: t }, ...sections.slice(i + 1)]
}

// junta a seção i com a seguinte (fica o nome da primeira)
export function mergeWithNext(sections: Section[], i: number): Section[] {
  if (i < 0 || i >= sections.length - 1) return sections
  const merged = { ...sections[i], end: sections[i + 1].end }
  return [...sections.slice(0, i), merged, ...sections.slice(i + 2)]
}

// exclui a seção i: o tempo dela vai para a anterior (ou para a seguinte, se for a primeira)
export function removeSection(sections: Section[], i: number): Section[] {
  if (sections.length <= 1 || i < 0 || i >= sections.length) return sections
  if (i === 0) return [{ ...sections[1], start: sections[0].start }, ...sections.slice(2)]
  return sections
    .map((s, k) => (k === i - 1 ? { ...s, end: sections[i].end } : s))
    .filter((_, k) => k !== i)
}

export const renameSection = (sections: Section[], i: number, label: string): Section[] =>
  sections.map((s, k) => (k === i ? { ...s, label } : s))
