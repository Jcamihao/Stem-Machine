import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppSettings, BeatGrid, SectionMap, Song, StemId } from '../../../shared/types'
import { engine, decodePayload, isAudible, renderClick, type BufferMap } from '../lib/engine'
import { encodeWav } from '../lib/wav'
import { decodeGuideClips, renderGuide, type GuideClips } from '../lib/guide'
import { buildStemMeta, STEM_INFO } from '../lib/stems'
import { StudioHeader, type MenuItem } from './studio/StudioHeader'
import { Ruler } from './studio/Ruler'
import { Playhead } from './studio/Playhead'
import { TrackRow } from './studio/TrackRow'
import { TransportBar } from './studio/TransportBar'
import { SectionBar } from './SectionBar'

export type ClickFactor = 0.5 | 1 | 2

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
const GENERATED: StemId[] = ['click', 'guide']

// falas da guia: geradas/decodificadas uma vez por sessão
let guideClipsPromise: Promise<GuideClips> | null = null
function loadGuideClips(): Promise<GuideClips> {
  guideClipsPromise ??= window.stemkit
    .getGuideClips()
    .then(decodeGuideClips)
    .catch((err) => {
      guideClipsPromise = null
      throw err
    })
  return guideClipsPromise
}

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
  onBack: () => void
}

