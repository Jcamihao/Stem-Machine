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
export function EqButton({ label, eq, onChange }: { label: string; eq: Eq; onChange: (eq: Eq) => void }): React.ReactElement {
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
        className={`no-drag h-4 px-1 rounded-[3px] text-[8px] font-bold ${active ? 'bg-sky-300 text-black' : 'bg-white/15 text-white/70 hover:bg-white/25'}`}
      >
        EQ
      </button>
      {at &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setAt(null)}>
            <div
              className="absolute w-[300px] bg-[#1a1a1a] border border-white/10 rounded-xl p-5 shadow-2xl"
              style={{ left: Math.min(at.x, window.innerWidth - 320), top: Math.min(at.y, window.innerHeight - 260) }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-center text-[14px] font-bold mb-4">EQ — {label}</p>
              {BANDS.map(({ key, name, hint }) => (
                <div key={key} className="mb-3">
                  <div className="flex items-center justify-between text-[12px] mb-1.5">
                    <span className="font-semibold">
                      {name} <span className="text-white/35 font-normal">{hint}</span>
                    </span>
                    <span className={`tabular-nums ${eq[key] === 0 ? 'text-white/45' : 'text-sky-300'}`}>{fmt(eq[key])}</span>
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
                      background: `linear-gradient(to right, rgba(255,255,255,0.18) ${Math.min(50, ((eq[key] + 12) / 24) * 100)}%, #7dd3fc ${Math.min(50, ((eq[key] + 12) / 24) * 100)}%, #7dd3fc ${Math.max(50, ((eq[key] + 12) / 24) * 100)}%, rgba(255,255,255,0.18) ${Math.max(50, ((eq[key] + 12) / 24) * 100)}%)`
                    }}
                  />
                </div>
              ))}
              <button onClick={() => onChange(FLAT_EQ)} className="no-drag w-full mt-1 text-[13px] text-white/45 hover:text-white">
                Redefinir
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
