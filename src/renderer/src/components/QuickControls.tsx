import { useEffect, useRef, useState } from 'react'
import { runCommand } from '../lib/commands'
import { metronome, useMetronome } from '../lib/metronome'

const panText = (pan: number): string => (pan === 0 ? 'Centro' : pan < 0 ? `${Math.round(-pan * 100)}% L` : `${Math.round(pan * 100)}% R`)

// O metrônomo avulso é independente do player: pode tocar junto de uma música
// ou sozinho. O click sincronizado continua nos controles próprios da música.
export function MetronomeButton({ className }: { className: string }): React.ReactElement {
  const s = useMetronome()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const on = s.playing
  const label = `Metrônomo ${s.bpm}`
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
      <button onClick={() => setOpen((v) => !v)} title="Controles do metrônomo" className={`${className} ${on ? 'bg-emerald-400 !text-black hover:bg-emerald-300' : ''}`}>
        <span className={`w-2 h-2 rounded-full ${on ? 'bg-black animate-pulse' : 'bg-current opacity-40'}`} />
        {label}
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 w-[300px] bg-[#1a1a1a] border border-white/10 rounded-xl p-5 shadow-2xl text-white">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-[14px] font-bold">Metrônomo</p>
            <button onClick={() => runCommand({ type: 'metronomeToggle' })} className={`no-drag h-8 px-3 rounded-md text-[12px] font-bold ${on ? 'bg-emerald-400 text-black' : 'bg-[#262626] hover:bg-[#333]'}`}>
              {on ? 'Ligado — parar' : 'Tocar'}
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => metronome.setBpm(s.bpm - 1, true)} className="no-drag w-10 h-10 rounded-md bg-[#262626] text-xl hover:bg-[#333]">−</button>
            <div className="flex-1 h-10 rounded-md bg-[#262626] flex items-center justify-center text-[16px] font-bold tabular-nums">{s.bpm} BPM</div>
            <button onClick={() => metronome.setBpm(s.bpm + 1, true)} className="no-drag w-10 h-10 rounded-md bg-[#262626] text-xl hover:bg-[#333]">+</button>
            <button onClick={() => metronome.tap()} className="no-drag h-10 px-3 rounded-md bg-amber-300 text-black text-[12px] font-extrabold active:scale-95">TAP</button>
          </div>
          <p className="text-[11px] text-white/45 mb-4">Toque em TAP no pulso da música. Depois de dois toques, o BPM é calculado pela média.</p>
          <div className="grid grid-cols-[42px_1fr_54px] items-center gap-2">
            <span className="text-[12px] font-semibold text-white/55">Volume</span>
            <input type="range" min={0} max={2} step={0.01} value={s.volume} onChange={(e) => metronome.setVolume(parseFloat(e.target.value))} className="no-drag accent-white" />
            <span className="text-right text-[11px] font-semibold text-white/60">{Math.round(s.volume * 100)}%</span>
            <span className="text-[12px] font-semibold text-white/55">Pan</span>
            <input type="range" min={-1} max={1} step={0.01} value={s.pan} onChange={(e) => metronome.setPan(parseFloat(e.target.value))} className="no-drag accent-white" />
            <span className="text-right text-[11px] font-semibold text-white/60">{panText(s.pan)}</span>
          </div>
          <p className="text-[10px] text-white/35 mt-2">PAN L/R ligado força o metrônomo para L.</p>
        </div>
      )}
    </div>
  )
}

export function OutputSplitButton({ on, onToggle, className }: { on: boolean; onToggle: () => void; className: string }): React.ReactElement {
  return (
    <button onClick={onToggle} title="Saída L/R: metrônomo e guia no L; música no R" className={`${className} ${on ? 'bg-amber-300 !text-black hover:bg-amber-200' : ''}`}>
      PAN L/R
    </button>
  )
}
