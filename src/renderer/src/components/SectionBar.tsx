import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Section } from '../../../shared/types'

// nomes em português (a guia de voz fala em português)
export const SECTION_LABELS: Record<string, { name: string; color: string }> = {
  intro: { name: 'Intro', color: '#94A3B8' },
  verse: { name: 'Verso', color: '#60A5FA' },
  prechorus: { name: 'Pré-refrão', color: '#22D3EE' },
  chorus: { name: 'Refrão', color: '#F472B6' },
  bridge: { name: 'Ponte', color: '#FBBF24' },
  solo: { name: 'Solo', color: '#A78BFA' },
  inst: { name: 'Instrumental', color: '#34D399' },
  break: { name: 'Pausa', color: '#64748B' },
  outro: { name: 'Final', color: '#94A3B8' }
}

const info = (label: string): { name: string; color: string } =>
  SECTION_LABELS[label] ?? { name: label, color: '#94A3B8' }

interface Props {
  sections: Section[]
  duration: number
  onSeek: (seconds: number) => void
  onRename: (index: number, label: string) => void
  onLoop: (index: number) => void
}

/* faixa das seções acima da barra de progresso: clique vai para o começo da
   seção; clique direito abre o menu (renomear / loop desta seção) */
export function SectionBar({ sections, duration, onSeek, onRename, onLoop }: Props): React.ReactElement {
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null)
  const pct = (t: number): number => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0)

  return (
    <div className="w-full pb-1">
      <div className="relative h-6">
        {sections.map((s, i) => {
          const { name, color } = info(s.label)
          return (
            <button
              key={`${s.start}-${i}`}
              onClick={() => onSeek(s.start)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ index: i, x: e.clientX, y: e.clientY })
              }}
              title={`${name} — clique: ir para cá · botão direito: renomear / loop`}
              className="no-drag absolute top-0 h-full rounded-md text-[10px] font-semibold px-1.5 truncate text-left transition-opacity hover:opacity-100 opacity-85"
              style={{
                left: `${pct(s.start)}%`,
                width: `calc(${pct(s.end) - pct(s.start)}% - 2px)`,
                background: `${color}2e`,
                borderLeft: `2px solid ${color}`,
                color
              }}
            >
              {name}
            </button>
          )
        })}
      </div>
      {menu &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
            <div
              className="absolute glass rounded-xl p-1.5 flex flex-col min-w-[160px] shadow-2xl"
              style={{ left: Math.min(menu.x, window.innerWidth - 180), top: Math.max(8, Math.min(menu.y, window.innerHeight - 350)) }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  onLoop(menu.index)
                  setMenu(null)
                }}
                className="no-drag text-left px-3 py-1.5 rounded-lg text-[12px] text-white/80 hover:bg-white/10"
              >
                Loop desta seção
              </button>
              <div className="h-px bg-white/10 my-1" />
              <span className="px-3 py-1 text-[10px] uppercase tracking-widest text-white/35">Renomear</span>
              {Object.entries(SECTION_LABELS).map(([label, { name, color }]) => (
                <button
                  key={label}
                  onClick={() => {
                    onRename(menu.index, label)
                    setMenu(null)
                  }}
                  className="no-drag flex items-center gap-2 text-left px-3 py-1.5 rounded-lg text-[12px] text-white/80 hover:bg-white/10"
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {name}
                  {sections[menu.index]?.label === label && <span className="ml-auto text-white/40">✓</span>}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
