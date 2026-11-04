import { useEffect } from 'react'
import type { SceneSong } from '../lib/scenes'
import { SmIcon } from './SmIcon'

const fmtDur = (s: number): string => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

// modo ao vivo: o setlist inteiro ao lado do player. A atual em destaque, a próxima marcada;
// um toque em qualquer música abre ela, sem passar pela biblioteca
export function SetlistDrawer({ name, index, songs, onJump, onClose }: { name: string; index: number; songs: SceneSong[]; onJump: (i: number) => void; onClose: () => void }): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const next = songs.findIndex((s, i) => i > index && !s.missing)
  const total = songs.reduce((sum, s) => sum + (s.duration || 0), 0)
  const fmtTotal = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
  return (
    <div className="fixed inset-0 z-40 bg-black/45" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute right-0 top-0 bottom-0 w-[400px] max-w-[92vw] flex flex-col bg-well border-l border-ln2 shadow-[-24px_0_60px_rgba(0,0,0,0.5)] text-fg" role="dialog" aria-label="Setlist">
        <div className="shrink-0 flex items-center gap-2.5 px-[18px] pt-[18px] pb-3">
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="truncate text-[18px] font-extrabold">{name}</span>
            <span className="font-mono text-[12px] text-mute">
              {songs.length} {songs.length === 1 ? 'música' : 'músicas'}
              {total > 0 && ` · ${fmtTotal(total)}`}
            </span>
          </div>
          <button onClick={onClose} title="Fechar (Esc)" className="no-drag w-8 h-8 rounded-full bg-btn border border-ln3 text-[#e6e6e8] grid place-items-center hover:bg-btn2">
            <SmIcon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-3 flex flex-col gap-0.5">
          {songs.map((s, i) => {
            const cur = i === index
            return (
              <button
                key={`${s.id}-${i}`}
                disabled={s.missing}
                onClick={() => {
                  if (!cur) onJump(i)
                  onClose()
                }}
                className={`no-drag grid grid-cols-[22px_minmax(0,1fr)_auto] gap-2.5 items-center px-2.5 py-[9px] rounded-[10px] border text-left ${
                  cur ? 'bg-acc/10 border-acc/45' : 'border-transparent hover:bg-chip disabled:opacity-40 disabled:hover:bg-transparent'
                }`}
              >
                <span className="font-mono text-[12px] font-semibold text-dim">{i + 1}</span>
                <span className="min-w-0 flex flex-col gap-0.5">
                  <span className="flex gap-2 items-center">
                    <span className="truncate text-[14px] font-bold">{s.missing ? 'Música removida' : s.title}</span>
                    {cur && <span className="font-mono text-[9px] font-bold tracking-[0.06em] px-1.5 py-0.5 rounded bg-acc text-acc-ink shrink-0">TOCANDO</span>}
                    {i === next && <span className="font-mono text-[9px] font-bold tracking-[0.06em] px-1.5 py-0.5 rounded bg-vio/20 text-vio2 shrink-0">PRÓXIMA</span>}
                  </span>
                  {!s.missing && (
                    <span className="font-mono text-[11px] text-mute">
                      {[s.key, s.bpm ? `${Math.round(s.bpm)}` : null].filter(Boolean).join(' · ') || '– · –'}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[12px] text-sub">{fmtDur(s.duration)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
