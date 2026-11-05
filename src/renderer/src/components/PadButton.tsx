import { useEffect, useRef, useState } from 'react'
import { pad, usePad, PAD_NOTES, TRANSITION_SECONDS } from '../lib/pad'
import type { PadTransition } from '../../../shared/types'
import { SmIcon } from './SmIcon'

// chip "Pad" (biblioteca e player) + painel: 12 notas, fonte (sintetizado ou
// importado), transição, volume e brilho. O pad toca independente do player
export function PadButton({ className, side = false }: { className: string; side?: boolean }): React.ReactElement {
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
  const label = 'text-[12px] font-bold text-sub w-24 shrink-0'
  const panText = s.pan === 0 ? 'Centro' : s.pan < 0 ? `${Math.round(-s.pan * 100)}% L` : `${Math.round(s.pan * 100)}% R`
  const seg = (on: boolean): string =>
    `no-drag flex-1 text-center py-1.5 rounded-full text-[12px] font-bold ${on ? 'bg-btn2 text-fg' : 'text-sub hover:text-fg'}`
  const slider = (value: number, onChange: (v: number) => void): React.ReactElement => (
    <>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="no-drag studio-volume flex-1"
        style={{ background: `linear-gradient(to right, #8bd450 ${value * 100}%, #26262b ${value * 100}%)` }}
      />
      <span className="font-mono text-[11px] font-semibold w-8 text-right">{Math.round(value * 100)}%</span>
    </>
  )

  return (
    <div ref={ref} className={side ? 'relative w-full' : 'relative'}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Pad contínuo (toca mesmo sem música)"
        className={`${className} ${s.playing ? (side ? '!bg-ok/10 !border-ok/40 !text-ok2' : 'ring-1 ring-ok') : ''}`}
      >
        {side ? <SmIcon name="pad" size={16} /> : <span className={`w-2 h-2 rounded-full ${s.playing ? 'bg-ok animate-pulse' : 'bg-faint'}`} />}
        Pad
        {s.playing && side && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-ok shadow-[0_0_0_3px_rgba(139,212,80,0.25)]" />
            {PAD_NOTES[s.key]}
          </span>
        )}
        {s.playing && !side && <span className="font-mono font-bold text-ok2">{PAD_NOTES[s.key]}</span>}
      </button>
      {open && (
        <div
          className={`absolute z-50 w-[360px] bg-chip border border-ln3 rounded-2xl p-4 shadow-[0_24px_60px_rgba(0,0,0,0.6)] text-fg flex flex-col gap-3.5 ${
            side ? 'left-full top-0 ml-3' : 'top-11 right-0'
          }`}
        >
          <button
            onClick={() => pad.toggle()}
            className={`no-drag flex items-center justify-center gap-2 h-11 rounded-full text-[14px] font-extrabold ${
              s.playing ? 'bg-ok text-[#0d1a03]' : 'bg-btn2 border border-ln4 text-fg hover:bg-ln4'
            }`}
          >
            <SmIcon name={s.playing ? 'pause' : 'play'} size={16} />
            {s.playing ? 'Tocando — parar' : 'Tocar'}
          </button>

          <div>
            <div className="grid grid-cols-6 gap-1.5">
              {PAD_NOTES.map((note, i) => {
                const active = s.key === i
                const hint = s.songKey === i
                return (
                  <button
                    key={note}
                    onClick={() => void pad.pressKey(i)}
                    title={hint ? 'Tom da música aberta' : undefined}
                    className={`no-drag h-[42px] rounded-[10px] font-mono text-[14px] font-bold border-[1.5px] ${
                      active && s.playing
                        ? 'bg-ok border-ok text-[#0d1a03]'
                        : hint
                          ? 'bg-acc/[0.12] border-acc text-acc3'
                          : active
                            ? 'bg-btn2 border-ln4 text-fg'
                            : 'bg-well border-btn2 text-[#d6d6da] hover:bg-btn2'
                    }`}
                  >
                    {note}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-mute mt-2">
              Toque numa nota para tocar nesse tom; toque de novo para parar.
              {s.songKey !== null && <span className="text-acc3"> Contorno laranja: tom da música.</span>}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className={label}>Transição</span>
            <span className="flex-1 flex bg-well border border-ln2 rounded-full p-[3px]">
              {(['fast', 'slow'] as PadTransition[]).map((t) => (
                <button key={t} onClick={() => pad.setTransition(t)} className={seg(s.transition === t)}>
                  {t === 'fast' ? 'Rápida' : 'Lenta'} · {TRANSITION_SECONDS[t].toLocaleString('pt-BR')} s
                </button>
              ))}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className={label}>Som</span>
            <select
              value={s.source}
              onChange={(e) => void pad.setSource(e.target.value)}
              className="no-drag flex-1 min-w-0 h-[34px] px-3 rounded-lg bg-well border border-ln2 text-[13px] font-semibold outline-none"
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
              className="no-drag h-[34px] px-3 rounded-full bg-btn2 border border-ln4 text-[#e6e6e8] text-[12px] font-bold hover:bg-ln4"
            >
              Importar…
            </button>
          </div>
          {sample && (
            <div className="flex items-center gap-2.5 bg-well border border-btn2 rounded-xl px-3 py-2.5">
              <span className="text-[12px] font-bold text-sub">O arquivo está em</span>
              <select
                value={sample.key}
                onChange={(e) => void pad.setSampleKey(sample.id, parseInt(e.target.value, 10))}
                className="no-drag h-[30px] px-2 rounded-lg bg-btn2 text-fg font-mono text-[13px] font-bold outline-none"
              >
                {PAD_NOTES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (window.confirm(`Remover o pad "${sample.name}"?`)) void pad.removeSample(sample.id)
                }}
                className="no-drag ml-auto h-[30px] px-3 rounded-full border border-bad/45 text-bad2 text-[12px] font-bold hover:bg-bad/10"
              >
                Remover
              </button>
            </div>
          )}
          {sample && s.detected?.id === sample.id && (
            <p className="text-[12px] text-mute -mt-1.5">
              {s.detected.key === null
                ? 'Não consegui detectar o tom — escolha acima.'
                : s.detected.key === sample.key
                  ? `Tom detectado ${s.detected.how === 'name' ? 'pelo nome do arquivo' : 'pelo áudio'}: ${PAD_NOTES[s.detected.key]}. Se estiver errado, corrija acima.`
                  : 'Tom corrigido por você.'}
            </p>
          )}
          {s.loading && <p className="text-[12px] text-sub">Carregando o pad…</p>}
          {s.error && <p className="text-[12px] text-bad2">{s.error}</p>}

          <div className="flex items-center gap-2.5">
            <span className={label}>Volume</span>
            {slider(s.volume, pad.setVolume)}
          </div>
          <div className="flex items-center gap-2.5">
            <span className={label}>Brilho</span>
            {slider(s.brightness, pad.setBrightness)}
          </div>
          <div className="flex items-center gap-2.5">
            <span className={label}>Pan</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={s.pan}
              onChange={(e) => pad.setPan(parseFloat(e.target.value))}
              className="no-drag studio-volume flex-1"
            />
            <span className="font-mono text-[11px] font-semibold w-10 text-right">{panText}</span>
          </div>
          <p className="text-[10px] text-dim">PAN L/R ligado força o pad para R.</p>
        </div>
      )}
    </div>
  )
}
