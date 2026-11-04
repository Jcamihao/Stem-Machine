import { useEffect, useRef, useState } from 'react'
import { SongThumb } from '../../lib/thumbs'
import { PadButton } from '../PadButton'
import { SmIcon } from '../SmIcon'

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

function Dropdown({ items, align = 'right', children, className, width = 'min-w-[260px]' }: { items: MenuItem[]; align?: 'left' | 'right'; children: React.ReactNode; className: string; width?: string }): React.ReactElement {
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
        <div className={`absolute top-11 ${align === 'right' ? 'right-0' : 'left-0'} z-50 ${width} max-w-[380px] bg-chip border border-ln3 rounded-[14px] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)] flex flex-col gap-px`}>
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className="no-drag w-full text-left px-2.5 py-[9px] rounded-lg text-[13px] font-semibold text-[#e6e6e8] hover:bg-btn2 disabled:opacity-35 disabled:hover:bg-transparent"
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
        <div className="absolute top-12 right-0 z-50 w-[300px] bg-chip border border-ln3 rounded-2xl p-[18px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] flex flex-col gap-4">
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

// − [valor] + em pílula, no estilo dos painéis de BPM e tom
function Stepper({ value, sub, mono = true, tone, onMinus, onPlus }: { value: string; sub?: string; mono?: boolean; tone?: string; onMinus: () => void; onPlus: () => void }): React.ReactElement {
  const btn = 'no-drag w-11 h-11 rounded-full bg-btn2 hover:bg-ln4 text-fg grid place-items-center'
  return (
    <div className="flex items-center justify-between bg-well border border-btn2 rounded-full p-[5px]">
      <button onClick={onMinus} className={btn}><SmIcon name="minus" size={16} /></button>
      <span className="flex flex-col items-center">
        <span className={`text-[30px] font-bold leading-tight ${mono ? 'font-mono' : ''} ${tone ?? ''}`}>{value}</span>
        {sub && <span className="font-mono text-[10px] text-mute">{sub}</span>}
      </span>
      <button onClick={onPlus} className={btn}><SmIcon name="plus" size={16} /></button>
    </div>
  )
}

const resetBtn = 'no-drag h-[30px] px-3 rounded-full bg-btn2 border border-ln4 text-[#e6e6e8] text-[12px] font-bold hover:bg-ln4'

interface Props {
  title: string
  videoId: string
  source?: string // "YouTube" ou "Arquivo local"
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
  scene?: {
    name: string
    index: number
    total: number
    onPrev?: () => void
    onNext?: () => void
    onOpen: () => void // abre a gaveta do setlist
    next?: { title: string; key: string | null; bpm: number | null } // a seguinte, para se preparar
  }
}

export function StudioHeader(p: Props): React.ReactElement {
  const pill = 'no-drag inline-flex items-center gap-[7px] h-9 px-[13px] rounded-full bg-pop border border-ln2 text-[13px] font-bold text-[#e6e6e8] hover:bg-btn disabled:opacity-40 disabled:hover:bg-pop'
  const chip = 'no-drag inline-flex items-center gap-2 h-10 px-3.5 rounded-xl bg-chip border border-ln4 text-fg hover:bg-btn'
  const pct = Math.round(p.speed * 100)
  return (
    <div className="h-16 shrink-0 flex items-center gap-2 px-4 border-b border-[#1d1d21]">
      <button onClick={p.onBack} title="Voltar para a biblioteca" className="no-drag w-9 h-9 rounded-full bg-pop border border-ln2 text-[#e6e6e8] grid place-items-center hover:bg-btn">
        <SmIcon name="back" size={16} />
      </button>
      <div className="w-10 h-10 rounded-[9px] overflow-hidden bg-chip border border-acc shrink-0">
        <SongThumb videoId={p.videoId} className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col gap-px min-w-0 max-w-[260px] mr-2.5">
        <h1 className="text-[16px] font-extrabold truncate" title={p.title}>{p.title}</h1>
        {p.source && <span className="text-[11px] text-mute truncate">{p.source}</span>}
      </div>
      {p.scene && (
        <div className="flex items-center gap-1 bg-well border border-btn2 rounded-full p-[3px] min-w-0">
          <button onClick={p.scene.onPrev} disabled={!p.scene.onPrev} title="Música anterior do setlist" className="no-drag w-[30px] h-[30px] rounded-full bg-btn text-[#e6e6e8] grid place-items-center hover:bg-btn2 disabled:opacity-30">
            <SmIcon name="prev" size={12} stroke={2.8} />
          </button>
          <button onClick={p.scene.onOpen} title="Abrir o setlist: pular para qualquer música" className="no-drag inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-btn2 text-fg text-[12px] font-bold hover:bg-ln4">
            <SmIcon name="list" size={12} stroke={2.8} />
            <span className="max-w-[130px] truncate">{p.scene.name}</span>
            <span className="font-mono text-[11px] font-semibold text-acc3">{p.scene.index + 1}/{p.scene.total}</span>
          </button>
          <button onClick={p.scene.onNext} disabled={!p.scene.onNext} title="Próxima música do setlist" className="no-drag w-[30px] h-[30px] rounded-full bg-btn text-[#e6e6e8] grid place-items-center hover:bg-btn2 disabled:opacity-30">
            <SmIcon name="next" size={12} stroke={2.8} />
          </button>
          {p.scene.next && (
            <span className="hidden xl:block max-w-[260px] truncate text-[12px] text-sub pl-1.5 pr-2.5 whitespace-nowrap" title="A próxima música do setlist">
              Próxima: <b className="text-fg">{p.scene.next.title}</b>{' '}
              <span className="font-mono text-vio">{[p.scene.next.key, p.scene.next.bpm ? Math.round(p.scene.next.bpm) : null].filter(Boolean).join(' · ')}</span>
            </span>
          )}
        </div>
      )}
      <span className="flex-1" />
      <div className="flex items-center gap-2">
        <button onClick={p.onAddStems} disabled={!p.canAddStems} title="Adicionar faixas a esta música" className={pill}>
          <SmIcon name="split" size={16} /> Separar faixas
        </button>
        <Popover
          className={`${chip} ${p.speed !== 1 ? '!border-warn' : ''}`}
          label={
            <>
              <span className="text-warn flex"><SmIcon name="metro" size={16} /></span>
              <span className="font-mono text-[18px] font-bold">{p.baseBpm ? Math.round(p.baseBpm * p.speed) : '—'}</span>
              <span className="text-[10px] font-bold text-mute">BPM</span>
            </>
          }
        >
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-bold text-sub">Andamento</span>
            <span className="text-[13px] font-extrabold text-warn">{p.baseBpm ? tempoName(p.baseBpm * p.speed) : '—'}</span>
          </div>
          {p.baseBpm ? (
            <>
              <Stepper
                value={String(Math.round(p.baseBpm * p.speed))}
                sub={`${pct}% da original (${Math.round(p.baseBpm)})`}
                // 1 BPM por clique; a velocidade fica entre 50% e 150% da original
                onMinus={() => p.onBpmStep(-1)}
                onPlus={() => p.onBpmStep(1)}
              />
              <div className="h-[5px] rounded-full bg-btn2 relative mb-3">
                <div className="absolute h-full bg-warn" style={{ left: `${Math.min(50, (pct - 50) / 1)}%`, width: `${Math.abs(pct - 100) / 1}%` }} />
                <span className="absolute left-0 top-2.5 font-mono text-[10px] text-dim">50%</span>
                <span className="absolute right-0 top-2.5 font-mono text-[10px] text-dim">150%</span>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-sub flex items-center gap-1.5">
              <span className="animate-spin inline-flex text-acc2"><SmIcon name="loader" size={12} stroke={2.8} /></span> Detectando batidas…
            </p>
          )}
          <div className="flex justify-end">
            <button onClick={() => p.onSpeed(1)} className={resetBtn}>Redefinir</button>
          </div>
        </Popover>
        <Popover
          className={`${chip} ${p.semitones !== 0 || p.tuningHz !== 440 ? '!border-vio' : ''}`}
          label={
            <>
              <span className="text-vio flex"><SmIcon name="note" size={16} /></span>
              <span className="font-mono text-[18px] font-bold">{p.keyLabel ?? (p.semitones === 0 ? '—' : `${p.semitones > 0 ? '+' : ''}${p.semitones}`)}</span>
              <span className="font-mono text-[10px] font-semibold text-mute">{p.semitones > 0 ? '+' : ''}{p.semitones}</span>
            </>
          }
        >
          <p className="text-[15px] font-extrabold">Tom da Música</p>
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[12px] font-bold text-sub">Afinação</span>
            <span className="inline-flex items-center h-8 px-3 rounded-lg bg-well border border-ln2 font-mono text-[13px] font-semibold">
              <select
                value={p.tuningHz}
                onChange={(e) => p.onTuning(parseInt(e.target.value, 10))}
                className="no-drag bg-transparent text-fg outline-none cursor-pointer"
              >
                {Array.from({ length: 21 }, (_, i) => 430 + i).map((hz) => (
                  <option key={hz} value={hz} className="bg-[#1a1a1a]">
                    {hz} Hz
                  </option>
                ))}
              </select>
            </span>
          </div>
          <Stepper
            // nota do tom (dos acordes); sem acordes ainda, mostra a transposição
            value={p.keyLabel ?? (p.semitones === 0 ? 'Original' : `${p.semitones > 0 ? '+' : ''}${p.semitones}`)}
            tone="text-[#b3a3ff]"
            onMinus={() => p.onSemitoneStep(-1)}
            onPlus={() => p.onSemitoneStep(1)}
          />
          <div className="flex items-center gap-2">
            {p.originalKey ? (
              <span className="font-mono text-[12px] text-sub">
                Original: {p.originalKey}
                {p.semitones !== 0 && ` (${p.semitones > 0 ? '+' : ''}${p.semitones} ${Math.abs(p.semitones) > 1 ? 'semitons' : 'semitom'})`}
              </span>
            ) : (
              <span />
            )}
            <button
              onClick={() => {
                p.onSemitones(0)
                p.onTuning(440)
              }}
              className={`${resetBtn} ml-auto`}
            >
              Redefinir
            </button>
          </div>
        </Popover>
        <span title="Compasso" className="font-mono text-[14px] font-semibold text-sub px-1.5">{p.beatsPerBar ? `${p.beatsPerBar}/4` : '—'}</span>
        <PadButton className={pill} />
        {p.outputSplit && (
          <span
            className="font-mono text-[11px] font-bold text-warn border border-warn/50 bg-warn/10 px-2 py-1 rounded-md"
            title="Saída L/R ligada: click e guia no L, música no R (desliga no menu ⋮ ou nas Configurações)"
          >
            L/R
          </span>
        )}
        <Dropdown items={p.exportItems} width="min-w-[260px]" className={pill}>
          <SmIcon name="download" size={16} /> Exportar <SmIcon name="cd" size={12} stroke={2.8} />
        </Dropdown>
        <Dropdown items={p.menuItems} width="min-w-[340px]" className="no-drag w-9 h-9 rounded-full bg-pop border border-ln2 text-[#e6e6e8] grid place-items-center hover:bg-btn">
          <SmIcon name="more" size={16} />
        </Dropdown>
      </div>
    </div>
  )
}
