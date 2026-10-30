import { useState } from 'react'
import type { Scene, Song } from '../../../shared/types'
import { moveSong, newSceneId, removeSong } from '../lib/scenes'

interface Props {
  songs: Song[]
  scenes: Scene[]
  autoAdvance: boolean
  onSave: (scenes: Scene[]) => void
  onAutoAdvance: (on: boolean) => void
  onPlay: (scene: Scene) => void
  onClose: () => void
}

// cenas (setlist): cria, ordena e toca uma lista de músicas em sequência
export function ScenesPanel({ songs, scenes, autoAdvance, onSave, onAutoAdvance, onPlay, onClose }: Props): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(scenes[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const scene = scenes.find((s) => s.id === selectedId) ?? null
  const byId = new Map(songs.map((s) => [s.videoId, s]))
  const btn = 'no-drag h-8 px-3 rounded-md bg-[#262626] text-[12px] font-semibold text-white hover:bg-[#333] disabled:opacity-35 disabled:hover:bg-[#262626]'

  const update = (patch: Partial<Scene>): void => {
    if (scene) onSave(scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)))
  }
  const create = (): void => {
    const name = newName.trim()
    if (!name) return
    const created: Scene = { id: newSceneId(), name, songs: [] }
    onSave([...scenes, created])
    setSelectedId(created.id)
    setNewName('')
  }
  const remove = (): void => {
    if (!scene || !window.confirm(`Apagar a cena "${scene.name}"? As músicas continuam na biblioteca.`)) return
    const rest = scenes.filter((s) => s.id !== scene.id)
    onSave(rest)
    setSelectedId(rest[0]?.id ?? null)
  }
  const playable = scene ? scene.songs.filter((id) => byId.has(id)).length : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[760px] max-w-[94vw] h-[520px] max-h-[90vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl flex flex-col text-white">
        <div className="h-14 shrink-0 flex items-center px-5 border-b border-white/10">
          <h2 className="flex-1 text-[15px] font-bold">Cenas</h2>
          <button onClick={onClose} title="Fechar" className="no-drag text-white/60 hover:text-white text-[18px] leading-none">×</button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="w-[230px] shrink-0 border-r border-white/10 p-3 flex flex-col gap-2">
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Nova cena…"
                maxLength={80}
                className="no-drag flex-1 min-w-0 h-8 px-2 rounded-md bg-[#1e1e1e] text-[12px] outline-none placeholder:text-white/35"
              />
              <button onClick={create} disabled={!newName.trim()} className={btn}>+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
              {scenes.length === 0 && <p className="text-[12px] text-white/40 p-1">Nenhuma cena. Dê um nome e clique em +.</p>}
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`no-drag text-left px-2.5 py-2 rounded-md text-[13px] ${s.id === selectedId ? 'bg-white text-black font-semibold' : 'bg-[#1e1e1e] text-white/85 hover:bg-[#2a2a2a]'}`}
                >
                  <div className="truncate">{s.name}</div>
                  <div className={`text-[11px] ${s.id === selectedId ? 'text-black/55' : 'text-white/40'}`}>
                    {s.songs.length} {s.songs.length === 1 ? 'música' : 'músicas'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 p-4 flex flex-col gap-3">
            {!scene ? (
              <p className="text-[13px] text-white/45 m-auto">Crie ou escolha uma cena.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={scene.name}
                    onChange={(e) => update({ name: e.target.value })}
                    maxLength={80}
                    className="no-drag flex-1 min-w-0 h-9 px-3 rounded-md bg-[#1e1e1e] text-[14px] font-semibold outline-none"
                  />
                  <button onClick={() => onPlay(scene)} disabled={playable === 0} className="no-drag h-9 px-4 rounded-md bg-emerald-400 text-black text-[13px] font-bold hover:bg-emerald-300 disabled:opacity-35">
                    Tocar cena
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
                  {scene.songs.length === 0 && <p className="text-[12px] text-white/40 p-1">Cena vazia. Adicione músicas abaixo.</p>}
                  {scene.songs.map((id, i) => {
                    const song = byId.get(id)
                    return (
                      <div key={`${id}-${i}`} className="flex items-center gap-2 px-2 h-10 rounded-md bg-[#1e1e1e]">
                        <span className="w-5 text-[12px] text-white/40 text-right">{i + 1}</span>
                        <span className={`flex-1 min-w-0 truncate text-[13px] ${song ? '' : 'text-white/35 italic'}`}>{song ? song.title : 'Música removida da biblioteca'}</span>
                        <button onClick={() => update({ songs: moveSong(scene.songs, i, -1) })} disabled={i === 0} title="Subir" className="no-drag w-7 h-7 rounded bg-[#262626] hover:bg-[#333] disabled:opacity-30">▲</button>
                        <button onClick={() => update({ songs: moveSong(scene.songs, i, 1) })} disabled={i === scene.songs.length - 1} title="Descer" className="no-drag w-7 h-7 rounded bg-[#262626] hover:bg-[#333] disabled:opacity-30">▼</button>
                        <button onClick={() => update({ songs: removeSong(scene.songs, i) })} title="Tirar da cena" className="no-drag w-7 h-7 rounded bg-[#262626] hover:bg-rose-500/30 text-rose-200">✕</button>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => e.target.value && update({ songs: [...scene.songs, e.target.value] })}
                    className="no-drag flex-1 min-w-0 h-8 px-2 rounded-md bg-[#262626] text-[12px] font-semibold outline-none"
                  >
                    <option value="">Adicionar música…</option>
                    {songs.map((s) => (
                      <option key={s.videoId} value={s.videoId}>{s.title || s.videoId}</option>
                    ))}
                  </select>
                  <button onClick={remove} className="no-drag h-8 px-3 rounded-md text-[12px] font-semibold text-rose-300/90 hover:bg-rose-500/15">Apagar cena</button>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer select-none">
                  <input type="checkbox" checked={autoAdvance} onChange={(e) => onAutoAdvance(e.target.checked)} className="no-drag accent-white" />
                  Ao fim da música, abrir a próxima da cena sozinho
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
