import { useRef, useState } from 'react'
import type { Scene, Song } from '../../../shared/types'
import { SmIcon } from './SmIcon'
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
  const btn = 'no-drag inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full bg-btn border border-ln3 text-[13px] font-bold text-[#e6e6e8] hover:bg-btn2 disabled:opacity-40 disabled:hover:bg-btn'

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
      <div className="w-[1080px] max-w-[96vw] h-[720px] max-h-[92vh] bg-pop border border-ln3 rounded-[18px] shadow-[0_30px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden text-fg">
        <div className="shrink-0 flex items-center px-[22px] py-[18px] border-b border-btn2">
          <h2 className="flex-1 text-[20px] font-extrabold">Setlist</h2>
          <button onClick={onClose} title="Fechar" className="no-drag w-[34px] h-[34px] rounded-full bg-btn border border-ln3 text-[#e6e6e8] grid place-items-center hover:bg-btn2">
            <SmIcon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-[300px_1fr]">
          <div className="border-r border-btn2 p-4 flex flex-col gap-2.5 bg-well min-h-0">
            <button onClick={() => add(scenes, todayName(new Date(), scenes.map((s) => s.name)))} className="no-drag flex items-center justify-center gap-2 h-[42px] rounded-full bg-acc text-acc-ink text-[14px] font-extrabold hover:bg-acc2">
              <SmIcon name="calendar" size={16} /> Setlist de hoje
            </button>
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="Outro nome…"
                maxLength={80}
                className="no-drag flex-1 min-w-0 h-[38px] px-3.5 rounded-full bg-pop border border-ln2 text-[13px] outline-none placeholder:text-dim focus:border-acc"
              />
              <button onClick={create} disabled={!newName.trim()} className={`${btn} !w-[38px] !px-0`}><SmIcon name="plus" size={16} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 mt-1.5">
              {scenes.length === 0 && <p className="text-[13px] text-sub p-1">Nenhum setlist ainda. Crie o de hoje ou dê um nome.</p>}
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id)
                    setPicking(false)
                  }}
                  className={`no-drag flex items-center gap-2.5 text-left px-3 py-2.5 rounded-[10px] border ${s.id === selectedId ? 'bg-acc/10 border-acc/45' : 'border-transparent hover:bg-chip'}`}
                >
                  <span className={s.id === selectedId ? 'text-acc2' : 'text-dim'}><SmIcon name="list" size={16} /></span>
                  <span className="flex-1 truncate text-[14px] font-bold">{s.name}</span>
                  <span className="font-mono text-[11px] font-semibold text-mute">{s.songs.length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 min-h-0 px-5 py-4 flex flex-col gap-3">
            {!scene ? (
              <p className="text-[14px] text-sub m-auto">Crie ou escolha um setlist.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    value={scene.name}
                    onChange={(e) => update({ name: e.target.value })}
                    maxLength={80}
                    className="no-drag flex-1 min-w-0 h-11 px-1 rounded-[10px] border border-transparent hover:border-ln2 focus:border-acc bg-transparent text-[22px] font-extrabold outline-none"
                  />
                  <button onClick={() => add(scenes, copyName(scene.name, scenes.map((s) => s.name)), [...scene.songs])} title="Cria uma cópia para ajustar" className={btn}>
                    <SmIcon name="copy" size={16} /> Duplicar
                  </button>
                  <button onClick={() => onPlay(scene)} disabled={playable === 0} className="no-drag inline-flex items-center gap-2 h-9 px-4 rounded-full bg-acc text-acc-ink text-[13px] font-extrabold hover:bg-acc2 disabled:bg-[#3a2117] disabled:text-[#7a4a35]">
                    <SmIcon name="play" size={16} /> Tocar
                  </button>
                </div>

                {picking ? (
                  <div className="flex-1 min-h-0 flex flex-col gap-2.5">
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 h-10 px-3.5 rounded-full bg-well border-[1.5px] border-acc text-[14px]">
                        <SmIcon name="search" size={16} className="text-dim" />
                        <input
                          autoFocus
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Buscar na biblioteca…"
                          className="no-drag flex-1 min-w-0 bg-transparent outline-none placeholder:text-dim"
                        />
                      </div>
                      <button onClick={() => { setPicking(false); setQuery('') }} className="no-drag h-10 px-[18px] rounded-full bg-acc text-acc-ink text-[13px] font-extrabold hover:bg-acc2">Pronto</button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                      {results.length === 0 && <p className="text-[13px] text-sub p-1">Nenhuma música com esse nome.</p>}
                      {results.map((s) => {
                        const count = scene.songs.filter((id) => id === s.videoId).length
                        const m = meta[s.videoId]
                        return (
                          <button
                            key={s.videoId}
                            onClick={() => update({ songs: [...scene.songs, s.videoId] })}
                            title="Adicionar ao setlist"
                            className="no-drag flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] bg-well hover:bg-chip text-left"
                          >
                            <span className="flex-1 min-w-0 truncate text-[14px] font-bold">{s.title}</span>
                            <span className="font-mono text-[11px] text-mute shrink-0">{[m?.keyShift, m?.bpm ? Math.round(m.bpm) : null].filter(Boolean).join(' · ')}</span>
                            {count > 0 && <span className="font-mono text-[11px] font-semibold text-vio2 shrink-0">no setlist{count > 1 ? ` ×${count}` : ''}</span>}
                            <span className="w-[30px] h-[30px] rounded-full bg-btn2 border border-ln4 grid place-items-center shrink-0"><SmIcon name="plus" size={13} stroke={2.6} /></span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[3px]">
                      {scene.songs.length === 0 && <p className="text-[13px] text-sub p-1">Setlist vazio. Clique em “Adicionar músicas”.</p>}
                      {scene.songs.map((id, i) => {
                        const song = byId.get(id)
                        const m = meta[id]
                        const dragging = drag?.from === i
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
                            className={`grid grid-cols-[18px_24px_minmax(0,1fr)_110px_52px_52px_100px] gap-2.5 items-center px-2.5 py-2 rounded-[10px] border cursor-grab ${
                              dragging ? 'bg-btn2 border-acc opacity-60' : drag && drag.over === i ? 'bg-well border-acc/60' : 'bg-well border-ln'
                            }`}
                          >
                            <span className="text-faint flex"><SmIcon name="grip" size={13} stroke={2.6} /></span>
                            <span className="font-mono text-[12px] font-semibold text-dim">{i + 1}</span>
                            <span className={`truncate text-[14px] font-bold ${song ? '' : 'text-dim italic font-medium'}`}>{song ? song.title : 'Música removida da biblioteca'}</span>
                            {song ? (
                              <>
                                <span className={`font-mono text-[12px] font-semibold ${m?.keyShift?.includes('→') ? 'text-vio2' : 'text-[#d6d6da]'}`} title="Tom (com a transposição salva)">{m?.keyShift ?? '–'}</span>
                                <span className="font-mono text-[12px] font-semibold text-[#d6d6da]">{m?.bpm ? Math.round(m.bpm) : '–'}</span>
                                <span className="font-mono text-[12px] text-sub">{fmtDur(song.duration)}</span>
                              </>
                            ) : (
                              <><span /><span /><span /></>
                            )}
                            <span className="flex gap-1 justify-end">
                              <button onClick={() => update({ songs: moveSong(scene.songs, i, -1) })} disabled={i === 0} title="Subir" className="no-drag w-7 h-7 rounded-lg bg-btn border border-ln3 text-[#d6d6da] grid place-items-center hover:bg-btn2 disabled:opacity-30"><SmIcon name="cu" size={13} stroke={2.6} /></button>
                              <button onClick={() => update({ songs: moveSong(scene.songs, i, 1) })} disabled={i === scene.songs.length - 1} title="Descer" className="no-drag w-7 h-7 rounded-lg bg-btn border border-ln3 text-[#d6d6da] grid place-items-center hover:bg-btn2 disabled:opacity-30"><SmIcon name="cd" size={13} stroke={2.6} /></button>
                              <button onClick={() => update({ songs: removeSong(scene.songs, i) })} title="Tirar do setlist" className="no-drag w-7 h-7 rounded-lg bg-btn border border-ln3 text-bad2 grid place-items-center hover:bg-bad/15"><SmIcon name="x" size={13} stroke={2.6} /></button>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <button onClick={() => setPicking(true)} className="no-drag flex items-center justify-center gap-2 h-10 rounded-[10px] border border-dashed border-[#3a3a40] text-[#d6d6da] text-[13px] font-bold hover:bg-chip">
                      <SmIcon name="plus" size={16} /> Adicionar músicas
                    </button>
                  </>
                )}
                <div className="flex items-center gap-3.5 flex-wrap border-t border-btn2 pt-3">
                  <span className="font-mono text-[12px] font-semibold text-[#d6d6da]">
                    {scene.songs.length} {scene.songs.length === 1 ? 'música' : 'músicas'}
                    {total > 0 && ` · ${fmtTotal(total)}`}
                  </span>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none">
                    <input type="checkbox" checked={autoAdvance} onChange={(e) => onAutoAdvance(e.target.checked)} className="no-drag w-[18px] h-[18px]" />
                    Ao fim da música, abrir a próxima do setlist sozinho
                  </label>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none" title="Ao passar para a próxima música (você aperta ▶), o pad entra no tom dela e some quando você der play">
                    <input type="checkbox" checked={padBetween} onChange={(e) => onPadBetween(e.target.checked)} className="no-drag w-[18px] h-[18px]" />
                    Pad entre as músicas (no tom da próxima)
                  </label>
                  <button onClick={remove} className="no-drag ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-bad/45 text-bad2 text-[12px] font-bold hover:bg-bad/10">
                    <SmIcon name="trash" size={13} stroke={2.6} /> Apagar setlist
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
