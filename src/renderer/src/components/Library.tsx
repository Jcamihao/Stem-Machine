import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../../../shared/types'
import { isLocalId } from '../../../shared/local'
import { SongThumb } from '../lib/thumbs'
import { MoreIcon } from './studio/icons'
import { PadButton } from './PadButton'

type SortKey = 'date' | 'title' | 'bpm' | 'duration'

const MONTHS = ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.']

// "Dez. 09, 2025" (addedAt é um instante em ms; o dia local é o certo aqui)
function fmtDate(ms: number): string {
  if (!ms) return '–'
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`
}

// "04:14"
function fmtDuration(seconds: number): string {
  if (!seconds) return '–'
  const s = Math.round(seconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  songs: Song[]
  pending: Record<string, { label: string; error?: boolean }>
  appVersion?: string
  onSelect: (videoId: string) => void
  onDelete: (videoId: string) => void
  onAdd: () => void
  onOpenScenes: () => void
  onOpenMidi: () => void
  onOpenRemote: () => void
  onOpenSettings: () => void
}

function RowMenu({ song, onOpen, onDelete }: { song: Song; onOpen: () => void; onDelete: () => void }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  const item = 'no-drag w-full text-left px-3 py-2 rounded-md text-[13px] hover:bg-white/10'
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="no-drag w-7 h-7 flex items-center justify-center text-white/60 hover:text-white">
        <MoreIcon className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 min-w-[180px] bg-[#1c1c1c] border border-white/10 rounded-lg p-1.5 shadow-2xl">
          <button className={`${item} text-white/85`} onClick={() => { setOpen(false); onOpen() }}>
            Abrir
          </button>
          {!isLocalId(song.videoId) && (
            <button
              className={`${item} text-white/85`}
              onClick={() => {
                setOpen(false)
                window.stemkit.openExternal(`https://www.youtube.com/watch?v=${song.videoId}`)
              }}
            >
              Abrir no YouTube
            </button>
          )}
          <button className={`${item} text-rose-300`} onClick={() => { setOpen(false); onDelete() }}>
            Excluir
          </button>
        </div>
      )}
    </div>
  )
}

/* biblioteca em tabela: título (capa, nome, origem), data, gênero, BPM, tom,
   duração. Tom vem dos acordes; gênero ainda não é detectado ("–") */
