import { useEffect, useRef, useState } from 'react'
import { fmtTime } from '../lib/format'
import { PlayIcon, PauseIcon, ExternalIcon } from './Icons'

export type PresetId = 'all' | 'karaoke' | 'acapella' | 'drumnbass'

// ½× / 2×: corrige quando a detecção conta o pulso no dobro ou na metade
export type ClickFactor = 0.5 | 1 | 2

export interface ClickState {
  available: boolean
  bpm: number | null
  factor: ClickFactor
  analyzing: boolean
  error: string | null
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'acapella', label: 'Acapella' },
  { id: 'drumnbass', label: 'Drums + Bass' }
]

interface Props {
  playing: boolean
  duration: number
  getPosition: () => number
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  preset: PresetId
  onPreset: (p: PresetId) => void
  master: number
  onMaster: (v: number) => void
  // local-file songs have no video to link out to
  youtubeUrl?: string
  loopA: number | null
  loopB: number | null
  loopOn: boolean
  onMarkA: () => void
  onMarkB: () => void
  onToggleLoop: () => void
  onClearLoop: () => void
  click: ClickState
  onClickFactor: (f: ClickFactor) => void
  onAnalyzeBeats: () => void
}

function SeekBar({
  duration,
  getPosition,
  onSeek,
  playing,
  loopA,
  loopB,
  loopOn
}: {
  duration: number
  getPosition: () => number
  onSeek: (seconds: number) => void
  playing: boolean
  loopA: number | null
  loopB: number | null
  loopOn: boolean
}): React.ReactElement {
  const barRef = useRef<HTMLDivElement>(null)
  const [, force] = useState(0)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = (): void => {
      force((n) => (n + 1) % 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const frac = duration > 0 ? Math.min(1, getPosition() / duration) : 0
  const pct = (t: number): number => (duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0)

  const seekFromEvent = (clientX: number): void => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(f * duration)
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-xs text-white/50 font-mono tabular-nums w-12 text-right">
        {fmtTime(getPosition())}
      </span>
      <div
        ref={barRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromEvent(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekFromEvent(e.clientX)
        }}
        className="no-drag relative flex-1 h-4 flex items-center cursor-pointer group"
      >
        <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-emerald-400"
            style={{ width: `${frac * 100}%` }}
          />
        </div>
        {loopA !== null && loopB !== null && (
          <div
            className={`absolute h-3 rounded-sm border-x-2 pointer-events-none ${
              loopOn ? 'bg-amber-300/30 border-amber-300' : 'bg-white/10 border-white/40'
            }`}
            style={{ left: `${pct(loopA)}%`, width: `${pct(loopB) - pct(loopA)}%` }}
          />
        )}
        {loopA !== null && loopB === null && (
          <div
            className="absolute h-3 w-0.5 bg-amber-300 pointer-events-none"
            style={{ left: `${pct(loopA)}%` }}
          />
        )}
        <div
          className="absolute w-3 h-3 rounded-full bg-white shadow transition-transform group-hover:scale-125"
          style={{ left: `calc(${frac * 100}% - 6px)` }}
        />
      </div>
      <span className="text-xs text-white/50 font-mono tabular-nums w-12">
        {fmtTime(duration)}
      </span>
    </div>
  )
}

export function Transport({
  playing,
  duration,
  getPosition,
  onTogglePlay,
  onSeek,
  preset,
  onPreset,
  master,
  onMaster,
  youtubeUrl,
  loopA,
  loopB,
  loopOn,
  onMarkA,
  onMarkB,
  onToggleLoop,
  onClearLoop,
  click,
  onClickFactor,
  onAnalyzeBeats
}: Props): React.ReactElement {
  const hasLoop = loopA !== null && loopB !== null
  const loopBtn =
    'no-drag h-8 px-2.5 rounded-lg text-[12px] font-semibold transition-colors bg-white/[0.06] hover:bg-white/10 text-white/70 hover:text-white'
  return (
    <div className="glass rounded-2xl px-5 py-4 mt-4 flex flex-col gap-4">
      <SeekBar
        duration={duration}
        getPosition={getPosition}
        onSeek={onSeek}
        playing={playing}
        loopA={loopA}
        loopB={loopB}
        loopOn={loopOn}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          disabled={duration === 0}
          className="no-drag w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:hover:scale-100"
        >
          {playing ? (
            <PauseIcon className="w-5 h-5" />
          ) : (
            <PlayIcon className="w-5 h-5 -translate-x-px" />
          )}
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onMarkA}
            title="Marcar início do loop (A)"
            className={`${loopBtn} ${loopA !== null ? 'text-amber-300' : ''}`}
          >
            A{loopA !== null ? ` ${fmtTime(loopA)}` : ''}
          </button>
          <button
            onClick={onMarkB}
            title="Marcar fim do loop (B)"
            className={`${loopBtn} ${loopB !== null ? 'text-amber-300' : ''}`}
          >
            B{loopB !== null ? ` ${fmtTime(loopB)}` : ''}
          </button>
          <button
            onClick={onToggleLoop}
            disabled={!hasLoop}
            title="Ligar/desligar o loop (L)"
            className={`${loopBtn} disabled:opacity-40 ${
              loopOn ? '!bg-amber-300 !text-black' : ''
            }`}
          >
            Loop
          </button>
          {(loopA !== null || loopB !== null) && (
            <button onClick={onClearLoop} title="Limpar o loop" className={loopBtn}>
              ✕
            </button>
          )}
        </div>
        </div>

        <div className="no-drag flex items-center gap-1 bg-white/5 rounded-full p-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPreset(p.id)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                preset === p.id
                  ? 'bg-white/90 text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-44">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 text-white/60 shrink-0">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={master}
            onChange={(e) => onMaster(parseFloat(e.target.value))}
            className="no-drag w-full"
            style={{
              background: `linear-gradient(to right, #fff ${master * 100}%, rgba(255,255,255,0.14) ${master * 100}%)`
            }}
          />
        </div>

        {youtubeUrl && (
          <button
            onClick={() => window.stemkit.openExternal(youtubeUrl)}
            title="Open on YouTube"
            className="no-drag text-white/40 hover:text-white transition-colors"
          >
            <ExternalIcon />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.06] pt-3">
        {click.available ? (
          <>
            <span className="text-[12px] text-white/60" title="O click aparece como stem na lista abaixo (tecla C liga/desliga)">
              Click{click.bpm ? ` · ${Math.round(click.bpm * click.factor)} BPM` : ''}
            </span>
            <div className="flex items-center gap-1">
              {([0.5, 1, 2] as ClickFactor[]).map((f) => (
                <button
                  key={f}
                  onClick={() => onClickFactor(f)}
                  title={f === 1 ? 'Pulso detectado' : f === 2 ? 'Dobro do pulso' : 'Metade do pulso'}
                  className={`${loopBtn} !h-7 !px-2 ${click.factor === f ? 'text-sky-300' : ''}`}
                >
                  {f === 0.5 ? '½×' : f === 2 ? '2×' : '1×'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            onClick={onAnalyzeBeats}
            disabled={click.analyzing}
            title="Detecta as batidas desta música para ligar o click"
            className={`${loopBtn} disabled:opacity-60`}
          >
            {click.analyzing ? 'Detectando batidas…' : 'Detectar batidas (click)'}
          </button>
        )}
        {click.error && <span className="text-[11px] text-rose-300 truncate">{click.error}</span>}
      </div>
    </div>
  )
}
