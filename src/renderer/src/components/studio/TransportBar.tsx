import { useEffect, useState } from 'react'
import { fmtTime } from '../../lib/format'
import { SmIcon } from '../SmIcon'

interface Props {
  playing: boolean
  duration: number
  getPosition: () => number
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onPrev: () => void
  onNext: () => void
  loopOn: boolean
  onToggleLoop: () => void
  master: number
  onMaster: (v: number) => void
  showSections: boolean
  onToggleSections: () => void
  loopMode: boolean
  onToggleLoopMode: () => void
  chordsAvailable: boolean
  showChords: boolean
  onToggleChords: () => void
  leftSlot?: React.ReactNode // acorde atual / próximo
}

export function TransportBar(p: Props): React.ReactElement {
  const [, force] = useState(0)
  const [volOpen, setVolOpen] = useState(false)
  // tempo e barra de progresso andando enquanto toca
  useEffect(() => {
    if (!p.playing) return
    const id = setInterval(() => force((n) => (n + 1) % 1000), 200)
    return () => clearInterval(id)
  }, [p.playing])
  const pos = p.getPosition()
  const frac = p.duration > 0 ? Math.min(1, pos / p.duration) : 0
  const round = 'no-drag grid place-items-center rounded-full bg-chip border border-ln2 text-[#e6e6e8] hover:bg-btn transition-colors'
  const pill = 'no-drag h-[34px] px-[11px] rounded-full text-[12px] font-bold border'
  const on = 'bg-acc/[0.14] border-acc/55 text-acc3'
  const off = 'bg-chip border-ln2 text-[#e6e6e8] hover:bg-btn'
  const chordsOn = p.showChords && p.chordsAvailable

  return (
    <div className="relative h-[92px] shrink-0 border-t border-[#1d1d21] bg-rail grid grid-cols-[320px_1fr_320px] items-center px-[18px] gap-5">
      <div className="min-w-0">{p.leftSlot}</div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <button onClick={() => setVolOpen((o) => !o)} title="Volume geral" className={`${round} w-[38px] h-[38px]`}>
              <SmIcon name="vol" size={16} />
            </button>
            {volOpen && (
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-chip border border-ln3 rounded-xl px-3 py-2.5 shadow-xl">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={p.master}
                  onChange={(e) => p.onMaster(parseFloat(e.target.value))}
                  className="no-drag studio-volume w-28"
                  style={{ background: `linear-gradient(to right, #ff5b1f ${p.master * 100}%, #26262b ${p.master * 100}%)` }}
                />
              </div>
            )}
          </div>
          <button onClick={p.onPrev} title="Seção anterior" className={`${round} w-[42px] h-[42px]`}>
            <SmIcon name="prev" size={16} />
          </button>
          <button
            onClick={p.onTogglePlay}
            disabled={p.duration === 0}
            title={p.playing ? 'Pausar (Espaço)' : 'Tocar (Espaço)'}
            className="no-drag w-14 h-14 rounded-full bg-fg text-[#0a0a0b] grid place-items-center shadow-[0_0_0_6px_rgba(255,255,255,0.06)] hover:bg-white disabled:opacity-40"
          >
            <SmIcon name={p.playing ? 'pause' : 'play'} size={22} />
          </button>
          <button onClick={p.onNext} title="Próxima seção" className={`${round} w-[42px] h-[42px]`}>
            <SmIcon name="next" size={16} />
          </button>
          <button
            onClick={p.onToggleLoop}
            title="Loop (L) — arraste na régua para marcar o trecho"
            className={`no-drag w-[38px] h-[38px] rounded-full grid place-items-center border transition-colors ${p.loopOn ? 'bg-acc/[0.16] border-acc text-acc2' : 'bg-chip border-ln2 text-[#e6e6e8] hover:bg-btn'}`}
          >
            <SmIcon name="repeat" size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2.5 w-[560px] max-w-full font-mono text-[12px] font-semibold text-[#d6d6da] tabular-nums">
          <span>{fmtTime(pos)}</span>
          <div
            className="no-drag relative flex-1 h-[5px] rounded-full bg-btn2 cursor-pointer"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              p.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.duration)
            }}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-acc" style={{ width: `${frac * 100}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-fg" style={{ left: `${frac * 100}%` }} />
          </div>
          <span className="text-mute">{fmtTime(p.duration)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 justify-end">
        <button
          onClick={p.onToggleLoopMode}
          title="Ligado: arraste na régua para marcar o loop A–B. Desligado: arrastar move a agulha"
          className={`${pill} font-mono ${p.loopMode ? 'bg-acc/[0.16] border-acc text-acc3' : off}`}
        >
          A–B
        </button>
        <button disabled title="Letra — em breve" className={`${pill} !border-dashed border-[#2f2f35] bg-transparent text-[#4a4a52] cursor-not-allowed`}>
          Letra
        </button>
        <button
          onClick={p.onToggleChords}
          disabled={!p.chordsAvailable}
          title={p.chordsAvailable ? 'Mostrar/ocultar acordes' : 'Detectando acordes…'}
          className={`${pill} ${chordsOn ? on : off} disabled:bg-transparent disabled:text-[#4a4a52] disabled:hover:bg-transparent`}
        >
          Acordes
        </button>
        <button onClick={p.onToggleSections} title="Mostrar/ocultar seções" className={`${pill} ${p.showSections ? on : off}`}>
          Seções
        </button>
      </div>
    </div>
  )
}
