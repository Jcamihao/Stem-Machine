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

// painel que abre embaixo de um chip (velocidade, tom)
function Popover({ label, className, children }: { label: React.ReactNode; className: string; children: React.ReactNode }): React.ReactElement {
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
        {label}
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 w-[260px] bg-[#1c1c1c] border border-white/10 rounded-lg p-4 shadow-2xl">
          {children}
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
  speed: number
  onSpeed: (v: number) => void
  semitones: number
  onSemitones: (v: number) => void
  exportItems: MenuItem[]
  menuItems: MenuItem[]
  outputSplit?: boolean
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
        <Popover
          className={`${chip} ${p.speed !== 1 ? 'ring-1 ring-amber-300' : ''}`}
          label={
            <>
              <MetronomeIcon className="w-[18px] h-[18px]" /> {p.bpm ? Math.round(p.bpm) : '—'}
              {p.speed !== 1 && <span className="text-amber-300 text-[11px]">{Math.round(p.speed * 100)}%</span>}
              <ChevronIcon className="w-4 h-4 text-white/50" />
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold">Velocidade</span>
            <span className="text-[13px] tabular-nums text-amber-300">{Math.round(p.speed * 100)}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={150}
            step={5}
            value={Math.round(p.speed * 100)}
            onChange={(e) => p.onSpeed(parseInt(e.target.value, 10) / 100)}
            className="no-drag studio-volume w-full"
            style={{ background: `linear-gradient(to right, #fcd34d ${p.speed * 100 - 50}%, rgba(255,255,255,0.18) ${p.speed * 100 - 50}%)` }}
          />
          <div className="flex items-center justify-between mt-3 gap-2">
            {[-5, 5].map((d) => (
              <button
                key={d}
                onClick={() => p.onSpeed(Math.max(0.5, Math.min(1.5, Math.round(p.speed * 100 + d) / 100)))}
                className="no-drag flex-1 h-8 rounded-md bg-white/[0.07] hover:bg-white/15 text-[12px] font-semibold"
              >
                {d > 0 ? '+5%' : '−5%'}
              </button>
            ))}
            <button onClick={() => p.onSpeed(1)} className="no-drag flex-1 h-8 rounded-md bg-white/[0.07] hover:bg-white/15 text-[12px] font-semibold">
              Original
            </button>
          </div>
          <p className="text-[11px] text-white/40 mt-3 leading-relaxed">Muda só a velocidade; o tom continua igual. A primeira vez de cada valor leva alguns segundos.</p>
        </Popover>
        <Popover
          className={`${chip} ${p.semitones !== 0 ? 'ring-1 ring-amber-300' : ''}`}
          label={
            <>
              <TuneIcon className="w-[18px] h-[18px]" /> {p.semitones === 0 ? '—' : `${p.semitones > 0 ? '+' : ''}${p.semitones}`}
              <ChevronIcon className="w-4 h-4 text-white/50" />
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-semibold">Transpor</span>
            <span className="text-[13px] tabular-nums text-amber-300">
              {p.semitones === 0 ? 'original' : `${p.semitones > 0 ? '+' : ''}${p.semitones} semitom${Math.abs(p.semitones) > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => p.onSemitones(Math.max(-12, p.semitones - 1))} className="no-drag w-10 h-9 rounded-md bg-white/[0.07] hover:bg-white/15 text-[16px] font-bold">
              −
            </button>
            <div className="flex-1 text-center text-[20px] font-bold tabular-nums">{p.semitones > 0 ? `+${p.semitones}` : p.semitones}</div>
            <button onClick={() => p.onSemitones(Math.min(12, p.semitones + 1))} className="no-drag w-10 h-9 rounded-md bg-white/[0.07] hover:bg-white/15 text-[16px] font-bold">
              +
            </button>
          </div>
          <button onClick={() => p.onSemitones(0)} className="no-drag w-full h-8 mt-3 rounded-md bg-white/[0.07] hover:bg-white/15 text-[12px] font-semibold">
            Tom original
          </button>
          <p className="text-[11px] text-white/40 mt-3 leading-relaxed">Muda só o tom; a velocidade continua igual. Detectar o tom da música (ex.: G#m) ainda está no roadmap.</p>
        </Popover>
        <div className={chip} title="Compasso">
          <MeterIcon className="w-[18px] h-[18px]" /> {p.beatsPerBar ? `${p.beatsPerBar}/4` : '—'}
        </div>
        {p.outputSplit && (
          <div
            className="h-9 px-3 rounded-md bg-amber-300 text-black text-[12px] font-bold flex items-center"
            title="Saída L/R ligada: click e guia no L, música no R (desliga no menu ⋮ ou nas Configurações)"
          >
            L/R
          </div>
        )}
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
