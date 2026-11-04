import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../../../shared/types'
import { isLocalId } from '../../../shared/local'
import { SongThumb } from '../lib/thumbs'
import { SmIcon } from './SmIcon'
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
  const item = 'no-drag w-full flex items-center gap-2.5 text-left px-2.5 py-[9px] rounded-lg text-[13px] font-semibold hover:bg-btn2'
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`no-drag w-8 h-8 rounded-full grid place-items-center text-[#d6d6da] hover:bg-ln2 ${open ? 'bg-ln2' : ''}`}
      >
        <SmIcon name="more" size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-[220px] bg-chip border border-ln3 rounded-xl p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.6)] flex flex-col gap-0.5">
          <button className={`${item} text-[#e6e6e8]`} onClick={() => { setOpen(false); onOpen() }}>
            <SmIcon name="play" size={16} /> Abrir
          </button>
          {!isLocalId(song.videoId) && (
            <button
              className={`${item} text-[#e6e6e8]`}
              onClick={() => {
                setOpen(false)
                window.stemkit.openExternal(`https://www.youtube.com/watch?v=${song.videoId}`)
              }}
            >
              <SmIcon name="ext" size={16} /> Abrir no YouTube
            </button>
          )}
          <div className="h-px bg-ln2 mx-1.5 my-0.5" />
          <button className={`${item} text-bad2`} onClick={() => { setOpen(false); onDelete() }}>
            <SmIcon name="trash" size={16} /> Excluir
          </button>
        </div>
      )}
    </div>
  )
}

/* biblioteca: barra lateral (navegação e painéis) e tabela de músicas em cartão: título (capa, nome,
   origem), data, gênero, BPM, tom, duração. Tom vem dos acordes; gênero ainda não é detectado ("–") */
const COLS = 'grid-cols-[28px_48px_minmax(0,1fr)_120px_110px_80px_70px_80px_40px]'

function NavItem({ icon, label, onClick, trailing }: { icon: React.ComponentProps<typeof SmIcon>['name']; label: string; onClick?: () => void; trailing?: React.ReactNode }): React.ReactElement {
  const on = !onClick
  return (
    <button
      onClick={onClick}
      disabled={on}
      className={`no-drag flex items-center gap-3 h-10 px-3 rounded-[10px] text-[14px] font-bold w-full text-left ${
        on ? 'bg-chip text-fg cursor-default' : 'text-[#c6c6cc] hover:bg-chip hover:text-fg'
      }`}
    >
      <SmIcon name={icon} size={16} />
      {label}
      {trailing}
    </button>
  )
}

