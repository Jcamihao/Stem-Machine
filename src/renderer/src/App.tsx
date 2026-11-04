import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, EnvStatus, JobProgress, JobStage, Scene, Song } from '../../shared/types'
import { MODEL_DEFAULT } from '../../shared/types'
import { parseVideoId } from '../../shared/url'
import { localSongId, isLocalId } from '../../shared/local'
import { Library } from './components/Library'
import { BackIcon } from './components/studio/icons'
import { Home } from './components/Home'
import { Processing } from './components/Processing'
import { Player } from './components/Player'
import { Setup } from './components/Setup'
import { Settings } from './components/Settings'
import { About } from './components/About'
import { LogoMark } from './components/Icons'
import { pad } from './lib/pad'
import { metronome } from './lib/metronome'
import { registerCommandHandler } from './lib/commands'
import { stepSong, type SceneSong } from './lib/scenes'
import { ScenesPanel, type SongMeta } from './components/ScenesPanel'
import { MidiPanel } from './components/MidiPanel'
import { midi } from './lib/midi'
import { RemotePanel } from './components/RemotePanel'
import * as remote from './lib/remote'

interface EnvLog {
  message: string
  level: string
}

// what the retry button re-runs: the original url or the picked local file
type LastStart =
  | { kind: 'url'; url: string; model: string }
  | { kind: 'local'; filePath: string; model: string }

function stageLabel(stage: JobStage, pct: number): string {
  switch (stage) {
    case 'metadata':
      return 'reading info…'
    case 'download':
      return `downloading ${Math.round(pct)}%`
    case 'convert':
      return 'converting…'
    case 'separate':
      return `separating ${Math.round(pct)}%`
    case 'finalize':
      return 'finishing…'
  }
}

function withoutKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _drop, ...rest } = map
  return rest
}

