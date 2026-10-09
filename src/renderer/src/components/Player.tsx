import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppSettings, BeatGrid, Song, StemId } from '../../../shared/types'
import { engine, decodePayload, isAudible, renderClick, type BufferMap } from '../lib/engine'
import { encodeWav } from '../lib/wav'
import { buildStemMeta, STEM_INFO } from '../lib/stems'
import { fmtTime } from '../lib/format'
import { SongThumb } from '../lib/thumbs'
import { YouTubeHost, type YTState } from '../lib/youtube'
import { StemLane } from './StemLane'
import { Transport, type ClickFactor, type PresetId } from './Transport'
import { DownloadIcon } from './Icons'

type BufferCacheMap = BufferMap

const bufferCache = new Map<string, Promise<BufferCacheMap>>()

// cache por música + motor + stems: depois de "adicionar stem" o áudio é outro
function getDecoded(song: Song): Promise<BufferCacheMap> {
  const key = `${song.videoId}|${song.model}|${(song.stems ?? []).join(',')}`
  let entry = bufferCache.get(key)
  if (!entry) {
    entry = window.stemkit
      .getBuffers(song.videoId)
      .then((payload) => decodePayload(payload))
      .catch((err) => {
        bufferCache.delete(key)
        throw err
      })
    bufferCache.set(key, entry)
  }
  return entry
}

const SEPARABLE: StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']

/* ½×: fica uma batida sim, outra não, mantendo todo "1" do compasso;
   2×: acrescenta uma batida no meio de cada intervalo */
function applyFactor(grid: BeatGrid, factor: ClickFactor): { beats: number[]; downbeats: number[] } {
  if (factor === 1) return { beats: grid.beats, downbeats: grid.downbeats }
  if (factor === 2) {
    const beats: number[] = []
    grid.beats.forEach((t, i) => {
      beats.push(t)
      const next = grid.beats[i + 1]
      if (next !== undefined) beats.push((t + next) / 2)
    })
    return { beats, downbeats: grid.downbeats }
  }
  const first = grid.downbeats.length ? grid.beats.indexOf(grid.downbeats[0]) : 0
  const parity = Math.max(0, first) % 2
  return { beats: grid.beats.filter((_, i) => i % 2 === parity), downbeats: grid.downbeats }
}

interface Props {
  song: Song
  settings?: AppSettings
}

