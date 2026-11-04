import { useRef } from 'react'

interface Props {
  value: number // -1 (L) a 1 (R)
  onChange: (v: number) => void
  dimmed?: boolean
  color?: string
}

// botão giratório de pan: arrastar para cima/baixo, duplo clique volta ao centro
export function Knob({ value, onChange, dimmed, color = '#f2f2f3' }: Props): React.ReactElement {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const angle = value * 135
  return (
    <div
      title={`Pan ${value === 0 ? 'C' : value < 0 ? `L${Math.round(-value * 100)}` : `R${Math.round(value * 100)}`} — arraste; duplo clique centraliza`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, v: value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const next = drag.current.v + (drag.current.y - e.clientY) / 80
        onChange(Math.max(-1, Math.min(1, Math.abs(next) < 0.04 ? 0 : next)))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onDoubleClick={() => onChange(0)}
      className={`no-drag w-6 h-6 shrink-0 rounded-full bg-btn border border-[#3a3a40] relative cursor-ns-resize select-none ${dimmed ? 'opacity-40' : ''}`}
      style={{ transform: `rotate(${angle}deg)` }}
    >
      <span className="absolute left-1/2 top-[2px] w-0.5 h-2 -ml-px rounded-sm" style={{ background: color }} />
    </div>
  )
}
