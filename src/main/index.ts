import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  Menu,
  type MenuItemConstructorOptions
} from 'electron'
import { join, normalize, extname } from 'path'
import { existsSync, copyFileSync, mkdirSync, createReadStream, statSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import type { AppSettings, BeatGrid, ChordMap, MixState, SectionMap } from '../shared/types'
import {
  detectTools,
  bootstrap,
  updateYtDlp,
  refreshReady,
  ensureVocalsEngine,
  ensureFtWeights,
  ensureGpuEngine,
  detectGpuVendor,
  gpuVendorInfo,
  applyGpuOverride,
  hasGpuAcceleration,
  gpuAccelerationInfo,
  engineStatus,
  getStatus
} from './env'
import { loadSettings, saveSettings } from './settings'
import { loadSongs, removeSong, stemBuffers, stemsDir, stemsFor, mixWavPath, AUDIO_EXTENSIONS, loadBeats, saveBeats, loadSections, saveSections, loadChords, saveChords, loadMix, saveMix } from './library'
import { startJob, startLocalJob, cancelJob, searchYouTube, analyzeBeats, addStems, analyzeSections, analyzeChords } from './pipeline'
import { initUpdater } from './updater'
import { guideClips } from './voice'
import { loadScenes, saveScenes } from './scenes'
import { listPads, importPad, updatePad, removePad, readPad } from './pads'
import { detectKey, keyName } from '../shared/key'
import { runSmoke } from './smoke'
import { getThumb, clearThumbMemo } from './thumbs'

let mainWindow: BrowserWindow | null = null
let staticServer: Server | null = null

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

function startRendererServer(): Promise<string> {
  const root = normalize(join(__dirname, '../renderer'))
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
        let filePath = normalize(join(root, urlPath === '/' ? 'index.html' : urlPath))
        if (!filePath.startsWith(root)) {
          res.statusCode = 403
          res.end()
          return
        }
        if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
          filePath = join(root, 'index.html')
        }
        res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream')
        createReadStream(filePath).pipe(res)
      } catch {
        res.statusCode = 404
        res.end()
      }
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      staticServer = server
      resolve(`http://localhost:${(server.address() as AddressInfo).port}`)
    })
  })
}

function sanitizeName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return clean.length > 0 ? clean.slice(0, 120) : 'stems'
}

function showAboutWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('app:show-about')
}

function installApplicationMenu(): void {
  const aboutItem: MenuItemConstructorOptions = {
    label: 'About Stem-Machine',
    click: showAboutWindow
  }
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              aboutItem,
              { type: 'separator' },
              { role: 'services', submenu: [] },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          },
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' }
            ]
          },
          { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] }
        ]
      : [
          { label: 'File', submenu: [{ role: 'quit' }] },
          { label: 'Help', submenu: [aboutItem] }
        ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function requireExportFfmpeg(): string {
  const ffmpeg = getStatus().ffmpeg.path
  if (!ffmpeg) {
    throw new Error('Something went wrong with the built-in audio tools. Try reinstalling Stem-Machine.')
  }
  return ffmpeg
}

// the bundled ffmpeg is a minimal static build without libmp3lame, so mp3
// isn't an option — aac is a native encoder, no extra library needed
function transcodeToAac(ffmpeg: string, input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-y', '-i', input, '-c:a', 'aac', '-b:a', '256k', output])
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
  })
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0b10',
    // hiddenInset traffic lights are macOS-only; default frame elsewhere
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 20 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // STEM_MACHINE_HIDDEN=1: teste por CDP sem atrapalhar o desktop — a janela abre fora
  // da tela, sem foco e fora da barra de tarefas (oculta de vez ela para de pintar)
  mainWindow.on('ready-to-show', () => {
    if (!process.env.STEM_MACHINE_HIDDEN) return mainWindow?.show()
    mainWindow?.setSkipTaskbar(true)
    mainWindow?.setPosition(-5000, -5000)
    mainWindow?.showInactive()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    const url = await startRendererServer()
    mainWindow.loadURL(url + '/index.html')
  }
}

