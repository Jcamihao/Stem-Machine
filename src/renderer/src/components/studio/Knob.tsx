import { useRef } from 'react'

interface Props {
  value: number // -1 (L) a 1 (R)
  onChange: (v: number) => void
  dimmed?: boolean
}

// botão giratório de pan: arrastar para cima/baixo, duplo clique volta ao centro
export function Knob({ value, onChange, dimmed }: Props): React.ReactElement {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const angle = value * 135
  return (
    <div className={`flex flex-col items-center select-none ${dimmed ? 'opacity-40' : ''}`}>
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
        className="no-drag w-7 h-7 rounded-full border-2 border-white/70 relative cursor-ns-resize"
      >
        <span
          className="absolute left-1/2 top-1/2 w-0.5 h-2.5 bg-white rounded-full origin-bottom"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)` }}
        />
      </div>
      <div className="flex justify-between w-8 text-[7px] text-white/40 leading-none mt-0.5">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  )
}