export function Player({ song, settings }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<YouTubeHost | null>(null)
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const videoSyncAtRef = useRef(0)
  const prevPosRef = useRef(0)
  const loopActiveRef = useRef(false)
  const songIdRef = useRef(song.videoId)

  const VIDEO_DRIFT_LIMIT = 0.4
  const VIDEO_RESYNC_COOLDOWN = 2000

  const [ytReady, setYtReady] = useState(false)
  const [decoding, setDecoding] = useState(true)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(song.duration || 0)
  const [bump, setBump] = useState(0)
  const [buffers, setBuffers] = useState<BufferMap>({})

  const [vols, setVols] = useState<Partial<Record<StemId, number>>>({})
  const [mutes, setMutes] = useState<Set<StemId>>(new Set())
  const [solos, setSolos] = useState<Set<StemId>>(new Set())
  const [master, setMaster] = useState(0.9)
  const [preset, setPreset] = useState<PresetId | 'custom'>('all')
  const [loopA, setLoopA] = useState<number | null>(null)
  const [loopB, setLoopB] = useState<number | null>(null)
  const [loopOn, setLoopOn] = useState(false)
  const [beats, setBeats] = useState<BeatGrid | null>(null)
  const [clickFactor, setClickFactor] = useState<ClickFactor>(1)
  const [analyzing, setAnalyzing] = useState(false)
  const [clickError, setClickError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addPick, setAddPick] = useState<Set<StemId>>(new Set())
  const [addProgress, setAddProgress] = useState<{ pct: number; message?: string } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const stemMeta = useMemo(() => buildStemMeta(Object.keys(buffers) as StemId[]), [buffers])

  // local files have no video to sync: the player runs audio-only, with a
  // placeholder panel where the YouTube iframe would be
  const isLocal = song.source === 'local'
  const youtubeUrl = isLocal ? null : `https://www.youtube.com/watch?v=${song.videoId}`
  // stems always play locally from the library; hiding the video just stops
  // streaming it from YouTube (and switches thumbnails to the local cache)
  const showVideo = !(settings?.hideVideo ?? false) && !isLocal
  const addedLabel = new Date(song.addedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  useEffect(() => {
    posRef.current = 0
    setPlaying(false)
    playingRef.current = false
    videoSyncAtRef.current = 0
    setYtReady(false)
    setDecodeError(null)
    setBuffers({})
    setDuration(song.duration || 0)
    setVols({})
    setMutes(new Set())
    setSolos(new Set())
    setPreset('all')
    setLoopA(null)
    setLoopB(null)
    setLoopOn(false)
    loopActiveRef.current = false
    prevPosRef.current = 0
    engine.stopAll()
    engine.setLoop(null, null, false)
    songIdRef.current = song.videoId
    setBeats(null)
    setClickFactor(1)
    setClickError(null)
    setAnalyzing(false)

    let cancelled = false
    void window.stemkit.getBeats(song.videoId).then((grid) => {
      if (!cancelled) setBeats(grid)
    })
    setDecoding(true)
    getDecoded(song)
      .then((decoded) => {
        if (cancelled) return
        setBuffers(decoded)
        engine.setBuffers(decoded)
        setVols(Object.fromEntries(Object.keys(decoded).map((id) => [id, 1])))
        const d = engine.trackDuration()
        if (d > 0) setDuration(d)
        setDecoding(false)
      })
      .catch((err) => {
        if (cancelled) return
        setDecoding(false)
        setDecodeError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
      engine.stopAll()
      hostRef.current?.destroy()
      hostRef.current = null
    }
  }, [song.videoId])

  useEffect(() => {
    if (!showVideo) {
      hostRef.current?.destroy()
      hostRef.current = null
      setYtReady(false)
      return
    }
    if (decoding || decodeError || hostRef.current) return
    let disposed = false
    const container = containerRef.current
    if (!container) return

    const host = new YouTubeHost()
    hostRef.current = host
    void host
      .mount(container, song.videoId, (state: YTState) => {
        if (disposed || !engine.hasBuffers()) return
        if (state === 'playing') {
          videoSyncAtRef.current = 0
          if (!playingRef.current) {
            host.pause()
          }
        }
      })
      .then(() => {
        if (!disposed) setYtReady(true)
      })

    return () => {
      disposed = true
    }
    return () => {
      disposed = true
    }
  }, [song.videoId, decoding, decodeError, showVideo])

  useEffect(() => {
    engine.applyMix(vols, mutes, solos, master)
  }, [vols, mutes, solos, master])

  useEffect(
    () =>
      window.stemkit.onJobEvent((ev) => {
        if (ev.data.videoId !== song.videoId || ev.kind === 'done') return
        if (ev.kind === 'progress') {
          if (ev.data.resplit) setAddProgress({ pct: ev.data.pct, message: ev.data.message })
        } else {
          setAddProgress(null)
          if (ev.data.resplit) setAddError(ev.data.message)
        }
      }),
    [song.videoId]
  )

  // click como stem: gerado das batidas (com ½×/2×) depois que os stems carregam
  useEffect(() => {
    if (decoding) return
    if (!beats) {
      engine.setStemBuffer('click', null)
      setBuffers((prev) => {
        if (!prev.click) return prev
        const { click: _drop, ...rest } = prev
        return rest
      })
      return
    }
    const stemDuration = Math.max(
      0,
      ...Object.entries(buffers)
        .filter(([id, b]) => id !== 'click' && b)
        .map(([, b]) => b!.duration)
    )
    if (stemDuration <= 0) return
    const grid = applyFactor(beats, clickFactor)
    const click = renderClick(grid.beats, grid.downbeats, stemDuration)
    engine.setStemBuffer('click', click)
    setBuffers((prev) => ({ ...prev, click }))
    setVols((prev) => ('click' in prev ? prev : { ...prev, click: 1 }))
    // buffers fica fora das dependências: o próprio click mudaria buffers e geraria de novo
  }, [beats, clickFactor, decoding])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (): void => {
      posRef.current = engine.expected()

      // o loop deu a volta (B -> A): o video nao repete sozinho, entao pula junto
      const wrapped = loopActiveRef.current && posRef.current < prevPosRef.current - 0.3
      prevPosRef.current = posRef.current
      if (wrapped) {
        videoSyncAtRef.current = performance.now()
        hostRef.current?.seek(posRef.current)
      }

      const dur = engine.trackDuration()
      if (dur > 0 && posRef.current >= dur - 0.03) {
        posRef.current = dur
        engine.stopAll()
        playingRef.current = false
        setPlaying(false)
        hostRef.current?.pause()
        setBump((n) => n + 1)
        return
      }

      const now = performance.now()
      if (now - videoSyncAtRef.current > VIDEO_RESYNC_COOLDOWN) {
        const v = hostRef.current?.time() ?? 0
        if (Math.abs(v - posRef.current) > VIDEO_DRIFT_LIMIT) {
          videoSyncAtRef.current = now
          hostRef.current?.seek(posRef.current)
        }
      }
    }
    const loop = (): void => {
      tick()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const backup = setInterval(tick, 400)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(backup)
    }
  }, [playing])

  useEffect(() => {
    const id = setInterval(() => {
      const d = hostRef.current?.duration() ?? 0
      if (d > 0) {
        setDuration((prev) => (Math.abs(prev - d) > 0.5 ? d : prev))
      }
    }, 600)
    return () => clearInterval(id)
  }, [])

  const togglePlay = useCallback((): void => {
    if (decoding || decodeError) return
    if (playingRef.current) {
      playingRef.current = false
      engine.setPlaying(false, posRef.current)
      hostRef.current?.pause()
      setPlaying(false)
    } else {
      playingRef.current = true
      engine.resume()
      engine.setPlaying(true, posRef.current)
      hostRef.current?.play()
      setPlaying(true)
    }
  }, [decoding, decodeError, showVideo])

  const seekTo = useCallback(
    (t: number): void => {
      const clamped = Math.max(0, Math.min(duration > 0 ? duration - 0.05 : t, t))
      posRef.current = clamped
      engine.setPlaying(playingRef.current, clamped)
      videoSyncAtRef.current = performance.now()
      hostRef.current?.seek(clamped)
      setBump((n) => n + 1)
    },
    [duration]
  )

  const applyLoop = useCallback((a: number | null, b: number | null, on: boolean): void => {
    setLoopA(a)
    setLoopB(b)
    setLoopOn(on)
    loopActiveRef.current = on && a !== null && b !== null
    engine.setLoop(a, b, on)
  }, [])

  const markA = useCallback((): void => {
    const t = posRef.current
    // A depois do B antigo invalida o B
    if (loopB !== null && t >= loopB - 0.2) applyLoop(t, null, false)
    else applyLoop(t, loopB, loopB !== null)
  }, [loopB, applyLoop])

  const markB = useCallback((): void => {
    const t = posRef.current
    const a = loopA ?? 0 // B sem A: o loop vai do começo da música até o B
    if (t <= a + 0.2) return
    applyLoop(a, t, true)
  }, [loopA, applyLoop])

  const toggleLoop = useCallback((): void => {
    if (loopA === null || loopB === null) return
    applyLoop(loopA, loopB, !loopOn)
  }, [loopA, loopB, loopOn, applyLoop])

  const clearLoop = useCallback((): void => applyLoop(null, null, false), [applyLoop])

  const toggleClick = useCallback((): void => {
    if (!beats) return
    setPreset('custom')
    setMutes((prev) => {
      const next = new Set(prev)
      if (next.has('click')) next.delete('click')
      else next.add('click')
      return next
    })
  }, [beats])

  const analyzeBeats = useCallback((): void => {
    setAnalyzing(true)
    setClickError(null)
    const videoId = song.videoId
    window.stemkit
      .analyzeBeats(videoId)
      .then((grid) => {
        // trocou de música enquanto analisava: o resultado já ficou salvo no disco
        if (videoId !== songIdRef.current) return
        setBeats(grid)
      })
      .catch((err) => {
        if (videoId === songIdRef.current) setClickError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (videoId === songIdRef.current) setAnalyzing(false)
      })
  }, [song.videoId])

  const getPosition = useCallback((): number => {
    void bump
    return posRef.current
  }, [bump])

  const missingStems = SEPARABLE.filter((id) => !(song.stems ?? []).includes(id))
  // guitarra/piano só saem do motor de 6 fontes: numa música separada em 4, refaz tudo
  const addNeedsSix =
    [...addPick].some((id) => id === 'guitar' || id === 'piano') &&
    !(song.model ?? '').startsWith('htdemucs_6s')

  const toggleAddPick = (id: StemId): void =>
    setAddPick((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirmAddStems = (): void => {
    if (addPick.size === 0) return
    setAddError(null)
    setAddProgress({ pct: 0, message: 'Starting…' })
    setAddOpen(false)
    void window.stemkit.addStems(song.videoId, [...addPick])
    setAddPick(new Set())
  }

  // o click só existe em memória: grava stems/click.wav antes de exportar
  const saveClick = useCallback(async (): Promise<void> => {
    if (buffers.click) await window.stemkit.saveClick(song.videoId, encodeWav(buffers.click))
  }, [buffers.click, song.videoId])

  const exportStem = useCallback(
    (stem: string): void => {
      void (async () => {
        if (stem === 'click') await saveClick()
        await window.stemkit.exportStem(song.videoId, stem)
      })()
    },
    [song.videoId, saveClick]
  )

  const exportAllStems = useCallback((): void => {
    void (async () => {
      await saveClick()
      await window.stemkit.exportAllStems(song.videoId)
    })()
  }, [song.videoId, saveClick])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'KeyA') markA()
      else if (e.code === 'KeyB') markB()
      else if (e.code === 'KeyL') toggleLoop()
      else if (e.code === 'KeyC') toggleClick()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, markA, markB, toggleLoop, toggleClick])

  const applyPreset = (p: PresetId): void => {
    setPreset(p)
    setMutes(new Set())
    if (p === 'all') setSolos(new Set())
    else if (p === 'karaoke')
      setSolos(new Set<StemId>(stemMeta.filter((s) => s.id !== 'vocals').map((s) => s.id)))
    else if (p === 'acapella') setSolos(new Set<StemId>(['vocals']))
    else if (p === 'drumnbass') setSolos(new Set<StemId>(['drums', 'bass']))
  }

  const toggleMute = (id: StemId): void => {
    setPreset('custom')
    const turningOn = !mutes.has(id)
    if (turningOn && solos.has(id)) {
      setSolos((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
    setMutes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSolo = (id: StemId): void => {
    setPreset('custom')
    const turningOn = !solos.has(id)
    if (turningOn && mutes.has(id)) {
      setMutes((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
    setSolos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col">
      <header className="drag-region h-14 shrink-0 flex items-center justify-between px-6">
        <h2 className="text-sm font-semibold truncate">{song.title}</h2>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-stretch gap-4 h-[220px]">
            {showVideo && (
              <div className="relative w-[391px] shrink-0">
                <div className="absolute -inset-4 bg-violet-500/10 blur-3xl rounded-full pointer-events-none" />
                <div className="absolute inset-0 rounded-xl overflow-hidden ring-1 ring-white/10 bg-black shadow-2xl shadow-black/60">
                  <div ref={containerRef} className="absolute inset-0 [&_iframe]:w-full [&_iframe]:h-full" />
                  {!ytReady && (
                    <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                      <span className="text-[10px] text-white/40 tracking-widest uppercase">loading…</span>
                    </div>
                  )}
                  {decodeError && (
                    <div className="absolute inset-x-3 bottom-3 flex justify-center rise-in">
                      <div className="glass rounded-lg px-3 py-1.5 text-xs text-rose-300 break-words">
                        {decodeError}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <aside className="flex-1 min-w-0 glass rounded-2xl px-6 py-5 rise-in flex flex-col justify-between">
              <div className="flex items-center gap-4">
                <SongThumb
                  videoId={song.videoId}
                  className="w-32 h-[72px] rounded-lg object-cover bg-white/5 shrink-0 block"
                  iconClassName="w-7 h-7 text-white/25"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold leading-snug truncate">{song.title}</h3>
                  <p className="text-xs text-white/45 mt-1.5 font-mono truncate">
                    {fmtTime(song.duration)} · added {addedLabel}
                    {song.took ? ` · split in ${fmtTime(song.took)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-white/5 text-white/50 font-medium">
                  {stemMeta.length} stems
                </span>
              </div>

              {!showVideo && decodeError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-400/20 px-3 py-2 text-xs text-rose-200 break-words">
                  {decodeError}
                </div>
              )}

              <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
                {stemMeta.map((meta) => (
                  <span key={meta.id} className="flex items-center gap-2 text-[14px] text-white/75">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                    <span className="capitalize">{meta.label}</span>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {missingStems.length > 0 && (
                  <button
                    onClick={() => setAddOpen((o) => !o)}
                    disabled={decoding || !!decodeError || !!addProgress}
                    className="no-drag glass rounded-xl px-5 py-3 text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                  >
                    + Add stems
                  </button>
                )}
                <button
                  onClick={exportAllStems}
                  disabled={decoding || !!decodeError || !!addProgress}
                  className="no-drag glass rounded-xl px-5 py-3 text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 disabled:opacity-40"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Export everything
                </button>
                {youtubeUrl && (
                  <button
                    onClick={() => window.stemkit.openExternal(youtubeUrl)}
                    className="no-drag glass rounded-xl px-5 py-3 text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Open on YouTube
                  </button>
                )}
              </div>

            </aside>
          </div>

          <Transport
            playing={playing}
            duration={duration}
            getPosition={getPosition}
            onTogglePlay={togglePlay}
            onSeek={seekTo}
            preset={preset === 'custom' ? 'all' : preset}
            onPreset={applyPreset}
            master={master}
            onMaster={setMaster}
            youtubeUrl={youtubeUrl ?? undefined}
            loopA={loopA}
            loopB={loopB}
            loopOn={loopOn}
            onMarkA={markA}
            onMarkB={markB}
            onToggleLoop={toggleLoop}
            onClearLoop={clearLoop}
            click={{
              available: !!beats,
              bpm: beats?.bpm ?? null,
              factor: clickFactor,
              analyzing,
              error: clickError
            }}
            onClickFactor={setClickFactor}
            onAnalyzeBeats={analyzeBeats}
          />

          <div className="mt-4 space-y-2">
            {decoding
              ? [...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="glass rounded-xl h-16 animate-pulse"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))
              : stemMeta.map((meta) => (
              <StemLane
                key={meta.id}
                meta={meta}
                buffer={buffers[meta.id] ?? null}
                duration={duration}
                getPosition={getPosition}
                audible={isAudible(meta.id, mutes, solos)}
                volume={vols[meta.id] ?? 1}
                muted={mutes.has(meta.id)}
                soloed={solos.has(meta.id)}
                onToggleMute={() => toggleMute(meta.id)}
                onToggleSolo={() => toggleSolo(meta.id)}
                onVolume={(v) => setVols((prev) => ({ ...prev, [meta.id]: v }))}
                onSeek={seekTo}
                onExport={() => exportStem(meta.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* adicionar stem: janela própria (no quadro da música ela ficava cortada) */}
      {createPortal(
        <>
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setAddOpen(false)
            setAddPick(new Set())
          }}
        >
          <div
            className="glass rounded-2xl p-6 w-[440px] max-w-[calc(100vw-32px)] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-[15px] font-semibold">Add stems</h3>
              <p className="text-[12px] text-white/45 mt-1">{song.title}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {missingStems.map((id) => {
                const info = STEM_INFO[id]
                const on = addPick.has(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleAddPick(id)}
                    className="no-drag flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors capitalize"
                    style={{
                      color: on ? info.color : 'rgba(255,255,255,0.6)',
                      borderColor: on ? info.color : 'rgba(255,255,255,0.12)',
                      background: on ? `${info.color}22` : 'transparent'
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />
                    {info.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[12px] text-white/50 leading-relaxed">
              {addNeedsSix
                ? 'Guitar and piano need the 6-source engine: the whole song will be split again from the saved audio. No re-upload needed.'
                : 'Instant if the stem was already computed. Otherwise the song is split again from the saved audio. No re-upload needed.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setAddOpen(false)
                  setAddPick(new Set())
                }}
                className="no-drag px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/10 text-white/70 text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddStems}
                disabled={addPick.size === 0}
                className="no-drag px-4 py-2 rounded-lg bg-violet-500/90 hover:bg-violet-500 text-white text-[13px] font-semibold disabled:opacity-40"
              >
                Add {addPick.size > 0 ? addPick.size : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* progresso/erro: aviso fixo no canto, a música continua tocando */}
      {(addProgress || addError) && (
        <div className="fixed bottom-5 right-5 z-40 glass rounded-xl p-4 w-[320px] flex flex-col gap-2 shadow-2xl">
          {addProgress ? (
            <>
              <div className="flex items-center justify-between text-[12px] text-white/70">
                <span className="truncate">{addProgress.message ?? 'Adding stems'}</span>
                <span className="tabular-nums ml-2">{Math.round(addProgress.pct)}%</span>
              </div>
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-violet-400 transition-all" style={{ width: `${addProgress.pct}%` }} />
              </div>
              <button
                onClick={() => void window.stemkit.cancelJob(song.videoId)}
                className="no-drag self-start text-[11px] text-white/45 hover:text-white"
              >
                Cancel and keep current stems
              </button>
            </>
          ) : (
            <>
              <p className="text-[12px] text-rose-200 break-words">Could not add stems: {addError}</p>
              <button
                onClick={() => setAddError(null)}
                className="no-drag self-start text-[11px] text-white/45 hover:text-white"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
        </>,
        document.body
      )}
    </div>
  )
}
