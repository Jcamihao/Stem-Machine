import { useEffect } from 'react'
import type { SceneSong } from '../lib/scenes'

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
  return (
    <div className="fixed inset-0 z-40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute right-4 top-[92px] w-[380px] max-w-[92vw] max-h-[70vh] flex flex-col bg-[#141414] border border-white/10 rounded-xl shadow-2xl text-white" role="dialog" aria-label="Setlist">
        <div className="h-12 shrink-0 flex items-center px-4 border-b border-white/10">
          <span className="flex-1 min-w-0 truncate text-[14px] font-bold">{name}</span>
          <button onClick={onClose} title="Fechar (Esc)" className="no-drag text-white/60 hover:text-white text-[18px] leading-none">×</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
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
                className={`no-drag flex items-center gap-2.5 px-3 min-h-12 rounded-lg text-left ${cur ? 'bg-emerald-400 text-black' : 'bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-40 disabled:hover:bg-[#1e1e1e]'}`}
              >
                <span className={`w-5 text-[12px] text-right shrink-0 ${cur ? 'text-black/55' : 'text-white/40'}`}>{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{s.missing ? 'Música removida' : s.title}</span>
                  {!s.missing && (
                    <span className={`block text-[11px] ${cur ? 'text-black/60' : 'text-white/45'}`}>
                      {[s.key, s.bpm ? `${Math.round(s.bpm)} BPM` : null, fmtDur(s.duration) || null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {cur && <span className="text-[10px] font-bold tracking-wide shrink-0">TOCANDO</span>}
                {i === next && <span className="text-[10px] font-bold tracking-wide px-1.5 h-5 leading-5 rounded bg-amber-300 text-black shrink-0">PRÓXIMA</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
