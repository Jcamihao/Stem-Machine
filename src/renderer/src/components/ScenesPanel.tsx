import { useRef, useState } from 'react'
import type { Scene, Song } from '../../../shared/types'
import { copyName, filterSongs, fmtTotal, moveSong, moveTo, newSceneId, removeSong, todayName } from '../lib/scenes'

export type SongMeta = Record<string, { bpm: number | null; key: string | null; keyShift: string | null }>

interface Props {
  songs: Song[]
  scenes: Scene[]
  meta: SongMeta
  autoAdvance: boolean
  padBetween: boolean
  onSave: (scenes: Scene[]) => void
  onAutoAdvance: (on: boolean) => void
  onPadBetween: (on: boolean) => void
  onPlay: (scene: Scene) => void
  onClose: () => void
}

const fmtDur = (s: number): string => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '–')

// setlist do dia: monta a lista de músicas (busca, várias de uma vez, arrastar), duplica de outro
// dia e toca em sequência. Cada linha mostra tom (com a transposição salva), BPM e duração
export function ScenesPanel({ songs, scenes, meta, autoAdvance, padBetween, onSave, onAutoAdvance, onPadBetween, onPlay, onClose }: Props): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(scenes[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const dragFrom = useRef<number | null>(null) // origem do arrasto: não depende de re-renderizar entre os eventos
  const scene = scenes.find((s) => s.id === selectedId) ?? null
  const byId = new Map(songs.map((s) => [s.videoId, s]))
  const btn = 'no-drag h-8 px-3 rounded-md bg-[#262626] text-[12px] font-semibold text-white hover:bg-[#333] disabled:opacity-35 disabled:hover:bg-[#262626]'

  const update = (patch: Partial<Scene>): void => {
    if (scene) onSave(scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)))
  }
  const add = (list: Scene[], name: string, songIds: string[] = []): void => {
    const created: Scene = { id: newSceneId(), name, songs: songIds }
    onSave([...list, created])
    setSelectedId(created.id)
  }
  const create = (): void => {
    const name = newName.trim()
    if (!name) return
    add(scenes, name)
    setNewName('')
  }
  const remove = (): void => {
    if (!scene || !window.confirm(`Apagar o setlist "${scene.name}"? As músicas continuam na biblioteca.`)) return
    const rest = scenes.filter((s) => s.id !== scene.id)
    onSave(rest)
    setSelectedId(rest[0]?.id ?? null)
  }
  const playable = scene ? scene.songs.filter((id) => byId.has(id)).length : 0
  const total = scene ? scene.songs.reduce((sum, id) => sum + (byId.get(id)?.duration ?? 0), 0) : 0
  const results = filterSongs(songs.map((s) => ({ ...s, title: s.title || s.videoId })), query)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[860px] max-w-[96vw] h-[600px] max-h-[92vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl flex flex-col text-white">
        <div className="h-14 shrink-0 flex items-center px-5 border-b border-white/10">
          <h2 className="flex-1 text-[15px] font-bold">Setlist</h2>
          <button onClick={onClose} title="Fechar" className="no-drag text-white/60 hover:text-white text-[18px] leading-none">×</button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="w-[230px] shrink-0 border-r border-white/10 p-3 flex flex-col gap-2">
            <button onClick={() => add(scenes, todayName(new Date(), scenes.map((s) => s.name)))} className="no-drag h-9 rounded-md bg-emerald-400 text-black text-[13px] font-bold hover:bg-emerald-300">
              Setlist de hoje
            </button>
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Outro nome…"
                maxLength={80}
                className="no-drag flex-1 min-w-0 h-8 px-2 rounded-md bg-[#1e1e1e] text-[12px] outline-none placeholder:text-white/35"
              />
              <button onClick={create} disabled={!newName.trim()} className={btn}>+</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
              {scenes.length === 0 && <p className="text-[12px] text-white/40 p-1">Nenhum setlist. Clique em "Setlist de hoje".</p>}
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id)
                    setPicking(false)
                  }}
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
              <p className="text-[13px] text-white/45 m-auto">Crie ou escolha um setlist.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={scene.name}
                    onChange={(e) => update({ name: e.target.value })}
                    maxLength={80}
                    className="no-drag flex-1 min-w-0 h-9 px-3 rounded-md bg-[#1e1e1e] text-[14px] font-semibold outline-none"
                  />
                  <button onClick={() => add(scenes, copyName(scene.name, scenes.map((s) => s.name)), [...scene.songs])} title="Cria uma cópia para ajustar" className={`${btn} h-9`}>
                    Duplicar
                  </button>
                  <button onClick={() => onPlay(scene)} disabled={playable === 0} className="no-drag h-9 px-4 rounded-md bg-emerald-400 text-black text-[13px] font-bold hover:bg-emerald-300 disabled:opacity-35">
                    Tocar
                  </button>
                </div>

                {picking ? (
                  <div className="flex-1 min-h-0 flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar na biblioteca…"
                        className="no-drag flex-1 min-w-0 h-9 px-3 rounded-md bg-[#1e1e1e] text-[13px] outline-none placeholder:text-white/35"
                      />
                      <button onClick={() => { setPicking(false); setQuery('') }} className={`${btn} h-9`}>Pronto</button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
                      {results.length === 0 && <p className="text-[12px] text-white/40 p-1">Nenhuma música com esse nome.</p>}
                      {results.map((s) => {
                        const count = scene.songs.filter((id) => id === s.videoId).length
                        const m = meta[s.videoId]
                        return (
                          <button
                            key={s.videoId}
                            onClick={() => update({ songs: [...scene.songs, s.videoId] })}
                            title="Adicionar ao setlist"
                            className="no-drag flex items-center gap-2 px-2.5 h-10 rounded-md bg-[#1e1e1e] hover:bg-[#2a2a2a] text-left"
                          >
                            <span className="flex-1 min-w-0 truncate text-[13px]">{s.title}</span>
                            <span className="text-[11px] text-white/45 shrink-0">{[m?.keyShift, m?.bpm ? Math.round(m.bpm) : null].filter(Boolean).join(' · ')}</span>
                            {count > 0 && <span className="text-[11px] text-emerald-300 shrink-0">no setlist{count > 1 ? ` ×${count}` : ''}</span>}
                            <span className="w-6 h-6 rounded bg-[#262626] flex items-center justify-center shrink-0">+</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
                      {scene.songs.length === 0 && <p className="text-[12px] text-white/40 p-1">Setlist vazio. Clique em "Adicionar músicas".</p>}
                      {scene.songs.map((id, i) => {
                        const song = byId.get(id)
                        const m = meta[id]
                        return (
                          <div
                            key={`${id}-${i}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move'
                              dragFrom.current = i
                              setDrag({ from: i, over: i })
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              if (drag && drag.over !== i) setDrag({ ...drag, over: i })
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (dragFrom.current !== null) update({ songs: moveTo(scene.songs, dragFrom.current, i) })
                              dragFrom.current = null
                              setDrag(null)
                            }}
                            onDragEnd={() => {
                              dragFrom.current = null
                              setDrag(null)
                            }}
                            className={`flex items-center gap-2 px-2 h-11 rounded-md bg-[#1e1e1e] cursor-grab ${drag && drag.over === i && drag.from !== i ? 'ring-1 ring-emerald-400' : ''} ${drag?.from === i ? 'opacity-50' : ''}`}
                          >
                            <span className="w-5 text-[12px] text-white/40 text-right">{i + 1}</span>
                            <span className={`flex-1 min-w-0 truncate text-[13px] ${song ? '' : 'text-white/35 italic'}`}>{song ? song.title : 'Música removida da biblioteca'}</span>
                            {song && (
                              <span className="shrink-0 flex items-center gap-1.5 text-[11px]">
                                <span className="px-1.5 h-5 leading-5 rounded bg-[#2a2a2a] font-semibold min-w-[34px] text-center" title="Tom (com a transposição salva)">{m?.keyShift ?? '–'}</span>
                                <span className="text-white/55 w-[54px] text-right">{m?.bpm ? `${Math.round(m.bpm)} BPM` : '–'}</span>
                                <span className="text-white/45 w-[34px] text-right">{fmtDur(song.duration)}</span>
                              </span>
                            )}
                            <button onClick={() => update({ songs: moveSong(scene.songs, i, -1) })} disabled={i === 0} title="Subir" className="no-drag w-6 h-6 rounded bg-[#262626] hover:bg-[#333] disabled:opacity-30 text-[11px]">▲</button>
                            <button onClick={() => update({ songs: moveSong(scene.songs, i, 1) })} disabled={i === scene.songs.length - 1} title="Descer" className="no-drag w-6 h-6 rounded bg-[#262626] hover:bg-[#333] disabled:opacity-30 text-[11px]">▼</button>
                            <button onClick={() => update({ songs: removeSong(scene.songs, i) })} title="Tirar do setlist" className="no-drag w-6 h-6 rounded bg-[#262626] hover:bg-rose-500/30 text-rose-200 text-[11px]">✕</button>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPicking(true)} className={`${btn} h-9`}>Adicionar músicas</button>
                      <span className="flex-1 text-[12px] text-white/45">
                        {scene.songs.length} {scene.songs.length === 1 ? 'música' : 'músicas'}
                        {total > 0 && ` · ${fmtTotal(total)}`}
                      </span>
                      <button onClick={remove} className="no-drag h-8 px-3 rounded-md text-[12px] font-semibold text-rose-300/90 hover:bg-rose-500/15">Apagar setlist</button>
                    </div>
                  </>
                )}
                <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer select-none">
                  <input type="checkbox" checked={autoAdvance} onChange={(e) => onAutoAdvance(e.target.checked)} className="no-drag accent-white" />
                  Ao fim da música, abrir a próxima do setlist sozinho
                </label>
                <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer select-none" title="Ao passar para a próxima música (você aperta ▶), o pad entra no tom dela e some quando você der play">
                  <input type="checkbox" checked={padBetween} onChange={(e) => onPadBetween(e.target.checked)} className="no-drag accent-white" />
                  Pad entre as músicas (no tom da próxima)
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
