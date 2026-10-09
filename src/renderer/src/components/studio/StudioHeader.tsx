import { useEffect, useRef, useState } from 'react'
import { SongThumb } from '../../lib/thumbs'
import { MetronomeIcon } from '../Icons'
import { BackIcon, SplitIcon, TuneIcon, MeterIcon, ExportIcon, MoreIcon, ChevronIcon } from './icons'

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

function Dropdown({ items, align = 'right', children, className }: { items: MenuItem[]; align?: 'left' | 'right'; children: React.ReactNode; className: string }): React.ReactElement {
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
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={className}>
        {children}
      </button>
      {open && (
        <div className={`absolute top-11 ${align === 'right' ? 'right-0' : 'left-0'} z-50 min-w-[200px] bg-[#1c1c1c] border border-white/10 rounded-lg p-1.5 shadow-2xl`}>
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className="no-drag w-full text-left px-3 py-2 rounded-md text-[13px] text-white/85 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  title: string
  videoId: string
  onBack: () => void
  canAddStems: boolean
  onAddStems: () => void
  bpm: number | null
  beatsPerBar: number | null
  exportItems: MenuItem[]
  menuItems: MenuItem[]
}

export function StudioHeader(p: Props): React.ReactElement {
  const chip = 'no-drag flex items-center gap-2 h-9 px-3 rounded-md bg-[#1e1e1e] text-[13px] font-semibold text-white hover:bg-[#2a2a2a]'
  return (
    <div className="h-[84px] shrink-0 flex items-center gap-4 px-5">
      <button onClick={p.onBack} title="Voltar para a biblioteca" className="no-drag text-white/80 hover:text-white">
        <BackIcon />
      </button>
      <div className="w-11 h-11 rounded-md overflow-hidden bg-[#1e1e1e] shrink-0">
        <SongThumb videoId={p.videoId} className="w-full h-full object-cover" />
      </div>
      <h1 className="flex-1 min-w-0 text-[15px] font-bold truncate">{p.title}</h1>
      <div className="flex items-center gap-2.5">
        <button onClick={p.onAddStems} disabled={!p.canAddStems} title="Adicionar faixas a esta música" className={`${chip} disabled:opacity-40`}>
          <SplitIcon className="w-[18px] h-[18px]" /> Separar faixas
        </button>
        <div className={chip} title="Andamento detectado (ajuste 0.5x/1x/2x na faixa do metrônomo)">
          <MetronomeIcon className="w-[18px] h-[18px]" /> {p.bpm ? Math.round(p.bpm) : '—'} <ChevronIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className={`${chip} opacity-45 cursor-not-allowed`} title="Tom da música — em breve">
          <TuneIcon className="w-[18px] h-[18px]" /> — <ChevronIcon className="w-4 h-4 text-white/50" />
        </div>
        <div className={chip} title="Compasso">
          <MeterIcon className="w-[18px] h-[18px]" /> {p.beatsPerBar ? `${p.beatsPerBar}/4` : '—'}
        </div>
        <Dropdown items={p.exportItems} className="no-drag flex items-center gap-2 h-9 px-3.5 rounded-md border-2 border-white/90 text-[13px] font-semibold text-white hover:bg-white/10">
          <ExportIcon className="w-[18px] h-[18px]" /> Exportar
        </Dropdown>
        <Dropdown items={p.menuItems} className="no-drag w-8 h-9 flex items-center justify-center text-white/85 hover:text-white">
          <MoreIcon />
        </Dropdown>
      </div>
    </div>
  )
}