export function Player({ song, onBack }: Props): React.ReactElement {
  const posRef = useRef(0)
  const playingRef = useRef(false)
  const songIdRef = useRef(song.videoId)

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
  const [pans, setPans] = useState<Partial<Record<StemId, number>>>({})
  const [showSections, setShowSections] = useState(true)
  const [loopA, setLoopA] = useState<number | null>(null)
  const [loopB, setLoopB] = useState<number | null>(null)
  const [loopOn, setLoopOn] = useState(false)
  const [beats, setBeats] = useState<BeatGrid | null>(null)
  const [clickFactor, setClickFactor] = useState<ClickFactor>(1)
  const [analyzing, setAnalyzing] = useState(false)
  const [clickError, setClickError] = useState<string | null>(null)
  const [sections, setSections] = useState<SectionMap | null>(null)
  // já sabemos se a música tem batidas/seções salvas (para detectar sozinho se não tiver)
  const [checked, setChecked] = useState({ beats: false, sections: false })
  const [sectionsBusy, setSectionsBusy] = useState(false)
  const [sectionsError, setSectionsError] = useState<string | null>(null)
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

  useEffect(() => {
    posRef.current = 0
    setPlaying(false)
    playingRef.current = false
    setDecodeError(null)
    setBuffers({})
    setDuration(song.duration || 0)
    setVols({})
    setMutes(new Set())
    setSolos(new Set())
    setPans({})
    setLoopA(null)
    setLoopB(null)
    setLoopOn(false)
    engine.stopAll()
    engine.setLoop(null, null, false)
    songIdRef.current = song.videoId
    setBeats(null)
    setClickFactor(1)
    setClickError(null)
    setAnalyzing(false)

    let cancelled = false
    setChecked({ beats: false, sections: false })
    void window.stemkit.getBeats(song.videoId).then((grid) => {
      if (cancelled) return
      setBeats(grid)
      setChecked((c) => ({ ...c, beats: true }))
      // grade da versão 1 (sem DBN, "1" único para a música toda): refaz em segundo plano
      if (grid && grid.version < 2) {
        void window.stemkit
          .analyzeBeats(song.videoId)
          .then((next) => {
            if (!cancelled) setBeats(next)
          })
          .catch(() => {})
      }
    })
    setSections(null)
    setSectionsError(null)
    setSectionsBusy(false)
    void window.stemkit.getSections(song.videoId).then((map) => {
      if (cancelled) return
      setSections(map)
      setChecked((c) => ({ ...c, sections: true }))
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
    }
  }, [song.videoId])


  useEffect(() => {
    engine.applyMix(vols, mutes, solos, master)
  }, [vols, mutes, solos, master])

  useEffect(() => {
    for (const [id, value] of Object.entries(pans)) engine.setPan(id as StemId, value ?? 0)
  }, [pans])

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
        .filter(([id, b]) => !GENERATED.includes(id as StemId) && b)
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

  // guia de voz como stem: precisa das batidas e das seções
  const [guideError, setGuideError] = useState<string | null>(null)
  useEffect(() => {
    if (decoding) return
    const list = sections?.sections
    if (!beats || !list?.length) {
      engine.setStemBuffer('guide', null)
      setBuffers((prev) => {
        if (!prev.guide) return prev
        const { guide: _drop, ...rest } = prev
        return rest
      })
      return
    }
    const stemDuration = Math.max(
      0,
      ...Object.entries(buffers)
        .filter(([id, b]) => !GENERATED.includes(id as StemId) && b)
        .map(([, b]) => b!.duration)
    )
    if (stemDuration <= 0) return
    let cancelled = false
    setGuideError(null)
    loadGuideClips()
      .then((clips) => {
        if (cancelled) return
        const guide = renderGuide(list, beats, clips, stemDuration)
        engine.setStemBuffer('guide', guide)
        setBuffers((prev) => ({ ...prev, guide }))
        setVols((prev) => ('guide' in prev ? prev : { ...prev, guide: 1 }))
      })
      .catch((err) => {
        if (!cancelled) setGuideError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [beats, sections, decoding])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (): void => {
      posRef.current = engine.expected()

      const dur = engine.trackDuration()
      if (dur > 0 && posRef.current >= dur - 0.03) {
        posRef.current = dur
        engine.stopAll()
        playingRef.current = false
        setPlaying(false)
        setBump((n) => n + 1)
        return
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


  const togglePlay = useCallback((): void => {
    if (decoding || decodeError) return
    if (playingRef.current) {
      playingRef.current = false
      engine.setPlaying(false, posRef.current)
      setPlaying(false)
    } else {
      playingRef.current = true
      engine.resume()
      engine.setPlaying(true, posRef.current)
      setPlaying(true)
    }
  }, [decoding, decodeError])

  const seekTo = useCallback(
    (t: number): void => {
      const clamped = Math.max(0, Math.min(duration > 0 ? duration - 0.05 : t, t))
      posRef.current = clamped
      engine.setPlaying(playingRef.current, clamped)
      setBump((n) => n + 1)
    },
    [duration]
  )

  const applyLoop = useCallback((a: number | null, b: number | null, on: boolean): void => {
    setLoopA(a)
    setLoopB(b)
    setLoopOn(on)
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

  const analyzeSections = useCallback((): void => {
    setSectionsBusy(true)
    setSectionsError(null)
    const videoId = song.videoId
    window.stemkit
      .analyzeSections(videoId)
      .then((map) => {
        if (videoId === songIdRef.current) setSections(map)
      })
      .catch((err) => {
        if (videoId === songIdRef.current) setSectionsError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (videoId === songIdRef.current) setSectionsBusy(false)
      })
  }, [song.videoId])

  // correção manual do nome: fica salva e marca o mapa como editado
  const renameSection = useCallback(
    (index: number, label: string): void => {
      if (!sections) return
      const next: SectionMap = {
        ...sections,
        edited: true,
        sections: sections.sections.map((s, i) => (i === index ? { ...s, label } : s))
      }
      setSections(next)
      void window.stemkit.saveSections(song.videoId, next)
    },
    [sections, song.videoId]
  )

  const loopSection = useCallback(
    (index: number): void => {
      const s = sections?.sections[index]
      if (s) applyLoop(s.start, s.end, true)
    },
    [sections, applyLoop]
  )

  // música sem batidas ou sem seções (separada antes, ou a detecção falhou): detecta
  // sozinho uma vez ao abrir; se der erro, fica o aviso e o menu ⋮ para tentar de novo
  useEffect(() => {
    if (checked.beats && !beats && !analyzing && !clickError) analyzeBeats()
  }, [checked.beats])
  useEffect(() => {
    if (checked.sections && !sections && !sectionsBusy && !sectionsError) analyzeSections()
  }, [checked.sections])

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

  // click e guia só existem em memória: viram stems/<nome>.wav antes de exportar
  const saveGenerated = useCallback(
    async (stem: 'click' | 'guide'): Promise<void> => {
      const buffer = buffers[stem]
      if (buffer) await window.stemkit.saveGenerated(song.videoId, stem, encodeWav(buffer))
    },
    [buffers, song.videoId]
  )

  const exportStem = useCallback(
    (stem: string): void => {
      void (async () => {
        if (stem === 'click' || stem === 'guide') await saveGenerated(stem)
        await window.stemkit.exportStem(song.videoId, stem)
      })()
    },
    [song.videoId, saveGenerated]
  )

  const exportAllStems = useCallback((): void => {
    void (async () => {
      await saveGenerated('click')
      await saveGenerated('guide')
      await window.stemkit.exportAllStems(song.videoId)
    })()
  }, [song.videoId, saveGenerated])

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

  const toggleMute = (id: StemId): void => {
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

  // voltar/avançar: começo da seção anterior/próxima (sem seções: 5 segundos)
  const jump = (dir: -1 | 1): void => {
    const pos = posRef.current
    const starts = (sections?.sections ?? []).map((x) => x.start)
    if (starts.length) {
      const target =
        dir > 0
          ? starts.find((t) => t > pos + 0.5)
          : [...starts].reverse().find((t) => t < pos - 1.5)
      seekTo(target ?? (dir > 0 ? duration : 0))
    } else seekTo(Math.max(0, pos + dir * 5))
  }

  const clickGrid = beats ? applyFactor(beats, clickFactor) : null
  const exportItems: MenuItem[] = [
    { label: 'Exportar todas as faixas', onClick: exportAllStems, disabled: decoding || !!addProgress },
    ...stemMeta.map((meta) => ({
      label: `Exportar ${meta.label}`,
      onClick: () => exportStem(meta.id),
      disabled: decoding || !!addProgress
    }))
  ]
  const menuItems: MenuItem[] = [
    ...(youtubeUrl ? [{ label: 'Abrir no YouTube', onClick: () => window.stemkit.openExternal(youtubeUrl) }] : []),
    {
      label: beats ? 'Detectar batidas de novo' : 'Detectar batidas (metrônomo)',
      onClick: analyzeBeats,
      disabled: analyzing
    },
    {
      label: sections ? 'Detectar seções de novo' : 'Detectar seções',
      onClick: analyzeSections,
      disabled: sectionsBusy
    },
    ...(loopA !== null || loopB !== null ? [{ label: 'Limpar loop', onClick: clearLoop }] : [])
  ]
  const notices = [
    analyzing && 'Detectando batidas…',
    sectionsBusy && 'Detectando seções…',
    clickError && `Metrônomo: ${clickError}`,
    sectionsError && `Seções: ${sectionsError}`,
    guideError && `Guia: ${guideError}`,
    decodeError
  ].filter(Boolean) as string[]

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-white">
      <StudioHeader
        title={song.title}
        videoId={song.videoId}
        onBack={onBack}
        canAddStems={missingStems.length > 0 && !decoding && !addProgress}
        onAddStems={() => setAddOpen(true)}
        bpm={beats ? beats.bpm * clickFactor : null}
        beatsPerBar={beats?.beatsPerBar ?? null}
        exportItems={exportItems}
        menuItems={menuItems}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="relative pr-3">
          {showSections && sections && sections.sections.length > 0 && (
            <div className="flex">
              <div className="w-[214px] shrink-0" />
              <div className="flex-1 min-w-0">
                <SectionBar
                  sections={sections.sections}
                  duration={duration}
                  onSeek={seekTo}
                  onRename={renameSection}
                  onLoop={loopSection}
                />
              </div>
            </div>
          )}
          <div className="flex mb-3">
            <div className="w-[214px] shrink-0" />
            <div className="flex-1 min-w-0">
              <Ruler
                duration={duration}
                beats={clickGrid?.beats ?? []}
                downbeats={clickGrid?.downbeats ?? []}
                loopA={loopA}
                loopB={loopB}
                loopOn={loopOn}
                onSeek={seekTo}
                onSelectLoop={(a, b) => applyLoop(a, b, true)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pb-4">
            {decoding
              ? [...Array(5)].map((_, i) => (
                  <div key={i} className="flex h-16">
                    <div className="w-[214px] shrink-0" />
                    <div className="flex-1 rounded-md bg-white/[0.06] animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
                  </div>
                ))
              : stemMeta.map((meta) => (
                  <TrackRow
                    key={meta.id}
                    id={meta.id}
                    label={meta.label}
                    buffer={buffers[meta.id] ?? null}
                    duration={duration}
                    audible={isAudible(meta.id, mutes, solos)}
                    muted={mutes.has(meta.id)}
                    soloed={solos.has(meta.id)}
                    volume={vols[meta.id] ?? 1}
                    pan={pans[meta.id] ?? 0}
                    onToggleMute={() => toggleMute(meta.id)}
                    onToggleSolo={() => toggleSolo(meta.id)}
                    onVolume={(v) => setVols((prev) => ({ ...prev, [meta.id]: v }))}
                    onPan={(v) => setPans((prev) => ({ ...prev, [meta.id]: v }))}
                    onSeek={seekTo}
                  >
                    {meta.id === 'click' && (
                      <div className="absolute top-1.5 left-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {([0.5, 1, 2] as ClickFactor[]).map((f) => (
                          <button
                            key={f}
                            onClick={() => setClickFactor(f)}
                            title={f === 1 ? 'Pulso detectado' : f === 2 ? 'Dobro do pulso' : 'Metade do pulso'}
                            className={`no-drag px-1.5 h-4 rounded-[3px] text-[9px] font-bold ${
                              clickFactor === f ? 'bg-white text-black' : 'bg-black/45 text-white hover:bg-black/60'
                            }`}
                          >
                            {f === 0.5 ? '0.5x' : f === 2 ? '2x' : '1x'}
                          </button>
                        ))}
                      </div>
                    )}
                  </TrackRow>
                ))}
          </div>

          <div className="absolute top-0 bottom-0 left-[214px] right-3 pointer-events-none">
            <Playhead duration={duration} getPosition={getPosition} />
          </div>
        </div>
      </div>

      <TransportBar
        playing={playing}
        duration={duration}
        getPosition={getPosition}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onPrev={() => jump(-1)}
        onNext={() => jump(1)}
        loopOn={loopOn}
        onToggleLoop={() => {
          if (loopA !== null && loopB !== null) toggleLoop()
          else {
            // sem trecho marcado: faz loop da seção atual
            const pos = posRef.current
            const current = sections?.sections.find((x) => pos >= x.start && pos < x.end)
            if (current) applyLoop(current.start, current.end, true)
          }
        }}
        master={master}
        onMaster={setMaster}
        showSections={showSections}
        onToggleSections={() => setShowSections((v) => !v)}
      />

      {notices.length > 0 && (
        <div className="fixed bottom-24 left-5 z-40 flex flex-col gap-1.5 max-w-[360px]">
          {notices.map((n) => (
            <div key={n} className="bg-[#1c1c1c] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 shadow-xl">
              {n}
            </div>
          ))}
        </div>
      )}

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
