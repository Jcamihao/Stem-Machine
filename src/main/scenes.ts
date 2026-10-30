// cenas (setlist): lista de músicas na ordem do culto/show. Só guarda os ids da
// biblioteca; o tom de cada música vem da mixagem salva dela
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { userDataDir } from './env'
import type { Scene } from '../shared/types'

function scenesFile(): string {
  return join(userDataDir(), 'scenes.json')
}

// valida o que vem do disco ou da interface: nada além de id, nome curto e ids de músicas
function clean(raw: unknown): Scene[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Scene[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const { id, name, songs } = r as Partial<Scene>
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Cena',
      songs: Array.isArray(songs) ? songs.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length < 200) : []
    })
  }
  return out
}

export function loadScenes(): Scene[] {
  try {
    return clean(JSON.parse(readFileSync(scenesFile(), 'utf8')))
  } catch {
    return []
  }
}

export function saveScenes(scenes: unknown): Scene[] {
  const next = clean(scenes)
  writeFileSync(scenesFile(), JSON.stringify(next, null, 2))
  return next
}
