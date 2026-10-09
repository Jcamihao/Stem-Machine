import { useEffect, useRef, useState } from 'react'

interface Props {
  duration: number
  beats: number[]
  downbeats: number[]
  loopA: number | null
  loopB: number | null
  loopOn: boolean
  onSeek: (seconds: number) => void
  onSelectLoop: (a: number, b: number) => void
}

/* régua: um traço por batida (mais alto no "1"); clique vai para o ponto,
   arrastar marca o trecho do loop A–B */
export function Ruler({ duration, beats, downbeats, loopA, loopB, loopOn, onSeek, onSelectLoop }: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x: number; t: number } | null>(null)
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null)

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
      if (!ctx || duration <= 0) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const downs = new Set(downbeats.map((t) => Math.round(t * 1000)))
      for (const t of beats) {
        const x = Math.round((t / duration) * w) + 0.5
        const strong = downs.has(Math.round(t * 1000))
        ctx.fillStyle = strong ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)'
        ctx.fillRect(x, strong ? 0 : h * 0.35, 1, strong ? h : h * 0.65)
      }
      if (beats.length === 0) {
        // sem batidas detectadas: marcas a cada 5s
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        for (let t = 0; t < duration; t += 5) ctx.fillRect(Math.round((t / duration) * w), h * 0.4, 1, h * 0.6)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [beats, downbeats, duration])

  const timeAt = (clientX: number, el: HTMLElement): number => {
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration
  }
  const pct = (t: number): number => (duration > 0 ? (t / duration) * 100 : 0)
  const region = drag ?? (loopA !== null && loopB !== null ? { a: loopA, b: loopB } : null)

  return (
    <div
      className="no-drag relative h-8 cursor-pointer"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { x: e.clientX, t: timeAt(e.clientX, e.currentTarget) }
      }}
      onPointerMove={(e) => {
        const start = dragRef.current
        if (!start || Math.abs(e.clientX - start.x) < 5) return
        const t = timeAt(e.clientX, e.currentTarget)
        setDrag({ a: Math.min(start.t, t), b: Math.max(start.t, t) })
      }}
      onPointerUp={(e) => {
        const start = dragRef.current
        dragRef.current = null
        if (drag && drag.b - drag.a > 0.25) onSelectLoop(drag.a, drag.b)
        else if (start) onSeek(timeAt(e.clientX, e.currentTarget))
        setDrag(null)
      }}
    >
      {region && (
        <div
          className={`absolute top-0 bottom-0 ${loopOn || drag ? 'bg-amber-300/30 border-x-2 border-amber-300' : 'bg-white/10 border-x border-white/40'}`}
          style={{ left: `${pct(region.a)}%`, width: `${pct(region.b) - pct(region.a)}%` }}
        />
      )}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  )
}
