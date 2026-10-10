import { useEffect, useState } from 'react'
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
  return (
    <div className="relative w-full h-6 mb-1">
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
            className="no-drag absolute top-0 h-full px-1 text-left text-[11px] font-bold text-white/85 hover:text-white truncate border-l border-white/25"
            style={{ left: `${pct(c.start)}%`, width: `${pct(c.end) - pct(c.start)}%` }}
          >
            {name}
          </button>
        )
      })}
      {edit &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setEdit(null)}>
            <div
              className="absolute w-[240px] bg-[#1a1a1a] border border-white/10 rounded-xl p-4 shadow-2xl"
              style={{ left: Math.min(edit.x, window.innerWidth - 260), top: Math.min(edit.y, window.innerHeight - 190) }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[12px] font-semibold mb-2">Corrigir acorde</p>
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
                className="no-drag w-full h-9 px-3 rounded-md bg-[#262626] text-[14px] font-bold outline-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  disabled={!edit.text.trim()}
                  onClick={() => {
                    onEdit(edit.index, edit.text.trim())
                    setEdit(null)
                  }}
                  className="no-drag flex-1 h-8 rounded-md bg-white text-black text-[12px] font-semibold disabled:opacity-40"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    onEdit(edit.index, null)
                    setEdit(null)
                  }}
                  className="no-drag flex-1 h-8 rounded-md bg-white/[0.08] hover:bg-white/15 text-[12px]"
                >
                  Sem acorde
                </button>
              </div>
              <p className="text-[10.5px] text-white/35 mt-2">O tom transposto é considerado: digite como você ouve agora.</p>
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

// acorde atual em destaque e o próximo ao lado (no canto da barra de transporte)
export function ChordNow({ chords, shift, getPosition }: NowProps): React.ReactElement {
  const [state, setState] = useState({ current: -1, next: -1 })
  useEffect(() => {
    const id = setInterval(() => {
      const s = chordAt(chords, getPosition())
      setState((prev) => (prev.current === s.current && prev.next === s.next ? prev : s))
    }, 60)
    return () => clearInterval(id)
  }, [chords, getPosition])
  const cur = state.current >= 0 ? formatChord(chords[state.current].label, shift) : ''
  const nxt = state.next >= 0 ? formatChord(chords[state.next].label, shift) : ''
  return (
    <div className="flex items-baseline gap-3 min-w-[160px]">
      <span className="text-[30px] font-extrabold leading-none tracking-tight">{cur || '—'}</span>
      {nxt && <span className="text-[15px] font-semibold text-white/45">→ {nxt}</span>}
    </div>
  )
}
