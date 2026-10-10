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
        <div className="absolute top-11 right-0 z-50 w-[300px] bg-[#1a1a1a] border border-white/10 rounded-xl p-5 shadow-2xl">
          {children}
        </div>
      )}
    </div>
  )
}

// nome clássico do andamento (o painel de BPM mostra junto do número)
function tempoName(bpm: number): string {
  if (bpm < 40) return 'Grave'
  if (bpm < 60) return 'Largo'
  if (bpm < 66) return 'Larghetto'
  if (bpm < 76) return 'Adagio'
  if (bpm < 108) return 'Andante'
  if (bpm < 120) return 'Moderato'
  if (bpm < 156) return 'Allegro'
  if (bpm < 176) return 'Vivace'
  if (bpm < 200) return 'Presto'
  return 'Prestissimo'
}

// − [valor] + no estilo dos painéis de BPM e tom
function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }): React.ReactElement {
  const btn = 'no-drag w-16 h-16 rounded-lg bg-[#262626] hover:bg-[#333] text-[28px] font-light text-white/90 flex items-center justify-center'
  return (
    <div className="flex items-center gap-2">
      <button onClick={onMinus} className={btn}>−</button>
      <div className="flex-1 h-16 rounded-lg bg-[#262626] flex items-center justify-center text-[24px] font-semibold tabular-nums">{value}</div>
      <button onClick={onPlus} className={btn}>+</button>
    </div>
  )
}

interface Props {
  title: string
  videoId: string
  onBack: () => void
  canAddStems: boolean
  onAddStems: () => void
  baseBpm: number | null // BPM detectado (com 0.5x/2x do metrônomo), antes da velocidade
  beatsPerBar: number | null
  speed: number
  onSpeed: (v: number) => void
  onBpmStep: (delta: number) => void // soma ao valor mais recente (cliques rápidos não se perdem)
  semitones: number
  onSemitones: (v: number) => void
  onSemitoneStep: (delta: number) => void
  tuningHz: number
  onTuning: (hz: number) => void
  keyLabel: string | null // tom detectado, já com a transposição
  originalKey: string | null
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
              <MetronomeIcon className="w-[18px] h-[18px]" /> {p.baseBpm ? Math.round(p.baseBpm * p.speed) : '—'}
              <ChevronIcon className="w-4 h-4 text-white/50" />
            </>
          }
        >
          <p className="text-center text-[14px] font-bold mb-5">BPM</p>
          {p.baseBpm ? (
            <>
              <p className="text-[13px] font-semibold mb-2">{tempoName(p.baseBpm * p.speed)}</p>
              <Stepper
                value={String(Math.round(p.baseBpm * p.speed))}
                // 1 BPM por clique; a velocidade fica entre 50% e 150% da original
                onMinus={() => p.onBpmStep(-1)}
                onPlus={() => p.onBpmStep(1)}
              />
            </>
          ) : (
            <p className="text-[12px] text-white/50 text-center">Detectando batidas…</p>
          )}
          <button onClick={() => p.onSpeed(1)} className="no-drag w-full mt-4 text-[13px] text-white/45 hover:text-white">
            Redefinir
          </button>
        </Popover>
        <Popover
          className={`${chip} ${p.semitones !== 0 || p.tuningHz !== 440 ? 'ring-1 ring-amber-300' : ''}`}
          label={
            <>
              <TuneIcon className="w-[18px] h-[18px]" />{' '}
              {p.keyLabel ?? (p.semitones === 0 ? '—' : `${p.semitones > 0 ? '+' : ''}${p.semitones}`)}
              <ChevronIcon className="w-4 h-4 text-white/50" />
            </>
          }
        >
          <p className="text-center text-[14px] font-bold mb-3">Tom da Música</p>
          <div className="flex items-center justify-center gap-2 mb-5 text-[13px] text-white/55">
            Afinação (Hz):
            <select
              value={p.tuningHz}
              onChange={(e) => p.onTuning(parseInt(e.target.value, 10))}
              className="no-drag bg-transparent text-white font-semibold outline-none cursor-pointer"
            >
              {Array.from({ length: 21 }, (_, i) => 430 + i).map((hz) => (
                <option key={hz} value={hz} className="bg-[#1a1a1a]">
                  {hz}
                </option>
              ))}
            </select>
          </div>
          <Stepper
            // nota do tom (dos acordes); sem acordes ainda, mostra a transposição
            value={p.keyLabel ?? (p.semitones === 0 ? 'Original' : `${p.semitones > 0 ? '+' : ''}${p.semitones}`)}
            onMinus={() => p.onSemitoneStep(-1)}
            onPlus={() => p.onSemitoneStep(1)}
          />
          {p.originalKey && (
            <p className="text-center text-[12px] text-white/45 mt-3">
              Original: {p.originalKey}
              {p.semitones !== 0 && ` (${p.semitones > 0 ? '+' : ''}${p.semitones} ${Math.abs(p.semitones) > 1 ? 'semitons' : 'semitom'})`}
            </p>
          )}
          <button
            onClick={() => {
              p.onSemitones(0)
              p.onTuning(440)
            }}
            className="no-drag w-full mt-4 text-[13px] text-white/45 hover:text-white"
          >
            Redefinir
          </button>
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
