import { useEffect, useMemo, useRef } from 'react'
import type { StemId } from '../../../../shared/types'
import { Knob } from './Knob'
import { EqButton, type Eq } from './EqButton'
import { STEM_INFO } from '../../lib/stems'

const BUCKETS = 2400

function computePeaks(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(BUCKETS)
  const data = buffer.getChannelData(0)
  const size = Math.max(1, Math.floor(data.length / BUCKETS))
  for (let b = 0; b < BUCKETS; b++) {
    let max = 0
    const start = b * size
    for (let i = start; i < start + size && i < data.length; i += 2) {
      const v = Math.abs(data[i])
      if (v > max) max = v
    }
    out[b] = max
  }
  const peak = out.reduce((m, v) => Math.max(m, v), 0.0001)
  for (let b = 0; b < BUCKETS; b++) out[b] = Math.min(1, out[b] / peak)
  return out
}

// largura da coluna de controles (M/S/EQ, nome, volume, pan); acordes, seções, régua e
// agulha usam a mesma medida para ficarem alinhadas com as faixas
export const HEADER_W = 320
export const TRACK_H = 80

// cor da faixa: a do instrumento; cinza quando a faixa está calada
export function laneColors(id: StemId, audible: boolean): { lane: string; wave: string } {
  const c = audible ? STEM_INFO[id].color : '#4a4a52'
  return { lane: c, wave: c }
}

interface Props {
  id: StemId
  label: string
  buffer: AudioBuffer | null
  duration: number
  audible: boolean
  muted: boolean
  soloed: boolean
  volume: number
  maxVolume?: number // metrônomo e guia vão até 2 (200%)
  pan: number
  eq: Eq
  onEq: (eq: Eq) => void
  onToggleMute: () => void
  onToggleSolo: () => void
  onVolume: (v: number) => void
  onPan: (v: number) => void
  onSeek: (seconds: number) => void
  children?: React.ReactNode // controles ao lado do nome (ex.: 0.5x/1x/2x do metrônomo)
}

export function TrackRow({
  id,
  label,
  buffer,
  duration,
  audible,
  muted,
  soloed,
  volume,
  maxVolume = 1,
  pan,
  eq,
  onEq,
  onToggleMute,
  onToggleSolo,
  onVolume,
  onPan,
  onSeek,
  children
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaks = useMemo(() => (buffer ? computePeaks(buffer) : null), [buffer])
  const info = STEM_INFO[id]
  const color = info.color
  const colors = laneColors(id, audible)

  // a onda só muda quando muda o áudio, a cor ou o tamanho: redesenha nesses casos
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = (): void => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx || !peaks || w === 0) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // onda espelhada, uma coluna por pixel, na cor do instrumento
      ctx.fillStyle = colors.wave
      ctx.globalAlpha = 0.9
      ctx.fillRect(0, h / 2 - 0.5, w, 1)
      // todas as faixas têm a mesma duração (mesmo esticadas pela velocidade)
      const cols = w
      for (let x = 0; x < cols; x++) {
        const a = Math.floor((x / cols) * peaks.length)
        const b = Math.max(a + 1, Math.floor(((x + 1) / cols) * peaks.length))
        let amp = 0
        for (let i = a; i < b; i++) amp = Math.max(amp, peaks[i])
        const half = amp * (h / 2 - 3)
        if (half > 0.5) ctx.fillRect(x, h / 2 - half, 1, half * 2)
      }
      ctx.globalAlpha = 1
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [peaks, colors.wave])

  const flag = (on: boolean, onCls: string, w = 'w-[26px]'): string =>
    `no-drag ${w} h-6 rounded-md border font-mono text-[11px] font-extrabold flex items-center justify-center ${
      on ? onCls : 'bg-chip border-ln3 text-sub hover:border-[#55555c] hover:text-fg'
    }`
  const vp = (volume / maxVolume) * 100

  return (
    <div className="flex items-stretch border-b border-chip" style={{ height: TRACK_H }}>
      <div className="shrink-0 flex bg-rail border-r border-[#1d1d21]" style={{ width: HEADER_W }}>
        <span className="w-1 shrink-0" style={{ background: color, opacity: audible ? 1 : 0.4 }} />
        <div className="flex-1 min-w-0 px-3 flex flex-col gap-[11px] justify-center">
          <div className={`flex items-center gap-1.5 ${muted ? 'opacity-55' : ''}`}>
            <span className="flex shrink-0" style={{ color }}>{info.icon}</span>
            <span className={`text-[13px] font-bold flex-1 truncate ${audible ? 'text-fg' : 'text-fg/45'}`} title={label}>
              {label}
            </span>
            {children}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onToggleMute} title="Mudo (M)" className={flag(muted, 'bg-bad border-bad text-[#1a0207]')}>
              M
            </button>
            <button onClick={onToggleSolo} title="Solo (S)" className={flag(soloed, 'bg-warn border-warn text-[#1a1203]')}>
              S
            </button>
            <EqButton label={label} eq={eq} onChange={onEq} color={color} />
            <input
              type="range"
              min={0}
              max={maxVolume}
              step={0.01}
              value={volume}
              onChange={(e) => onVolume(parseFloat(e.target.value))}
              title={`Volume ${Math.round(volume * 100)}%`}
              className={`no-drag studio-volume flex-1 min-w-0 mx-1.5 ${muted ? 'opacity-55' : ''}`}
              style={{ background: `linear-gradient(to right, ${color} ${vp}%, #26262b ${vp}%)` }}
            />
            <span className="font-mono text-[11px] font-semibold text-[#d6d6da] w-[34px] text-right">{Math.round(volume * 100)}%</span>
            <Knob value={pan} onChange={onPan} dimmed={!audible} color={color} />
          </div>
        </div>
      </div>
      <div
        className={`relative flex-1 min-w-0 cursor-pointer ${audible ? '' : 'opacity-40'}`}
        onClick={(e) => {
          if (duration <= 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration)
        }}
      >
        <div
          className="absolute left-1.5 right-1.5 top-[7px] bottom-[7px] rounded-[9px] overflow-hidden border"
          style={{
            background: `linear-gradient(180deg, color-mix(in srgb, ${colors.lane} 22%, transparent), color-mix(in srgb, ${colors.lane} 4%, transparent))`,
            borderColor: `color-mix(in srgb, ${colors.lane} 70%, transparent)`
          }}
        >
          <span
            className="absolute left-2 top-1.5 z-[1] text-[10px] font-extrabold px-2 py-0.5 rounded-full text-[#0a0a0b]"
            style={{ background: colors.lane }}
          >
            {label}
          </span>
          <canvas ref={canvasRef} className="absolute left-0 right-0 top-[22px] bottom-1 w-full" style={{ height: 'calc(100% - 26px)' }} />
        </div>
      </div>
    </div>
  )
}
