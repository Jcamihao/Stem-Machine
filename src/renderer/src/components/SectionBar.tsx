import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Section } from '../../../shared/types'
import { mergeWithNext, moveBoundary, removeSection, renameSection, snapTo, splitAt } from '../lib/edits'

// nomes em português (a guia de voz fala em português)
export const SECTION_LABELS: Record<string, { name: string; color: string }> = {
  intro: { name: 'Intro', color: '#8a8a92' },
  verse: { name: 'Verso', color: '#3d8bff' },
  prechorus: { name: 'Pré-refrão', color: '#33c7d6' },
  chorus: { name: 'Refrão', color: '#ff5b1f' },
  bridge: { name: 'Ponte', color: '#7b61ff' },
  solo: { name: 'Solo', color: '#e2407a' },
  inst: { name: 'Instrumental', color: '#b8d63a' },
  break: { name: 'Pausa', color: '#55555c' },
  outro: { name: 'Final', color: '#a8a8b2' }
}

const info = (label: string): { name: string; color: string } =>
  SECTION_LABELS[label] ?? { name: label, color: '#8a8a92' }

interface Props {
  sections: Section[]
  duration: number
  downbeats: number[] // a borda arrastada e a divisão grudam no "1" do click
  getPosition: () => number
  onGoTo: (index: number) => void // clique: vai para a parte (na virada do compasso, tocando)
  pendingIndex?: number | null // parte escolhida esperando a virada do compasso
  onChange: (sections: Section[]) => void
  onLoop: (index: number) => void
}

/* faixa das seções acima da régua: clique vai para a seção; arrastar a borda
   esquerda move o começo; botão direito: loop, dividir, juntar, excluir, renomear */
export function SectionBar({ sections, duration, downbeats, getPosition, onGoTo, pendingIndex = null, onChange, onLoop }: Props): React.ReactElement {
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

  const item = 'no-drag text-left px-2.5 py-[9px] rounded-lg text-[13px] font-semibold text-[#e6e6e8] hover:bg-btn2 disabled:opacity-35 disabled:hover:bg-transparent'
  const pos = getPosition()
  const menuSection = menu ? sections[menu.index] : null
  const canSplit = !!menuSection && pos > menuSection.start + 0.5 && pos < menuSection.end - 0.5

  return (
    <div className="w-full">
      <div ref={barRef} className="relative h-[38px] border-b border-chip">
        {shown.map((s, i) => {
          const { name, color } = info(s.label)
          return (
            <div
              key={`${i}-${s.label}`}
              className="absolute top-[5px] bottom-[5px]"
              style={{ left: `${pct(s.start)}%`, width: `calc(${pct(s.end) - pct(s.start)}% - 2px)` }}
            >
              <button
                onClick={() => onGoTo(i)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ index: i, x: e.clientX, y: e.clientY })
                }}
                title={`${name} — clique: ir para cá (tocando, na virada do compasso) · arraste a borda esquerda para mover · botão direito: editar`}
                className={`no-drag w-full h-full rounded-[7px] text-[12px] font-bold pl-3 pr-1.5 truncate text-left hover:brightness-125 ${pendingIndex === i ? 'animate-pulse ring-1 ring-white/70' : ''}`}
                style={{ background: `${color}1f`, border: `1.5px solid ${color}66`, color: '#d6d6da' }}
              >
                {name}
              </button>
              {i > 0 && (
                <div
                  title="Arraste para mover o começo desta seção"
                  className="no-drag absolute left-0 top-0 h-full w-[7px] cursor-ew-resize z-10 rounded-l-[7px]" style={{ background: color }}
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
              className="absolute bg-chip border border-ln3 rounded-[14px] p-1.5 flex flex-col min-w-[280px] shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
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
              <div className="h-px bg-ln2 mx-1.5 my-1" />
              <span className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] font-semibold tracking-[0.08em] text-dim uppercase">Renomear</span>
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