export function Library({ songs, pending, appVersion, onSelect, onDelete, onAdd, onOpenScenes, onOpenMidi, onOpenRemote, onOpenSettings }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'date', asc: false })
  const [meta, setMeta] = useState<Record<string, { bpm: number | null; key: string | null; keyShift: string | null }>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // BPM vem do arquivo de batidas de cada música: recarrega quando a lista muda
  const songKeys = songs.map((s) => `${s.videoId}:${s.model}`).join('|')
  useEffect(() => {
    void window.stemkit.libraryMeta().then(setMeta)
  }, [songKeys])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = songs.filter((s) => !q || s.title.toLowerCase().includes(q))
    const value = (s: Song): number | string => {
      if (sort.key === 'title') return s.title.toLowerCase()
      if (sort.key === 'bpm') return meta[s.videoId]?.bpm ?? 0
      if (sort.key === 'duration') return s.duration
      return s.addedAt || Number.MAX_SAFE_INTEGER // processando: no topo
    }
    return [...list].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sort.asc ? cmp : -cmp
    })
  }, [songs, query, sort, meta])

  const header = (key: SortKey | null, label: string, cls: string): React.ReactElement => (
    <button
      disabled={!key}
      onClick={() => key && setSort((cur) => ({ key, asc: cur.key === key ? !cur.asc : key === 'title' }))}
      className={`no-drag text-left text-[13px] text-white/60 ${key ? 'hover:text-white' : 'cursor-default'} ${cls}`}
    >
      {label}
      {key && sort.key === key && <span className="ml-1">{sort.asc ? '↑' : '↓'}</span>}
    </button>
  )

  const deleteSelected = (): void => {
    if (!window.confirm(`Excluir ${selected.size} música(s) da biblioteca? Os stems serão apagados.`)) return
    for (const id of selected) onDelete(id)
    setSelected(new Set())
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white">
      <div className="h-[84px] shrink-0 flex items-center gap-3 px-6">
        <h1 className="text-[26px] font-bold tracking-tight">Stem-Machine</h1>
        <span className="text-[16px] text-white/45 mt-1.5">
          {songs.length} {songs.length === 1 ? 'arquivo' : 'arquivos'}
        </span>
        <div className="flex-1" />
        {selected.size > 0 && (
          <button onClick={deleteSelected} className="no-drag h-8 px-3 rounded-md bg-rose-500/20 text-rose-200 text-[13px] font-semibold hover:bg-rose-500/30">
            Excluir {selected.size}
          </button>
        )}
        <div className="flex items-center gap-2 h-8 w-[300px] px-3 rounded-md bg-[#1e1e1e]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 text-white/50">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar"
            className="no-drag flex-1 bg-transparent outline-none text-[13px] placeholder:text-white/40"
          />
        </div>
        <button disabled title="Filtros — em breve" className="no-drag w-8 h-8 rounded-md bg-[#1e1e1e] text-white/35 flex items-center justify-center cursor-not-allowed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
        <button
          onClick={() => setSort((cur) => ({ ...cur, asc: !cur.asc }))}
          title="Inverter a ordem"
          className="no-drag w-8 h-8 rounded-md bg-[#1e1e1e] text-white/80 hover:text-white flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M8 4v16m0 0-4-4m4 4 4-4M16 20V4m0 0-4 4m4-4 4 4" />
          </svg>
        </button>
        <button onClick={onOpenScenes} title="Setlist: monte a ordem das músicas do dia" className="no-drag h-8 px-3 rounded-md bg-[#1e1e1e] text-[13px] font-semibold text-white hover:bg-[#2a2a2a]">
          Setlist
        </button>
        <button onClick={onOpenMidi} title="Controle MIDI: teclado ou pad controla o app" className="no-drag h-8 px-3 rounded-md bg-[#1e1e1e] text-[13px] font-semibold text-white hover:bg-[#2a2a2a]">
          MIDI
        </button>
        <button onClick={onOpenRemote} title="Celular: controle o app pelo navegador do celular" className="no-drag h-8 px-3 rounded-md bg-[#1e1e1e] text-[13px] font-semibold text-white hover:bg-[#2a2a2a]">
          Celular
        </button>
        <PadButton className="no-drag flex items-center gap-2 h-8 px-3 rounded-md bg-[#1e1e1e] text-[13px] font-semibold text-white hover:bg-[#2a2a2a]" />
        <button onClick={onOpenSettings} title="Configurações" className="no-drag w-8 h-8 rounded-md bg-[#1e1e1e] text-white/80 hover:text-white flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
        <button onClick={onAdd} className="no-drag flex items-center gap-2 h-8 px-3.5 rounded-md bg-white text-black text-[13px] font-semibold hover:bg-white/90">
          <span className="text-[18px] leading-none -mt-0.5">+</span> Adicionar
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_120px_110px_110px_110px_90px_36px] items-center gap-x-2 px-6 h-12 border-b border-white/10 shrink-0">
        {header('title', 'TÍTULO', 'pl-9 tracking-wide')}
        {header('date', 'Data', '')}
        {header(null, 'Gênero', '')}
        {header('bpm', 'BPM', '')}
        {header(null, 'Tom', '')}
        {header('duration', 'Duração', '')}
        <span />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {rows.length === 0 && (
          <div className="text-center text-white/40 text-[14px] mt-20">
            {songs.length === 0 ? 'Nenhuma música ainda — clique em Adicionar.' : 'Nenhuma música com esse nome.'}
          </div>
        )}
        {rows.map((song) => {
          const p = pending[song.videoId]
          const checked = selected.has(song.videoId)
          const bpm = meta[song.videoId]?.bpm
          const dim = p ? 'text-white/45' : 'text-white/55'
          return (
            <div
              key={song.videoId}
              onClick={() => onSelect(song.videoId)}
              className="group grid grid-cols-[minmax(0,1fr)_120px_110px_110px_110px_90px_36px] items-center gap-x-2 h-14 px-2 rounded-lg cursor-pointer hover:bg-white/[0.05]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={checked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(song.videoId)) next.delete(song.videoId)
                      else next.add(song.videoId)
                      return next
                    })
                  }
                  className={`no-drag w-3.5 h-3.5 accent-white ${checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                />
                <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1e1e1e] shrink-0">
                  <SongThumb videoId={song.videoId} className="w-full h-full object-cover" iconClassName="w-5 h-5 text-teal-400/70" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate">{song.title || 'Processando…'}</div>
                  <div className={`text-[12px] truncate ${p?.error ? 'text-rose-300' : 'text-white/45'}`}>
                    {p ? p.label : isLocalId(song.videoId) ? 'Arquivo local' : 'YouTube'}
                  </div>
                </div>
              </div>
              <span className={`text-[13px] ${dim}`}>{fmtDate(song.addedAt)}</span>
              <span className={`text-[13px] ${dim}`}>–</span>
              <span className={`text-[13px] ${dim}`}>{bpm ? Math.round(bpm) : '–'}</span>
              <span className={`text-[13px] ${dim}`}>{meta[song.videoId]?.key ?? '–'}</span>
              <span className={`text-[13px] ${dim}`}>{fmtDuration(song.duration)}</span>
              <RowMenu
                song={song}
                onOpen={() => onSelect(song.videoId)}
                onDelete={() => {
                  if (window.confirm(`Excluir "${song.title}" da biblioteca? Os stems serão apagados.`)) onDelete(song.videoId)
                }}
              />
            </div>
          )
        })}
      </div>
      {appVersion && <div className="h-7 shrink-0 px-6 text-[11px] text-white/30 flex items-center">v{appVersion} · 100% local</div>}
    </div>
  )
}