export default function App(): React.ReactElement {
  const [status, setStatus] = useState<EnvStatus | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  // tela "Adicionar" (busca no YouTube / arquivo local), aberta pela biblioteca
  const [adding, setAdding] = useState(false)
  const [jobs, setJobs] = useState<Record<string, JobProgress>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lastStart, setLastStart] = useState<LastStart | null>(null)
  const [envLogs, setEnvLogs] = useState<EnvLog[]>([])
  const [appVersion, setAppVersion] = useState<string | undefined>(undefined)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // cenas (setlist): a cena em andamento guarda em qual música ela está
  const [scenes, setScenes] = useState<Scene[]>([])
  const [scenesOpen, setScenesOpen] = useState(false)
  const [midiOpen, setMidiOpen] = useState(false)
  const [meta, setMeta] = useState<SongMeta>({}) // tom (com transposição salva) e BPM de cada música
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [activeScene, setActiveScene] = useState<{ id: string; index: number } | null>(null)
  const [autoPlay, setAutoPlay] = useState(false) // a música aberta pela cena já começa tocando

  useEffect(() => {
    void window.stemkit.envStatus().then(setStatus)
    void window.stemkit.listSongs().then(setSongs)
    void window.stemkit.getSettings().then(setSettings)
    void window.stemkit.listScenes().then(setScenes)
    const offSettings = window.stemkit.onSettingsChange(setSettings)
    const offJob = window.stemkit.onJobEvent((ev) => {
      // "adicionar stem" acontece dentro do player (ele mostra progresso e erro)
      if (ev.kind !== 'done' && ev.data.resplit) return
      if (ev.kind === 'progress') {
        setJobs((prev) => ({ ...prev, [ev.data.videoId]: ev.data }))
        setErrors((prev) => (prev[ev.data.videoId] ? withoutKey(prev, ev.data.videoId) : prev))
      } else if (ev.kind === 'done') {
        setJobs((prev) => withoutKey(prev, ev.data.videoId))
        setErrors((prev) => withoutKey(prev, ev.data.videoId))
        void window.stemkit.listSongs().then(setSongs)
      } else if (ev.data.message === 'Cancelled') {
        setJobs((prev) => withoutKey(prev, ev.data.videoId))
      } else {
        setJobs((prev) => withoutKey(prev, ev.data.videoId))
        setErrors((prev) => ({ ...prev, [ev.data.videoId]: ev.data.message }))
      }
    })
    const offEnv = window.stemkit.onEnvEvent((e) =>
      setEnvLogs((l) => [...l.slice(-300), { message: e.message, level: e.level }])
    )
    const offAbout = window.stemkit.onShowAbout(() => setAboutOpen(true))
    void window.stemkit.getAppVersion().then(setAppVersion)
    return () => {
      offJob()
      offEnv()
      offAbout()
      offSettings()
    }
  }, [])

  // o pad vive fora do player: preferências e saída L/R vêm daqui
  useEffect(() => {
    if (settings) {
      pad.applySettings(settings)
      metronome.applySettings(settings)
      remote.setApp({ outputSplit: settings.outputSplit })
    }
  }, [settings])

  // O metrônomo avulso só existe entre músicas. Ao escolher uma, o click do
  // player (sincronizado às batidas detectadas) assume o controle.
  useEffect(() => {
    if (activeId) metronome.stop()
  }, [activeId])

  // MIDI escuta em qualquer tela (o mapa vem das configurações)
  useEffect(() => {
    void midi.start()
  }, [])
  useEffect(() => {
    if (settings) midi.applySettings(settings)
  }, [settings])

  useEffect(() => {
    if (status?.ready && envLogs.length > 0) {
      void window.stemkit.envStatus().then(setStatus)
    }
  }, [status?.ready])

  const startUrl = useCallback(
    async (url: string, model: string = MODEL_DEFAULT, stems?: string[]): Promise<void> => {
      const vid = parseVideoId(url)
      if (!vid) return
      setAdding(false)
      setActiveId(vid)
      setLastStart({ kind: 'url', url, model })
      setErrors((prev) => withoutKey(prev, vid))
      setJobs((prev) =>
        prev[vid]
          ? prev
          : { ...prev, [vid]: { videoId: vid, stage: 'metadata', pct: 0, message: 'Starting…', model } }
      )
      await window.stemkit.startJob(url, model, stems)
    },
    []
  )

  const startLocal = useCallback(
    async (filePath: string, model: string = MODEL_DEFAULT, stems?: string[]): Promise<void> => {
      const id = localSongId(filePath)
      setAdding(false)
      setActiveId(id)
      setLastStart({ kind: 'local', filePath, model })
      setErrors((prev) => withoutKey(prev, id))
      setJobs((prev) =>
        prev[id]
          ? prev
          : { ...prev, [id]: { videoId: id, stage: 'convert', pct: 0, message: 'Starting…', model } }
      )
      await window.stemkit.startLocalJob(filePath, model, stems)
    },
    []
  )

  const cancelSelectedJob = useCallback(
    (videoId: string): void => {
      void window.stemkit.cancelJob(videoId)
      setJobs((prev) => withoutKey(prev, videoId))
    },
    []
  )

  const retryJob = useCallback((): void => {
    if (!lastStart) return
    if (lastStart.kind === 'url') void startUrl(lastStart.url, lastStart.model)
    else void startLocal(lastStart.filePath, lastStart.model)
  }, [lastStart, startUrl, startLocal])

  const updateYtDlp = useCallback(async (): Promise<void> => {
    await window.stemkit.envUpdateYtDlp()
    if (lastStart?.kind === 'url') void startUrl(lastStart.url, lastStart.model)
  }, [lastStart, startUrl])

  const deleteSong = useCallback(
    async (videoId: string): Promise<void> => {
      if (jobs[videoId]) return
      setErrors((prev) => withoutKey(prev, videoId))
      await window.stemkit.deleteSong(videoId)
      setSongs(await window.stemkit.listSongs())
      setActiveId((cur) => (cur === videoId ? null : cur))
    },
    [jobs]
  )

  // tom e BPM para o setlist: refaz quando a biblioteca muda, ao abrir outra música (a transposição pode ter mudado) e ao abrir o painel
  useEffect(() => {
    void window.stemkit.libraryMeta().then(setMeta)
  }, [songs, activeId, scenesOpen])

  const saveScenes = useCallback((next: Scene[]): void => {
    setScenes(next)
    void window.stemkit.saveScenes(next).then(setScenes)
  }, [])

  // pad entre músicas: entra no tom da música que a cena abriu e some quando ela der play.
  // padGen invalida o pedido se você der play antes de o tom chegar
  const padFromScene = useRef(false)
  const padGen = useRef(0)
  const settingsRef = useRef(settings) // stepScene é memorizado: lê sempre a configuração atual
  settingsRef.current = settings
  const padForSong = (videoId: string): void => {
    if (!settingsRef.current?.padBetween) return
    const gen = ++padGen.current
    void window.stemkit.songPadKey(videoId).then((key) => {
      if (key === null || gen !== padGen.current) return
      padFromScene.current = true
      void pad.playKey(key)
    })
  }
  const onSongPlayStart = (): void => {
    padGen.current++
    if (!padFromScene.current) return
    padFromScene.current = false
    pad.stop()
  }

  const playScene = (scene: Scene): void => {
    const exists = (id: string): boolean => songs.some((s) => s.videoId === id)
    const first = scene.songs.findIndex(exists)
    if (first < 0) return
    setScenesOpen(false)
    setAdding(false)
    setAutoPlay(false)
    setActiveScene({ id: scene.id, index: first })
    setActiveId(scene.songs[first])
    padForSong(scene.songs[first])
  }

  // próxima/anterior música da cena em andamento (ignora as que saíram da biblioteca)
  const stepScene = useCallback(
    (delta: -1 | 1, auto = false): boolean => {
      const scene = scenes.find((s) => s.id === activeScene?.id)
      if (!scene || !activeScene) return false
      const next = stepSong(scene, activeScene.index, delta, (id) => songs.some((s) => s.videoId === id))
      if (next === null) return false
      setAutoPlay(auto)
      setActiveScene({ id: scene.id, index: next })
      setActiveId(scene.songs[next])
      if (!auto) padForSong(scene.songs[next]) // avanço automático não tem pausa para o pad
      return true
    },
    [scenes, activeScene, songs]
  )
  const stepSceneRef = useRef(stepScene)
  stepSceneRef.current = stepScene

  // pula para qualquer música do setlist em andamento (gaveta do player)
  const jumpScene = useCallback(
    (index: number): void => {
      const scene = scenes.find((sc) => sc.id === activeScene?.id)
      const id = scene?.songs[index]
      if (!scene || !activeScene || !id || !songs.some((s) => s.videoId === id)) return
      setAutoPlay(false)
      setActiveScene({ id: scene.id, index })
      setActiveId(id)
      padForSong(id)
    },
    [scenes, activeScene, songs]
  )
  // o handler é registrado uma vez: lê sempre a versão atual de songs/scenes/playScene
  const openRef = useRef({ songs, scenes, playScene })
  openRef.current = { songs, scenes, playScene }
  useEffect(
    () =>
      registerCommandHandler((c) => {
        if (c.type === 'outputSplit') {
          const current = settingsRef.current
          if (!current) return false
          void window.stemkit.setSettings({ outputSplit: !current.outputSplit })
          return true
        }
        // O metrônomo avulso é independente do click sincronizado da música.
        if (c.type === 'metronomeToggle') {
          metronome.toggle()
          return true
        }
        if (c.type === 'metronomeBpm') {
          metronome.setBpm(c.value, true)
          return true
        }
        if (c.type === 'metronomeTap') {
          metronome.tap()
          return true
        }
        if (c.type === 'metronomePan') {
          metronome.setPan(c.value)
          return true
        }
        if (c.type === 'nextSong') return stepSceneRef.current(1)
        if (c.type === 'prevSong') return stepSceneRef.current(-1)
        const { songs: list, scenes: allScenes, playScene: play } = openRef.current
        if (c.type === 'openSong') {
          // só abre o que está na biblioteca (o id vem da rede)
          if (!list.some((s) => s.videoId === c.id)) return false
          setAdding(false)
          setScenesOpen(false)
          setActiveScene(null)
          setAutoPlay(false)
          setActiveId(c.id)
          return true
        }
        if (c.type === 'openScene') {
          const scene = allScenes.find((sc) => sc.id === c.id)
          if (!scene) return false
          play(scene)
          return true
        }
        return false
      }),
    []
  )

  // celular: comandos entram por startRemote; pad, metrônomo e cena saem daqui
  useEffect(() => remote.startRemote(), [])
  useEffect(() => {
    const publishPad = (): void => {
      const { playing, key, volume, pan } = pad.getState()
      remote.setApp({ pad: { playing, key, volume, pan } })
    }
    publishPad()
    return pad.subscribe(publishPad)
  }, [])
  useEffect(() => {
    const publishMetronome = (): void => remote.setApp({ metronome: metronome.getState() })
    publishMetronome()
    return metronome.subscribe(publishMetronome)
  }, [])
  const remoteScene = useMemo(() => {
    const scene = scenes.find((sc) => sc.id === activeScene?.id)
    if (!scene || !activeScene || scene.songs[activeScene.index] !== activeId) return null
    const exists = (id: string): boolean => songs.some((s) => s.videoId === id)
    return {
      id: scene.id,
      name: scene.name,
      index: activeScene.index,
      total: scene.songs.length,
      hasPrev: stepSong(scene, activeScene.index, -1, exists) !== null,
      hasNext: stepSong(scene, activeScene.index, 1, exists) !== null
    }
  }, [scenes, activeScene, activeId, songs])
  useEffect(() => remote.setApp({ scene: remoteScene }), [remoteScene])

  const activeSong = useMemo(
    () => songs.find((s) => s.videoId === activeId) ?? null,
    [songs, activeId]
  )

  const selectedJob = useMemo(
    () => (activeId ? jobs[activeId] ?? null : null),
    [jobs, activeId]
  )
  const selectedError = useMemo(
    () => (activeId ? errors[activeId] ?? null : null),
    [errors, activeId]
  )

  const pendingMap = useMemo(() => {
    const map: Record<string, { label: string; error?: boolean }> = {}
    for (const j of Object.values(jobs)) {
      map[j.videoId] = { label: stageLabel(j.stage, j.pct) }
    }
    for (const [id, message] of Object.entries(errors)) {
      if (!map[id]) {
        map[id] = { label: /already being processed/.test(message) ? 'queued' : 'failed', error: true }
      }
    }
    return map
  }, [jobs, errors])

  const displaySongs = useMemo(() => {
    const known = new Set(songs.map((s) => s.videoId))
    const top: Song[] = []
    for (const j of Object.values(jobs)) {
      if (!known.has(j.videoId)) {
        top.push({
          videoId: j.videoId,
          title: j.title ?? '',
          duration: 0,
          addedAt: 0,
          model: j.model
        })
        known.add(j.videoId)
      }
    }
    for (const id of Object.keys(errors)) {
      if (!known.has(id)) {
        top.push({ videoId: id, title: '', duration: 0, addedAt: 0 })
        known.add(id)
      }
    }
    return [...top, ...songs]
  }, [songs, jobs, errors])

  if (!status) {
    return (
      <>
        <div className="h-full flex items-center justify-center">
          <LogoMark className="w-12 h-12 animate-pulse" />
        </div>
        {aboutOpen && <About version={appVersion} onClose={() => setAboutOpen(false)} />}
      </>
    )
  }

  if (!status.ready) {
    return (
      <>
        <Setup
          status={status}
          logs={envLogs}
          onInstall={() => {
            void window.stemkit.envBootstrap().then(() => window.stemkit.envStatus().then(setStatus))
          }}
        />
        {aboutOpen && <About version={appVersion} onClose={() => setAboutOpen(false)} />}
      </>
    )
  }

  const selectedIsBusy = !!(selectedJob || selectedError)

  const openSettings = (): void => {
    void window.stemkit.envStatus().then(setStatus)
    setSettingsOpen(true)
  }
  // telas secundárias (progresso, adicionar) ganham uma barra com seta de voltar
  const withBack = (content: React.ReactElement, onBack: () => void): React.ReactElement => (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      <div className="h-14 shrink-0 flex items-center px-5">
        <button onClick={onBack} title="Voltar para a biblioteca" className="no-drag text-white/80 hover:text-white">
          <BackIcon />
        </button>
      </div>
      <div className="flex-1 min-h-0">{content}</div>
    </div>
  )

  const currentScene = scenes.find((sc) => sc.id === activeScene?.id)
  const sceneInfo =
    currentScene && activeScene && currentScene.songs[activeScene.index] === activeId
      ? {
          name: currentScene.name,
          index: activeScene.index,
          total: currentScene.songs.length,
          songs: currentScene.songs.map((id): SceneSong => {
            const song = songs.find((s) => s.videoId === id)
            return song
              ? { id, title: song.title || id, key: meta[id]?.keyShift ?? null, bpm: meta[id]?.bpm ?? null, duration: song.duration }
              : { id, title: '', key: null, bpm: null, duration: 0, missing: true }
          }),
          onPrev: stepSong(currentScene, activeScene.index, -1, (id) => songs.some((s) => s.videoId === id)) !== null ? () => stepScene(-1) : undefined,
          onNext: stepSong(currentScene, activeScene.index, 1, (id) => songs.some((s) => s.videoId === id)) !== null ? () => stepScene(1) : undefined,
          onJump: jumpScene
        }
      : undefined

  let main: React.ReactElement
  if (selectedIsBusy) {
    main = withBack(
      <Processing
        job={selectedJob}
        error={selectedError}
        isLocal={activeId ? isLocalId(activeId) : false}
        botSuspected={
          !!selectedError && /sign in|bot|confirm|unavailable|private/i.test(selectedError)
        }
        onCancel={() => activeId && cancelSelectedJob(activeId)}
        onRetry={retryJob}
        onUpdateYtDlp={() => void updateYtDlp()}
      />,
      () => setActiveId(null)
    )
  } else if (activeSong) {
    // a key muda quando os stems mudam (adicionar stem): o player recarrega o áudio
    main = (
      <Player
        key={`${activeSong.videoId}|${activeSong.model}|${(activeSong.stems ?? []).join(',')}`}
        song={activeSong}
        settings={settings ?? undefined}
        onBack={() => {
          setActiveId(null)
          setActiveScene(null)
          setAutoPlay(false)
          padGen.current++
          padFromScene.current = false
        }}
        scene={sceneInfo}
        onEnded={settings?.sceneAutoAdvance ? () => stepScene(1, true) : undefined}
        autoPlay={autoPlay}
        onPlayStart={onSongPlayStart}
      />
    )
  } else if (adding) {
    main = withBack(
      <Home
        hasSongs={displaySongs.length > 0}
        songs={displaySongs}
        pending={pendingMap}
        settings={settings ?? undefined}
        onStart={(u, m, s) => void startUrl(u, m, s)}
        onStartLocal={(path, m, s) => void startLocal(path, m, s)}
        onSelect={(id) => {
          setAdding(false)
          setActiveId(id)
        }}
        onOpenSettings={openSettings}
      />,
      () => setAdding(false)
    )
  } else {
    main = (
      <Library
        songs={displaySongs}
        pending={pendingMap}
        appVersion={appVersion}
        onSelect={(id) => {
          setActiveScene(null)
          setAutoPlay(false)
          setActiveId(id)
        }}
        onDelete={(id) => void deleteSong(id)}
        onAdd={() => setAdding(true)}
        onOpenScenes={() => setScenesOpen(true)}
        onOpenMidi={() => setMidiOpen(true)}
        onOpenRemote={() => setRemoteOpen(true)}
        onOpenSettings={openSettings}
        outputSplit={!!settings?.outputSplit}
        onToggleOutputSplit={() => {
          if (settings) void window.stemkit.setSettings({ outputSplit: !settings.outputSplit })
        }}
      />
    )
  }

  return (
    <div className="h-full flex">
      <main className="flex-1 min-w-0">{main}</main>
      {settings && settingsOpen && (
        <Settings
          settings={settings}
          gpu={status.gpu}
          gpuVendor={status.gpuVendor}
          onChange={(patch) => void window.stemkit.setSettings(patch)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {scenesOpen && (
        <ScenesPanel
          songs={songs}
          scenes={scenes}
          meta={meta}
          autoAdvance={!!settings?.sceneAutoAdvance}
          padBetween={!!settings?.padBetween}
          onPadBetween={(on) => void window.stemkit.setSettings({ padBetween: on })}
          onSave={saveScenes}
          onAutoAdvance={(on) => void window.stemkit.setSettings({ sceneAutoAdvance: on })}
          onPlay={playScene}
          onClose={() => setScenesOpen(false)}
        />
      )}
      {midiOpen && <MidiPanel onClose={() => setMidiOpen(false)} />}
      {remoteOpen && <RemotePanel onClose={() => setRemoteOpen(false)} />}
      {aboutOpen && <About version={appVersion} onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
