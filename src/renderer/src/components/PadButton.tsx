import { useEffect, useRef, useState } from 'react'
import { pad, usePad, PAD_NOTES, TRANSITION_SECONDS } from '../lib/pad'
import type { PadTransition } from '../../../shared/types'

// chip "Pad" (biblioteca e player) + painel: 12 notas, fonte (sintetizado ou
// importado), transição, volume e brilho. O pad toca independente do player
export function PadButton({ className }: { className: string }): React.ReactElement {
  const s = usePad()
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

  const sample = s.samples.find((p) => p.id === s.source) ?? null
  const label = 'text-[12px] font-semibold text-white/55'
  const panText = s.pan === 0 ? 'Centro' : s.pan < 0 ? `${Math.round(-s.pan * 100)}% L` : `${Math.round(s.pan * 100)}% R`
  const seg = (on: boolean): string =>
    `no-drag flex-1 h-8 rounded-md text-[12px] font-semibold ${on ? 'bg-white text-black' : 'bg-[#262626] text-white/75 hover:bg-[#333]'}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Pad contínuo (toca mesmo sem música)"
        className={`${className} ${s.playing ? 'ring-1 ring-emerald-400' : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${s.playing ? 'bg-emerald-400 animate-pulse' : 'bg-white/25'}`} />
        Pad{s.playing && <span className="font-bold">{PAD_NOTES[s.key]}</span>}
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 w-[340px] bg-[#1a1a1a] border border-white/10 rounded-xl p-5 shadow-2xl text-white">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-bold">Pad</p>
            <button
              onClick={() => pad.toggle()}
              className={`no-drag h-8 px-4 rounded-md text-[12px] font-bold ${s.playing ? 'bg-emerald-400 text-black' : 'bg-[#262626] text-white hover:bg-[#333]'}`}
            >
              {s.playing ? 'Tocando — parar' : 'Tocar'}
            </button>
          </div>

          <div className="grid grid-cols-6 gap-1.5 mb-1.5">
            {PAD_NOTES.map((note, i) => {
              const active = s.key === i
              const hint = s.songKey === i
              return (
                <button
                  key={note}
                  onClick={() => void pad.pressKey(i)}
                  title={hint ? 'Tom da música aberta' : undefined}
                  className={`no-drag h-11 rounded-md text-[14px] font-bold ${
                    active && s.playing
                      ? 'bg-emerald-400 text-black'
                      : active
                        ? 'bg-white text-black'
                        : 'bg-[#262626] text-white/85 hover:bg-[#333]'
                  } ${hint ? 'ring-2 ring-amber-300' : ''}`}
                >
                  {note}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-white/40 mb-4">
            Toque numa nota para tocar nesse tom; toque de novo para parar.
            {s.songKey !== null && <span className="text-amber-300/80"> Contorno amarelo: tom da música.</span>}
          </p>

          <p className={`${label} mb-1.5`}>Transição de tom</p>
          <div className="flex gap-1.5 mb-4">
            {(['fast', 'slow'] as PadTransition[]).map((t) => (
              <button key={t} onClick={() => pad.setTransition(t)} className={seg(s.transition === t)}>
                {t === 'fast' ? 'Rápida' : 'Lenta'} ({TRANSITION_SECONDS[t].toLocaleString('pt-BR')} s)
              </button>
            ))}
          </div>

          <p className={`${label} mb-1.5`}>Som</p>
          <div className="flex gap-1.5 mb-2">
            <select
              value={s.source}
              onChange={(e) => void pad.setSource(e.target.value)}
              className="no-drag flex-1 min-w-0 h-8 px-2 rounded-md bg-[#262626] text-[12px] font-semibold outline-none"
            >
              <option value="synth">Sintetizado</option>
              {s.samples.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void pad.importSample()}
              className="no-drag h-8 px-3 rounded-md bg-[#262626] text-[12px] font-semibold hover:bg-[#333]"
            >
              Importar…
            </button>
          </div>
          {sample && (
            <div className="flex items-center gap-2 mb-2 text-[12px] text-white/55">
              O arquivo está em
              <select
                value={sample.key}
                onChange={(e) => void pad.setSampleKey(sample.id, parseInt(e.target.value, 10))}
                className="no-drag h-7 px-1.5 rounded bg-[#262626] text-white font-bold outline-none"
              >
                {PAD_NOTES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="flex-1" />
              <button
                onClick={() => {
                  if (window.confirm(`Remover o pad "${sample.name}"?`)) void pad.removeSample(sample.id)
                }}
                className="no-drag text-rose-300/80 hover:text-rose-200"
              >
                Remover
              </button>
            </div>
          )}
          {sample && s.detected?.id === sample.id && (
            <p className="text-[11px] mb-2 text-white/45">
              {s.detected.key === null
                ? 'Não consegui detectar o tom — escolha acima.'
                : s.detected.key === sample.key
                  ? `Detectado: ${PAD_NOTES[s.detected.key]} (${s.detected.how === 'name' ? 'pelo nome do arquivo' : 'pelo áudio'}). Se estiver errado, corrija acima.`
                  : 'Tom corrigido por você.'}
            </p>
          )}
          {s.loading && <p className="text-[12px] text-white/50 mb-2">Carregando o pad…</p>}
          {s.error && <p className="text-[12px] text-rose-300 mb-2">{s.error}</p>}

          <div className="grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-2 mt-3">
            <span className={label}>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={s.volume}
              onChange={(e) => pad.setVolume(parseFloat(e.target.value))}
              className="no-drag accent-white"
            />
            <span className={label}>Brilho</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={s.brightness}
              onChange={(e) => pad.setBrightness(parseFloat(e.target.value))}
              className="no-drag accent-white"
            />
            <span className={label}>Pan</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={s.pan}
                onChange={(e) => pad.setPan(parseFloat(e.target.value))}
                className="no-drag flex-1 accent-white"
              />
              <span className="w-12 text-right text-[11px] font-semibold text-white/55">{panText}</span>
            </div>
          </div>
          <p className="text-[10px] text-white/35 mt-2">PAN L/R ligado força o pad para R.</p>
        </div>
      )}
    </div>
  )
}
