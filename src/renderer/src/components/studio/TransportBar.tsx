import { useEffect, useState } from 'react'
import { fmtTime } from '../../lib/format'
import { VolumeIcon, RewindIcon, ForwardIcon, PauseBarsIcon, PlayTriIcon, LoopIcon, LyricsIcon, ChordsIcon, SectionsIcon } from './icons'

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
  const icon = 'no-drag text-white/85 hover:text-white transition-colors'
  const pill = 'no-drag flex items-center gap-2 px-4 h-9 rounded-md text-[13px] font-semibold'

  return (
    <div className="relative h-[84px] shrink-0 flex items-center justify-center">
      {p.leftSlot && <div className="absolute left-6">{p.leftSlot}</div>}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-7">
          <div className="relative">
            <button onClick={() => setVolOpen((o) => !o)} title="Volume geral" className={icon}>
              <VolumeIcon />
            </button>
            {volOpen && (
              <div className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-[#1c1c1c] rounded-lg px-3 py-2 shadow-xl">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={p.master}
                  onChange={(e) => p.onMaster(parseFloat(e.target.value))}
                  className="no-drag studio-volume w-28"
                  style={{ background: `linear-gradient(to right, #fff ${p.master * 100}%, rgba(255,255,255,0.18) ${p.master * 100}%)` }}
                />
              </div>
            )}
          </div>
          <button onClick={p.onPrev} title="Seção anterior" className={icon}>
            <RewindIcon className="w-6 h-6" />
          </button>
          <button onClick={p.onTogglePlay} disabled={p.duration === 0} title="Tocar / pausar (espaço)" className={icon}>
            {p.playing ? <PauseBarsIcon className="w-6 h-6" /> : <PlayTriIcon className="w-6 h-6" />}
          </button>
          <button onClick={p.onNext} title="Próxima seção" className={icon}>
            <ForwardIcon className="w-6 h-6" />
          </button>
          <button
            onClick={p.onToggleLoop}
            title="Loop (L) — arraste na régua para marcar o trecho"
            className={`no-drag transition-colors ${p.loopOn ? 'text-amber-300' : 'text-white/85 hover:text-white'}`}
          >
            <LoopIcon />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/60 tabular-nums">
          <span className="w-9 text-right">{fmtTime(pos)}</span>
          <div
            className="no-drag relative w-[290px] h-1 rounded-full bg-white/20 cursor-pointer"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              p.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.duration)
            }}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: `${frac * 100}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white" style={{ left: `${frac * 100}%` }} />
          </div>
          <span className="w-9">{fmtTime(p.duration)}</span>
        </div>
      </div>
      <div className="absolute right-4 flex items-center gap-2">
        <button
          onClick={p.onToggleLoopMode}
          title="Ligado: arraste na régua para marcar o loop A–B. Desligado: arrastar move a agulha"
          className={`${pill} ${p.loopMode ? 'bg-amber-300 text-black' : 'bg-[#1e1e1e] text-white hover:bg-[#2a2a2a]'}`}
        >
          <LoopIcon className="w-4 h-4" /> Loop A–B
        </button>
        <button disabled title="Letra — em breve" className={`${pill} bg-[#1e1e1e] text-white/35 cursor-not-allowed`}>
          <LyricsIcon className="w-4 h-4" /> Letra
        </button>
        <button
          onClick={p.onToggleChords}
          disabled={!p.chordsAvailable}
          title={p.chordsAvailable ? 'Mostrar/ocultar acordes' : 'Detectando acordes…'}
          className={`${pill} ${p.showChords && p.chordsAvailable ? 'bg-white text-black' : 'bg-[#1e1e1e] text-white hover:bg-[#2a2a2a]'} disabled:opacity-40`}
        >
          <ChordsIcon className="w-4 h-4" /> Acordes
        </button>
        <button
          onClick={p.onToggleSections}
          title="Mostrar/ocultar seções"
          className={`${pill} ${p.showSections ? 'bg-white text-black' : 'bg-[#1e1e1e] text-white hover:bg-[#2a2a2a]'}`}
        >
          <SectionsIcon className="w-4 h-4" /> Seções
        </button>
      </div>
    </div>
  )
}
