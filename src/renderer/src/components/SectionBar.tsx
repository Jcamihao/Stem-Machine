import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Section } from '../../../shared/types'
import { mergeWithNext, moveBoundary, removeSection, renameSection, snapTo, splitAt } from '../lib/edits'

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
  downbeats: number[] // a borda arrastada e a divisão grudam no "1" do click
  getPosition: () => number
  onSeek: (seconds: number) => void
  onChange: (sections: Section[]) => void
  onLoop: (index: number) => void
}

/* faixa das seções acima da régua: clique vai para a seção; arrastar a borda
   esquerda move o começo; botão direito: loop, dividir, juntar, excluir, renomear */
export function SectionBar({ sections, duration, downbeats, getPosition, onSeek, onChange, onLoop }: Props): React.ReactElement {
  const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ index: number; t: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pct = (t: number): number => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0)
  const shown = drag ? moveBoundary(sections, drag.index, drag.t) : sections

  const timeAt = (clientX: number): number => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r) return 0
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration
  }

  const item = 'no-drag text-left px-3 py-1.5 rounded-lg text-[12px] text-white/80 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent'
  const pos = getPosition()
  const menuSection = menu ? sections[menu.index] : null
  const canSplit = !!menuSection && pos > menuSection.start + 0.5 && pos < menuSection.end - 0.5

  return (
    <div className="w-full pb-1">
      <div ref={barRef} className="relative h-6">
        {shown.map((s, i) => {
          const { name, color } = info(s.label)
          return (
            <div
              key={`${i}-${s.label}`}
              className="absolute top-0 h-full"
              style={{ left: `${pct(s.start)}%`, width: `calc(${pct(s.end) - pct(s.start)}% - 2px)` }}
            >
              <button
                onClick={() => onSeek(s.start)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ index: i, x: e.clientX, y: e.clientY })
                }}
                title={`${name} — clique: ir para cá · arraste a borda esquerda para mover · botão direito: editar`}
                className="no-drag w-full h-full rounded-md text-[10px] font-semibold px-1.5 truncate text-left opacity-85 hover:opacity-100"
                style={{ background: `${color}2e`, borderLeft: `2px solid ${color}`, color }}
              >
                {name}
              </button>
              {i > 0 && (
                <div
                  title="Arraste para mover o começo desta seção"
                  className="no-drag absolute -left-1.5 top-0 h-full w-3 cursor-ew-resize z-10"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setDrag({ index: i, t: s.start })
                  }}
                  onPointerMove={(e) => {
                    if (drag?.index === i) setDrag({ index: i, t: snapTo(downbeats, timeAt(e.clientX)) })
                  }}
                  onPointerUp={() => {
                    if (drag?.index === i) onChange(moveBoundary(sections, i, drag.t))
                    setDrag(null)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
      {menu &&
        menuSection &&
        createPortal(
          <div className="fixed inset-0 z-50" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
            <div
              className="absolute bg-[#1c1c1c] border border-white/10 rounded-xl p-1.5 flex flex-col min-w-[190px] shadow-2xl"
              style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.max(8, Math.min(menu.y, window.innerHeight - 470)) }}
              onClick={(e) => e.stopPropagation()}
            >
              {(
                [
                  ['Loop desta seção', () => onLoop(menu.index), true],
                  ['Dividir no ponto atual', () => onChange(splitAt(sections, snapTo(downbeats, pos))), canSplit],
                  ['Juntar com a próxima', () => onChange(mergeWithNext(sections, menu.index)), menu.index < sections.length - 1],
                  ['Excluir seção', () => onChange(removeSection(sections, menu.index)), sections.length > 1]
                ] as [string, () => void, boolean][]
              ).map(([label, action, enabled]) => (
                <button
                  key={label}
                  disabled={!enabled}
                  onClick={() => {
                    action()
                    setMenu(null)
                  }}
                  className={item}
                >
                  {label}
                </button>
              ))}
              <div className="h-px bg-white/10 my-1" />
              <span className="px-3 py-1 text-[10px] uppercase tracking-widest text-white/35">Renomear</span>
              {Object.entries(SECTION_LABELS).map(([label, { name, color }]) => (
                <button
                  key={label}
                  onClick={() => {
                    onChange(renameSection(sections, menu.index, label))
                    setMenu(null)
                  }}
                  className={`${item} flex items-center gap-2`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {name}
                  {menuSection.label === label && <span className="ml-auto text-white/40">✓</span>}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
