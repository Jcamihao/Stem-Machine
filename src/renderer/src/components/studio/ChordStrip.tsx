import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChordSegment } from '../../../../shared/types'
import { chordAt, formatChord } from '../../lib/chords'

interface StripProps {
  chords: ChordSegment[]
  duration: number
  shift: number
  onSeek: (seconds: number) => void
  onEdit: (index: number, text: string | null) => void // null = "sem acorde"
}

/* faixa dos acordes acima da régua: cada acorde no ponto em que entra. Clique vai
   para ele; botão direito corrige (digitar o acorde certo, ou marcar sem acorde) */
export function ChordStrip({ chords, duration, shift, onSeek, onEdit }: StripProps): React.ReactElement {
  const [edit, setEdit] = useState<{ index: number; x: number; y: number; text: string } | null>(null)
  const pct = (t: number): number => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0)
  // largura real da faixa: o nome só aparece onde cabe (com a música inteira na tela,
  // acordes curtos viram só uma marca, ainda clicável e corrigível)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="relative w-full h-[34px] border-b border-chip">
      {chords.map((c, i) => {
        const name = formatChord(c.label, shift)
        if (!name) return null
        return (
          <button
            key={`${c.start}-${i}`}
            onClick={() => onSeek(c.start)}
            onContextMenu={(e) => {
              e.preventDefault()
              setEdit({ index: i, x: e.clientX, y: e.clientY, text: name })
            }}
            title={`${name} — clique: ir para cá · botão direito: corrigir`}
            className="no-drag absolute top-1.5 h-[22px] px-[7px] flex items-center rounded-md bg-chip border-l-2 border-[#3a3a40] font-mono text-[12px] font-bold text-[#d6d6da] hover:text-fg hover:bg-btn2 truncate"
            style={{ left: `${pct(c.start)}%`, width: `calc(${pct(c.end) - pct(c.start)}% - 2px)` }}
          >
            {duration > 0 && ((c.end - c.start) / duration) * width >= name.length * 7.5 + 14 ? name : ''}
          </button>
        )
      })}
      {edit &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setEdit(null)}>
            <div
              className="absolute w-[260px] bg-chip border border-ln3 rounded-[14px] p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
              style={{ left: Math.min(edit.x, window.innerWidth - 260), top: Math.min(edit.y, window.innerHeight - 190) }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[13px] font-extrabold mb-2.5">Corrigir acorde</p>
              <input
                autoFocus
                value={edit.text}
                onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && edit.text.trim()) {
                    onEdit(edit.index, edit.text.trim())
                    setEdit(null)
                  }
                  if (e.key === 'Escape') setEdit(null)
                }}
                placeholder="Ex.: Gm7, D/F#, C7M"
                className="no-drag w-full h-[38px] px-3 rounded-lg bg-well border-[1.5px] border-acc font-mono text-[15px] font-bold outline-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  disabled={!edit.text.trim()}
                  onClick={() => {
                    onEdit(edit.index, edit.text.trim())
                    setEdit(null)
                  }}
                  className="no-drag flex-1 h-8 rounded-full bg-acc text-acc-ink text-[12px] font-extrabold disabled:opacity-40 hover:bg-acc2"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    onEdit(edit.index, null)
                    setEdit(null)
                  }}
                  className="no-drag flex-1 h-8 rounded-full bg-btn2 border border-ln4 text-[#e6e6e8] text-[12px] font-bold hover:bg-ln4"
                >
                  Sem acorde
                </button>
              </div>
              <p className="text-[10.5px] text-dim mt-2">O tom transposto é considerado: digite como você ouve agora.</p>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

interface NowProps {
  chords: ChordSegment[]
  shift: number
  getPosition: () => number
}

// acorde atual em destaque e os próximos 3 (no canto da barra de transporte)
export function ChordNow({ chords, shift, getPosition }: NowProps): React.ReactElement {
  const [current, setCurrent] = useState(-1)
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      const pos = getPosition()
      setT(pos)
      const { current: c } = chordAt(chords, pos)
      setCurrent((prev) => (prev === c ? prev : c))
    }, 60)
    return () => clearInterval(id)
  }, [chords, getPosition])
  const cur = current >= 0 ? formatChord(chords[current].label, shift) : ''
  // próximos acordes (pula "sem acorde" e repetições seguidas)
  const upcoming: string[] = []
  let last = cur
  for (let i = current >= 0 ? current + 1 : chords.findIndex((c) => c.start > t); i >= 0 && i < chords.length && upcoming.length < 3; i++) {
    const name = formatChord(chords[i].label, shift)
    if (name && name !== last) {
      upcoming.push(name)
      last = name
    }
  }
  return (
    <div className="flex items-baseline gap-3.5 min-w-[200px]">
      <span className="font-mono text-[34px] font-extrabold leading-none text-acc min-w-[70px]">{cur || '—'}</span>
      {upcoming.map((name, i) => (
        <span key={i} className={`font-mono font-bold ${i === 0 ? 'text-[16px] text-sub' : i === 1 ? 'text-[16px] text-dim' : 'text-[16px] text-[#55555c]'}`}>
          {name}
        </span>
      ))}
    </div>
  )
}