app.whenReady().then(async () => {
  // self-test mode for the windows-smoke CI job: bootstrap, separate a
  // generated tone through both engines, exercise the GPU plumbing
  // (cuda fail-fast paths + CUDA engine install), exit 0/1 without a window
  if (process.env.STEMKIT_SMOKE === '1') {
    const ok = await runSmoke()
    app.exit(ok ? 0 : 1)
    return
  }

  installApplicationMenu()

  // existing install (e.g. right after an update): pre-fetch the engine
  // checkpoints the user opted into, in the background, so the first split
  // doesn't stall on a download. Nothing is fetched while both toggles are
  // off (the defaults)
  if (await refreshReady()) {
    const settings = loadSettings()
    if (settings.roformerVocals) void ensureVocalsEngine()
    if (settings.htdemucsFt) void ensureFtWeights()
    if (settings.gpuSplit) void detectGpuVendor().then((vendor) => ensureGpuEngine(undefined, vendor))
    // warm the informational GPU probe so Settings can show it right away
    void hasGpuAcceleration()
  }

  ipcMain.handle('env:status', async () => {
  // restore the AMD ROCm override saved by a previous session's preflight
  // before any python (venv probes, separation runs) can spawn
  applyGpuOverride()
  await detectTools()
    void detectGpuVendor()
    const status = {
      ...getStatus(),
      gpu: gpuAccelerationInfo(),
      gpuVendor: gpuVendorInfo()
    }
    // the probe results land on a later status call; never blocks ready
    if (status.ready) void hasGpuAcceleration()
    return status
  })

  ipcMain.handle('env:bootstrap', async () => {
    const ok = await bootstrap()
    return ok
  })

  ipcMain.handle('env:update-ytdlp', async () => updateYtDlp())

  ipcMain.handle('library:list', () => loadSongs())
  // dados extras da tabela da biblioteca: BPM (metrônomo) e tom (dos acordes)
  ipcMain.handle('library:meta', () =>
    Object.fromEntries(
      loadSongs().map((s) => {
        const chords = loadChords(s.videoId)
        const key = chords ? detectKey(chords.chords) : null
        return [s.videoId, { bpm: loadBeats(s.videoId)?.bpm ?? null, key: key ? keyName(key) : null }]
      })
    )
  )
  ipcMain.handle('library:delete', (_e, videoId: string) => removeSong(videoId))
  ipcMain.handle('song:buffers', (_e, videoId: string) => {
    const song = loadSongs().find((s) => s.videoId === videoId)
    return stemBuffers(videoId, song?.stems)
  })

  // só músicas da biblioteca: o id vira caminho de pasta
  const inLibrary = (videoId: string): boolean => loadSongs().some((s) => s.videoId === videoId)
  ipcMain.handle('song:beats', (_e, videoId: string) => (inLibrary(videoId) ? loadBeats(videoId) : null))
  // click e guia são gerados no player; viram stems/<nome>.wav na hora de exportar
  ipcMain.handle('generated:save', (_e, videoId: string, stem: string, wav: Uint8Array) => {
    if (!inLibrary(videoId) || !['click', 'guide'].includes(stem)) throw new Error('Invalid stem')
    writeFileSync(join(stemsDir(videoId), `${stem}.wav`), Buffer.from(wav))
  })
  ipcMain.handle('voice:clips', () => guideClips())
  ipcMain.handle('scenes:list', () => loadScenes())
  ipcMain.handle('scenes:save', (_e, scenes: unknown) => saveScenes(scenes))
  ipcMain.handle('song:mix', (_e, videoId: string) => (inLibrary(videoId) ? loadMix(videoId) : null))
  ipcMain.handle('mix:save', (_e, videoId: string, mix: MixState | null) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    saveMix(videoId, mix)
  })
  ipcMain.handle('pads:list', () => listPads())
  ipcMain.handle('pads:import', () => importPad())
  ipcMain.handle('pads:update', (_e, id: string, patch: { key?: number }) => updatePad(id, patch))
  ipcMain.handle('pads:remove', (_e, id: string) => removePad(id))
  ipcMain.handle('pads:read', (_e, id: string) => readPad(id))
  ipcMain.handle('stems:add', (_e, videoId: string, stems: string[]) => {
    void addStems(videoId, stems)
  })
  ipcMain.handle('song:sections', (_e, videoId: string) => (inLibrary(videoId) ? loadSections(videoId) : null))
  ipcMain.handle('song:chords', (_e, videoId: string) => (inLibrary(videoId) ? loadChords(videoId) : null))
  ipcMain.handle('chords:analyze', async (_e, videoId: string) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    return analyzeChords(videoId)
  })
  ipcMain.handle('chords:save', (_e, videoId: string, map: ChordMap) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    saveChords(videoId, map)
  })
  ipcMain.handle('sections:analyze', async (_e, videoId: string) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    return analyzeSections(videoId)
  })
  ipcMain.handle('sections:save', (_e, videoId: string, map: SectionMap) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    saveSections(videoId, map)
  })
  ipcMain.handle('beats:save', (_e, videoId: string, grid: BeatGrid) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    saveBeats(videoId, grid)
  })
  ipcMain.handle('beats:analyze', async (_e, videoId: string) => {
    if (!inLibrary(videoId)) throw new Error('Song not found')
    return analyzeBeats(videoId)
  })

  ipcMain.handle('jobs:start', async (_e, url: string, model?: string, stems?: string[]) => {
    void startJob(url, model, stems)
    return { started: true }
  })
  ipcMain.handle('jobs:start-local', async (_e, filePath: string, model?: string, stems?: string[]) => {
    void startLocalJob(filePath, model, stems)
    return { started: true }
  })
  ipcMain.handle('files:pick-audio', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose an audio file to split',
      buttonLabel: 'Split',
      properties: ['openFile'],
      filters: [{ name: 'Audio files', extensions: AUDIO_EXTENSIONS }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })
  ipcMain.handle('jobs:cancel', (_e, videoId?: string) => cancelJob(videoId))

  ipcMain.handle('stem:export', async (_e, videoId: string, stem: string) => {
    const song = loadSongs().find((s) => s.videoId === videoId)
    const file = join(stemsDir(videoId), `${stem}.wav`)
    if (!existsSync(file)) throw new Error(`Missing stem ${stem}`)
    const format = loadSettings().exportFormat
    const ext = format === 'aac' ? 'm4a' : 'wav'
    const result = await dialog.showSaveDialog({
      title: `Export ${stem}`,
      defaultPath: join(
        app.getPath('downloads'),
        `${sanitizeName(song?.title ?? videoId)} - ${stem}.${ext}`
      ),
      filters: [{ name: format === 'aac' ? 'AAC audio' : 'WAV audio', extensions: [ext] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    if (format === 'aac') {
      await transcodeToAac(requireExportFfmpeg(), file, result.filePath)
    } else {
      copyFileSync(file, result.filePath)
    }
    return { saved: true, path: result.filePath }
  })

  ipcMain.handle('stems:export-all', async (_e, videoId: string) => {
    const song = loadSongs().find((s) => s.videoId === videoId)
    const dir = stemsDir(videoId)
    const generated = ['click', 'guide'].filter((name) => existsSync(join(dir, `${name}.wav`)))
    const list = [...stemsFor(song), ...generated]
    for (const name of list) {
      if (!existsSync(join(dir, `${name}.wav`))) throw new Error(`Missing stem ${name}`)
    }
    const result = await dialog.showOpenDialog({
      title: 'Choose export folder',
      buttonLabel: 'Export Here',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return { saved: false }
    const target = join(result.filePaths[0], sanitizeName(song?.title ?? videoId))
    mkdirSync(target, { recursive: true })
    const format = loadSettings().exportFormat
    const ext = format === 'aac' ? 'm4a' : 'wav'
    const ffmpeg = format === 'aac' ? requireExportFfmpeg() : null
    for (const name of list) {
      const src = join(dir, `${name}.wav`)
      const dest = join(target, `${name}.${ext}`)
      if (ffmpeg) await transcodeToAac(ffmpeg, src, dest)
      else copyFileSync(src, dest)
    }
    let count = list.length
    const mix = mixWavPath(videoId)
    if (existsSync(mix)) {
      const mixDest = join(target, `${sanitizeName(song?.title ?? 'full track')}.${ext}`)
      if (ffmpeg) await transcodeToAac(ffmpeg, mix, mixDest)
      else copyFileSync(mix, mixDest)
      count += 1
    }
    return { saved: true, path: target, count }
  })

  ipcMain.handle('search:youtube', (_e, query: string) => searchYouTube(query))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
    const next = saveSettings(patch)
    // hideVideo flips the thumbnail source, so cached lookups must retry
    clearThumbMemo()
    return next
  })
  ipcMain.handle('thumb:get', (_e, videoId: string) => getThumb(videoId))
  // the renderer confirms optional-engine downloads explicitly; nothing
  // starts as a side effect of flipping a toggle
  ipcMain.handle('engines:status', () => {
    // warm the cuda probe so gpuReady flips without waiting for a split
    if (getStatus().ready) void hasGpuAcceleration()
    return engineStatus()
  })
  ipcMain.handle('engines:fetch', (_e, which: 'vocals' | 'ft' | 'gpu') => {
    if (which === 'vocals') void ensureVocalsEngine()
    else if (which === 'ft') void ensureFtWeights()
    else void ensureGpuEngine()
  })
  initUpdater()
  ipcMain.handle('open-external', (_e, value: string) => {
    try {
      const url = new URL(value)
      const youtube = ['youtube.com', 'www.youtube.com', 'youtu.be'].includes(url.hostname)
      const projectGithub =
        url.hostname === 'github.com' && /^\/Jcamihao\/Stem-Machine(?:\/|$)/.test(url.pathname)
      if (url.protocol === 'https:' && (youtube || projectGithub)) {
        shell.openExternal(url.toString())
      }
    } catch {
      // Ignore malformed or unsupported external URLs.
    }
  })

  await detectTools()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  cancelJob()
  staticServer?.close()
  app.quit()
})
