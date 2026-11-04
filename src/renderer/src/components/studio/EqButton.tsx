import { useState } from 'react'
import { createPortal } from 'react-dom'

export interface Eq {
  low: number
  mid: number
  high: number
}

export const FLAT_EQ: Eq = { low: 0, mid: 0, high: 0 }

const BANDS: { key: keyof Eq; name: string; hint: string }[] = [
  { key: 'low', name: 'Graves', hint: 'até ~200 Hz' },
  { key: 'mid', name: 'Médios', hint: '~1 kHz' },
  { key: 'high', name: 'Agudos', hint: 'a partir de ~6 kHz' }
]

// botão "EQ" da faixa: abre um painel com graves/médios/agudos (−12 a +12 dB)
export function EqButton({ label, eq, onChange, color = '#3d8bff' }: { label: string; eq: Eq; onChange: (eq: Eq) => void; color?: string }): React.ReactElement {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const active = eq.low !== 0 || eq.mid !== 0 || eq.high !== 0
  const fmt = (db: number): string => (db === 0 ? '0 dB' : `${db > 0 ? '+' : ''}${db} dB`)
  return (
    <>
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ x: r.left, y: r.bottom + 6 })
        }}
        title="Equalizador desta faixa"
        className={`no-drag w-8 h-6 rounded-md border font-mono text-[10px] font-extrabold ${active ? '' : 'bg-chip border-ln3 text-sub hover:border-[#55555c] hover:text-fg'}`}
        style={active ? { background: `color-mix(in srgb, ${color} 20%, transparent)`, borderColor: color, color } : undefined}
      >
        EQ
      </button>
      {at &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setAt(null)}>
            <div
              className="absolute w-[300px] bg-chip border border-ln3 rounded-2xl p-[18px] shadow-[0_24px_60px_rgba(0,0,0,0.6)] flex flex-col gap-4"
              style={{ left: Math.min(at.x, window.innerWidth - 320), top: Math.min(at.y, window.innerHeight - 300) }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <p className="text-[15px] font-extrabold">EQ · {label}</p>
              </div>
              <div className="flex flex-col gap-3">
                {BANDS.map(({ key, name, hint }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[12px] mb-1.5">
                      <span className="font-bold text-sub">
                        {name} <span className="text-dim font-normal">{hint}</span>
                      </span>
                      <span className={`font-mono font-bold tabular-nums ${eq[key] === 0 ? 'text-sub' : ''}`} style={eq[key] !== 0 ? { color } : undefined}>{fmt(eq[key])}</span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={eq[key]}
                      onChange={(e) => onChange({ ...eq, [key]: parseInt(e.target.value, 10) })}
                      onDoubleClick={() => onChange({ ...eq, [key]: 0 })}
                      title="Duplo clique zera"
                      className="no-drag studio-volume w-full"
                      style={{
                        background: `linear-gradient(to right, #26262b ${Math.min(50, ((eq[key] + 12) / 24) * 100)}%, ${color} ${Math.min(50, ((eq[key] + 12) / 24) * 100)}%, ${color} ${Math.max(50, ((eq[key] + 12) / 24) * 100)}%, #26262b ${Math.max(50, ((eq[key] + 12) / 24) * 100)}%)`
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center">
                <span className="text-[11px] text-dim">−12 a +12 dB · duplo clique zera</span>
                <button onClick={() => onChange(FLAT_EQ)} className="no-drag ml-auto h-[30px] px-3 rounded-full bg-btn2 border border-ln4 text-[#e6e6e8] text-[12px] font-bold hover:bg-ln4">
                  Redefinir
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
