import { useEffect, useRef, useState } from 'react'
import type { JobProgress } from '../../../shared/types'
import { fmtTime } from '../lib/format'
import { SongThumb } from '../lib/thumbs'
import { SmIcon } from './SmIcon'

const STAGES: { id: JobProgress['stage']; label: string }[] = [
  { id: 'metadata', label: 'Lendo vídeo' },
  { id: 'download', label: 'Baixando áudio' },
  { id: 'convert', label: 'Convertendo' },
  { id: 'separate', label: 'Separando stems' },
  { id: 'finalize', label: 'Finalizando' }
]

const stageOrder = (stage: JobProgress['stage'] | undefined): number =>
  stage ? STAGES.findIndex((s) => s.id === stage) : -1

interface Props {
  job: JobProgress | null
  error: string | null
  // local-file jobs have no metadata/download stages and no yt-dlp to update
  isLocal?: boolean
  botSuspected: boolean
  onCancel: () => void
  onRetry: () => void
  onUpdateYtDlp: () => void
}

export function Processing({
  job,
  error,
  isLocal = false,
  botSuspected,
  onCancel,
  onRetry,
  onUpdateYtDlp
}: Props): React.ReactElement {
  const stages = isLocal ? STAGES.filter((s) => s.id !== 'metadata' && s.id !== 'download') : STAGES
  const stageIndex = job ? stages.findIndex((s) => s.id === job.stage) : -1

  const [timing, setTiming] = useState<{ elapsed: number; left: number | null } | null>(null)
  const jobRef = useRef(job)
  jobRef.current = job
  const tracker = useRef<{ videoId: string | null; start: number | null; ema: number | null }>({
    videoId: null,
    start: null,
    ema: null
  })

  useEffect(() => {
    const id = window.setInterval(() => {
      const j = jobRef.current
      const t = tracker.current
      // reset on a different job, on a retry (stage regressed), or on error
      if (!j || j.videoId !== t.videoId || stageOrder(j.stage) < stageOrder('separate')) {
        t.videoId = j?.videoId ?? null
        t.start = null
        t.ema = null
        setTiming(null)
        return
      }
      if (j.stage !== 'separate') {
        // finalize and beyond are instant; keep the last reading frozen
        return
      }
      if (t.start === null) t.start = Date.now()
      const elapsed = Math.round((Date.now() - t.start) / 1000)
      let left: number | null = null
      if (j.pct >= 3) {
        // self-calibrating estimate: elapsed over completed fraction,
        // smoothed so phase transitions and chunky updates don't wobble
        const projected = elapsed / (Math.min(j.pct, 99) / 100)
        t.ema = t.ema === null ? projected : t.ema * 0.9 + projected * 0.1
        left = Math.max(0, Math.round(t.ema - elapsed))
      }
      setTiming({ elapsed, left })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const failedIndex = error ? Math.max(stageIndex, 0) : -1
  return (
    <div className="h-full flex items-center justify-center px-8">
      <div className="w-full max-w-[620px] bg-well border border-btn2 rounded-[18px] p-7 rise-in shadow-[0_30px_80px_rgba(0,0,0,0.5)] flex flex-col gap-[22px]">
        <div className="flex items-center gap-4">
          {job?.videoId ? (
            <SongThumb
              videoId={job.videoId}
              className="w-32 h-[72px] rounded-[10px] object-cover bg-chip block"
              iconClassName="w-5 h-5 text-white/25"
            />
          ) : (
            <span className="w-10 h-10 rounded-full border-2 border-white/20 border-t-acc animate-spin" />
          )}
          <div className="min-w-0">
            <h2 className="text-[22px] font-extrabold tracking-[-0.01em] truncate">
              {job?.title || (error ? 'Algo deu errado' : 'Começando…')}
            </h2>
            <p className="text-[14px] text-acc2 font-semibold truncate">{job?.message ?? ''}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {stages.map((stage, i) => {
            const done = !error && i < stageIndex
            const active = !error && i === stageIndex
            const failedHere = !!error && i === failedIndex
            const pct = active && job ? job.pct : done ? 100 : 0
            return (
              <div key={stage.id} className="grid grid-cols-[24px_150px_1fr_44px] gap-3 items-center text-[14px]">
                <span
                  className={`w-[22px] h-[22px] rounded-full grid place-items-center text-[#0a0a0b] ${
                    done ? 'bg-ok' : active ? 'bg-acc' : failedHere ? 'bg-bad' : 'bg-ln2'
                  }`}
                >
                  {done && <SmIcon name="check" size={12} stroke={3} />}
                  {active && (
                    <span className="animate-spin inline-flex">
                      <SmIcon name="loader" size={12} stroke={3} />
                    </span>
                  )}
                  {failedHere && <SmIcon name="alert" size={12} stroke={3} />}
                </span>
                <span
                  className={
                    active ? 'font-extrabold text-fg' : failedHere ? 'font-bold text-bad2' : done ? 'font-semibold text-fg' : 'font-semibold text-dim'
                  }
                >
                  {stage.label}
                </span>
                <span className="h-1.5 rounded-full bg-btn2 overflow-hidden">
                  <span
                    className={`block h-full rounded-full transition-[width] duration-300 ${done ? 'bg-ok' : 'bg-acc'}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="font-mono text-[12px] text-right text-sub">{Math.round(pct)}%</span>
              </div>
            )
          })}
        </div>

        {timing && !error && (
          <p className="font-mono text-[13px] text-[#d6d6da]">
            {fmtTime(timing.elapsed)} decorridos
            {timing.left !== null ? ` · faltam ~${fmtTime(timing.left)}` : ' · estimando…'}
          </p>
        )}

        {error && (
          <div className="rise-in flex flex-col gap-4">
            <div className="rounded-[10px] bg-bad/[0.08] border border-bad/30 px-3.5 py-3 font-mono text-[13px] text-bad3 break-words">
              {error}
            </div>
            <div className="flex gap-2 flex-wrap">
              {botSuspected && !isLocal && (
                <button
                  onClick={onUpdateYtDlp}
                  className="no-drag inline-flex items-center gap-2 h-10 px-4 rounded-full bg-acc text-acc-ink text-[13px] font-extrabold hover:bg-acc2"
                >
                  <SmIcon name="download" size={16} /> Atualizar yt-dlp e tentar de novo
                </button>
              )}
              <button
                onClick={onRetry}
                className={`no-drag inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-bold ${
                  botSuspected && !isLocal ? 'bg-btn border border-ln3 text-[#e6e6e8] hover:bg-btn2' : 'bg-acc text-acc-ink font-extrabold hover:bg-acc2'
                }`}
              >
                <SmIcon name="refresh" size={16} /> Tentar de novo
              </button>
            </div>
          </div>
        )}

        {!error && (
          <div className="flex">
            <button
              onClick={onCancel}
              className="no-drag ml-auto inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-btn border border-ln3 text-[#e6e6e8] text-[13px] font-bold hover:bg-btn2"
            >
              <SmIcon name="x" size={16} /> Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
