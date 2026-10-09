import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, EnvStatus, JobProgress, JobStage, Song } from '../../shared/types'
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

  useEffect(() => {
    void window.stemkit.envStatus().then(setStatus)
    void window.stemkit.listSongs().then(setSongs)
    void window.stemkit.getSettings().then(setSettings)
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
        onBack={() => setActiveId(null)}
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
        onSelect={(id) => setActiveId(id)}
        onDelete={(id) => void deleteSong(id)}
        onAdd={() => setAdding(true)}
        onOpenSettings={openSettings}
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
      {aboutOpen && <About version={appVersion} onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
