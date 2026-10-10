import { useEffect, useMemo, useRef } from 'react'
import type { StemId } from '../../../../shared/types'
import { Knob } from './Knob'

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

// cores da faixa: azul para os instrumentos, ciano para "outro", verde para o
// metrônomo, laranja para a guia; cinza quando a faixa está calada
export function laneColors(id: StemId, audible: boolean): { lane: string; wave: string } {
  if (!audible) return { lane: '#4a4a4a', wave: '#2a2a2a' }
  if (id === 'other') return { lane: '#6EE7F5', wave: '#0E8A8A' }
  if (id === 'click') return { lane: '#6EE892', wave: '#1C7A3C' }
  if (id === 'guide') return { lane: '#F8B26A', wave: '#8A4A10' }
  return { lane: '#62A0F5', wave: '#0E8A8A' }
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
  pan: number
  onToggleMute: () => void
  onToggleSolo: () => void
  onVolume: (v: number) => void
  onPan: (v: number) => void
  onSeek: (seconds: number) => void
  children?: React.ReactNode // controles dentro da faixa (ex.: 0.5x/1x/2x do metrônomo)
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
  pan,
  onToggleMute,
  onToggleSolo,
  onVolume,
  onPan,
  onSeek,
  children
}: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaks = useMemo(() => (buffer ? computePeaks(buffer) : null), [buffer])
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
      // linha central + onda espelhada, uma coluna por pixel
      ctx.fillStyle = colors.wave
      ctx.fillRect(0, h / 2 - 0.5, w, 1)
      // todas as faixas têm a mesma duração (mesmo esticadas pela velocidade)
      const cols = w
      for (let x = 0; x < cols; x++) {
        const a = Math.floor((x / cols) * peaks.length)
        const b = Math.max(a + 1, Math.floor(((x + 1) / cols) * peaks.length))
        let amp = 0
        for (let i = a; i < b; i++) amp = Math.max(amp, peaks[i])
        const half = amp * (h / 2 - 6)
        if (half > 0.5) ctx.fillRect(x, h / 2 - half, 1, half * 2)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [peaks, colors.wave])

  const square = (on: boolean, onCls: string): string =>
    `no-drag w-4 h-4 rounded-[3px] text-[8px] font-bold flex items-center justify-center ${
      on ? onCls : 'bg-white/15 text-white/70 hover:bg-white/25'
    }`

  return (
    <div className="flex items-stretch h-16">
      <div className="w-[214px] shrink-0 flex items-center gap-2 pl-5 pr-3">
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <button onClick={onToggleMute} title="Mudo (M)" className={square(muted, 'bg-rose-400 text-black')}>
              M
            </button>
            <button onClick={onToggleSolo} title="Solo (S)" className={square(soloed, 'bg-amber-300 text-black')}>
              S
            </button>
            <span
              className={`text-[12px] font-semibold leading-tight line-clamp-2 ${audible ? 'text-white' : 'text-white/40'}`}
              title={label}
            >
              {label}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(parseFloat(e.target.value))}
            className="no-drag studio-volume w-[132px]"
            style={{
              background: `linear-gradient(to right, #14b8a6 ${volume * 100}%, rgba(255,255,255,0.18) ${volume * 100}%)`
            }}
          />
        </div>
        <Knob value={pan} onChange={onPan} dimmed={!audible} />
      </div>
      <div
        className="relative flex-1 min-w-0 rounded-md overflow-hidden cursor-pointer"
        style={{ background: colors.lane }}
        onClick={(e) => {
          if (duration <= 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration)
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {children}
      </div>
    </div>
  )
}