export function Library({ songs, pending, appVersion, onSelect, onDelete, onAdd, onOpenScenes, onOpenMidi, onOpenRemote, onOpenSettings }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'date', asc: false })
  const [meta, setMeta] = useState<Record<string, { bpm: number | null; key: string | null; keyShift: string | null }>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string[] | null>(null)

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

  const header = (key: SortKey | null, label: string, cls = ''): React.ReactElement => {
    const active = !!key && sort.key === key
    return (
      <button
        disabled={!key}
        onClick={() => key && setSort((cur) => ({ key, asc: cur.key === key ? !cur.asc : key === 'title' }))}
        className={`no-drag flex items-center gap-1 text-left uppercase ${active ? 'text-acc2' : key ? 'text-dim hover:text-fg' : 'text-faint cursor-default'} ${cls}`}
      >
        {label}
        {active && <SmIcon name={sort.asc ? 'cu' : 'cd'} size={12} stroke={3} />}
      </button>
    )
  }

  const confirmTitle = (ids: string[]): string => (ids.length === 1 ? 'Excluir 1 música?' : `Excluir ${ids.length} músicas?`)
  const confirmBody = (ids: string[]): string => {
    const names = ids.map((id) => songs.find((s) => s.videoId === id)?.title || 'Sem título')
    const shown = names.slice(0, 2).map((n) => `“${n}”`).join(' e ')
    const extra = names.length > 2 ? ` e mais ${names.length - 2}` : ''
    return `${shown}${extra} e todos os stems ${ids.length === 1 ? 'dela' : 'delas'} serão apagados deste computador.`
  }
  const doDelete = (): void => {
    if (!confirming) return
    for (const id of confirming) onDelete(id)
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of confirming) next.delete(id)
      return next
    })
    setConfirming(null)
  }

  return (
    <div className="h-full flex bg-app text-fg">
      <aside className="w-[232px] shrink-0 flex flex-col gap-1.5 px-3.5 py-4 border-r border-[#1d1d21] bg-side">
        <div className="flex items-center gap-2.5 px-1.5 pb-3.5">
          <span className="w-[34px] h-[34px] rounded-[10px] bg-acc text-acc-ink grid place-items-center">
            <SmIcon name="split" size={18} />
          </span>
          <span className="text-[17px] font-extrabold tracking-[-0.01em]">Stem-Machine</span>
        </div>
        <button
          onClick={onAdd}
          className="no-drag flex items-center justify-center gap-2 h-[42px] rounded-full bg-acc text-acc-ink text-[14px] font-extrabold hover:bg-acc2 mb-3"
        >
          <SmIcon name="plus" size={16} /> Adicionar
        </button>
        <NavItem
          icon="note"
          label="Biblioteca"
          trailing={<span className="ml-auto font-mono text-[11px] font-semibold text-sub">{songs.length}</span>}
        />
        <NavItem icon="list" label="Setlist" onClick={onOpenScenes} />
        <NavItem icon="midi" label="MIDI" onClick={onOpenMidi} />
        <NavItem icon="phone" label="Celular" onClick={onOpenRemote} />
        <PadButton
          side
          className="no-drag flex items-center gap-3 h-10 px-3 rounded-[10px] border border-transparent text-[14px] font-bold text-[#c6c6cc] hover:bg-chip hover:text-fg w-full text-left"
        />
        <span className="flex-1" />
        <NavItem icon="gear" label="Configurações" onClick={onOpenSettings} />
        {appVersion && <div className="px-3 pt-2 font-mono text-[11px] font-medium text-dim">v{appVersion} · 100% local</div>}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col pb-4">
        <div className="flex items-center gap-2 pl-4 pr-5 py-3.5">
          <div className="flex items-center gap-3 mr-auto">
            <h1 className="text-[22px] font-extrabold tracking-[-0.01em]">Biblioteca</h1>
            <span className="font-mono text-[12px] text-sub bg-[#1a1a1e] border border-ln2 px-[9px] py-[3px] rounded-full">
              {songs.length} {songs.length === 1 ? 'arquivo' : 'arquivos'}
            </span>
          </div>
          {selected.size > 0 && (
            <button
              onClick={() => setConfirming([...selected])}
              className="no-drag inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-bad/[0.12] border border-bad/40 text-bad2 text-[13px] font-bold hover:bg-bad/20"
            >
              <SmIcon name="trash" size={16} /> Excluir {selected.size}
            </button>
          )}
          <div className="flex items-center gap-2 w-[220px] h-9 rounded-full bg-pop border border-ln2 px-3.5 text-dim">
            <SmIcon name="search" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar"
              className="no-drag flex-1 min-w-0 bg-transparent outline-none text-[13px] text-fg placeholder:text-dim"
            />
          </div>
          <button
            disabled
            title="Filtros — em breve"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-dashed border-[#2f2f35] text-[#5a5a62] text-[13px] font-semibold cursor-not-allowed"
          >
            <SmIcon name="filter" size={16} /> Filtros
            <span className="font-mono text-[10px] font-semibold bg-[#1d1d21] text-[#7a7a82] px-1.5 py-0.5 rounded-[5px]">em breve</span>
          </button>
          <button
            onClick={() => setSort((cur) => ({ ...cur, asc: !cur.asc }))}
            title="Inverter a ordem"
            className="no-drag w-9 h-9 rounded-full bg-pop border border-ln2 text-[#d6d6da] grid place-items-center hover:bg-btn"
          >
            <SmIcon name="sort" size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 mx-4 flex flex-col overflow-hidden rounded-[14px] bg-panel border border-ln">
          <div className={`grid ${COLS} items-center gap-x-3.5 px-4 py-3 font-mono text-[11px] font-semibold tracking-[0.06em] border-b border-ln shrink-0`}>
            <span />
            <span />
            {header('title', 'Título')}
            {header('date', 'Data')}
            <span className="text-faint uppercase whitespace-nowrap" title="Gênero — em breve">Gênero</span>
            {header('bpm', 'BPM')}
            <span className="text-dim uppercase">Tom</span>
            {header('duration', 'Duração')}
            <span />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {rows.length === 0 && (
              <div className="m-5 rounded-[14px] border border-dashed border-[#2f2f35] flex flex-col justify-center gap-[18px] px-12 py-14">
                <div className="text-[28px] font-extrabold tracking-[-0.02em] max-w-[420px]">
                  {songs.length === 0 ? 'Nenhuma música ainda — clique em Adicionar.' : 'Nenhuma música com esse nome.'}
                </div>
                {songs.length === 0 && (
                  <div>
                    <button
                      onClick={onAdd}
                      className="no-drag inline-flex items-center gap-2 h-10 px-[18px] rounded-full bg-acc text-acc-ink text-[14px] font-extrabold hover:bg-acc2"
                    >
                      <SmIcon name="plus" size={16} /> Adicionar
                    </button>
                  </div>
                )}
              </div>
            )}
            {rows.map((song) => {
              const p = pending[song.videoId]
              const checked = selected.has(song.videoId)
              const bpm = meta[song.videoId]?.bpm
              const subColor = p?.error ? 'text-bad2 font-bold' : p ? 'text-acc2 font-bold' : 'text-mute'
              return (
                <div
                  key={song.videoId}
                  onClick={() => onSelect(song.videoId)}
                  className={`group grid ${COLS} items-center gap-x-3.5 px-4 py-[9px] border-b border-chip cursor-pointer ${checked ? 'bg-acc/[0.08]' : 'hover:bg-chip'}`}
                >
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
                    className={`no-drag w-[18px] h-[18px] ${checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  />
                  <div className="w-11 h-11 rounded-[9px] overflow-hidden bg-chip border border-ln2 shrink-0">
                    <SongThumb videoId={song.videoId} className="w-full h-full object-cover" iconClassName="w-5 h-5 text-acc/70" />
                  </div>
                  <div className="min-w-0 flex flex-col gap-[3px]">
                    <div className="text-[15px] font-bold truncate">{song.title || 'Processando…'}</div>
                    <div className={`text-[12px] truncate flex items-center gap-2 ${subColor}`}>
                      {p && !p.error && (
                        <span className="animate-spin inline-flex">
                          <SmIcon name="loader" size={12} stroke={2.6} />
                        </span>
                      )}
                      {p?.error && <SmIcon name="alert" size={12} stroke={2.6} />}
                      {p ? p.label : isLocalId(song.videoId) ? 'Arquivo local' : 'YouTube'}
                    </div>
                  </div>
                  <span className="font-mono text-[13px] text-sub">{fmtDate(song.addedAt)}</span>
                  <span className="text-[13px] text-faint">–</span>
                  <span className="font-mono text-[14px] font-semibold">{bpm ? Math.round(bpm) : '–'}</span>
                  <span className="font-mono text-[14px] font-semibold text-acc2">{meta[song.videoId]?.key ?? '–'}</span>
                  <span className="font-mono text-[13px] text-[#d6d6da]">{fmtDuration(song.duration)}</span>
                  <RowMenu song={song} onOpen={() => onSelect(song.videoId)} onDelete={() => setConfirming([song.videoId])} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center" onMouseDown={(e) => e.target === e.currentTarget && setConfirming(null)}>
          <div className="w-[440px] max-w-[94vw] bg-pop border border-ln3 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-6 flex flex-col gap-3" role="dialog" aria-modal="true">
            <div className="text-[20px] font-extrabold">{confirmTitle(confirming)}</div>
            <div className="text-[14px] text-sub leading-normal">{confirmBody(confirming)}</div>
            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setConfirming(null)} className="no-drag h-[38px] px-4 rounded-full bg-btn border border-ln3 text-[#e6e6e8] font-bold hover:bg-btn2">
                Cancelar
              </button>
              <button onClick={doDelete} className="no-drag h-[38px] px-4 rounded-full bg-bad text-[#1a0207] font-extrabold hover:brightness-110">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
