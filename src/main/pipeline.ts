import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { existsSync, readdirSync, mkdirSync, rmSync, statSync, renameSync } from 'fs'
import { basename, extname, join } from 'path'
import { BrowserWindow } from 'electron'
import {
  venvPython,
  venvYtDlp,
  separateScript,
  roformerScript,
  modelsDir,
  ensureEngineDeps,
  ensureVocalsEngine,
  ensureFtWeights,
  ensureGpuEngine,
  detectGpuVendor,
  getStatus,
  ytDlpRuntimeArgs,
  beatsScript,
  beatModelPath,
  ensureBeatEngine,
  sectionsScript,
  sectionsLibDir,
  sectionsModelsDir,
  ensureSectionsEngine
} from './env'
import { loadSettings } from './settings'
import {
  songDir,
  stemsDir,
  stemsPresent,
  stemsFor,
  mixWavPath,
  rawDownloadPath,
  upsertSong,
  loadSongs,
  AUDIO_EXTENSIONS,
  wavDuration,
  beatsPath,
  loadBeats,
  replaceSong,
  sectionsPath,
  loadSections
} from './library'
import type { BeatGrid, JobEvent, JobStage, SectionMap } from '../shared/types'
import { MODEL_DEFAULT, MODEL_EXTENDED } from '../shared/types'
import { parseVideoId } from '../shared/url'
import { localSongId } from '../shared/local'
import { cacheThumbnail } from './thumbs'

interface ActiveJob {
  videoId: string
  title?: string
  model: string
  cancelled: boolean
  proc?: ChildProcess
  // separando de novo uma música que já está na biblioteca (adicionar stem):
  // cancelar não pode apagar a pasta dela
  resplit?: boolean
}

const jobs = new Map<string, ActiveJob>()

const MAX_CONCURRENT_SEPARATIONS = 2
let activeSeparations = 0
const separationWaiters: Array<() => void> = []

function acquireSeparation(): Promise<() => void> {
  if (activeSeparations < MAX_CONCURRENT_SEPARATIONS) {
    activeSeparations++
    return Promise.resolve(releaseSeparation)
  }
  return new Promise((resolve) => {
    separationWaiters.push(() => {
      activeSeparations++
      resolve(releaseSeparation)
    })
  })
}

function releaseSeparation(): void {
  activeSeparations--
  separationWaiters.shift()?.()
}

function send(ev: JobEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('job:event', ev)
  }
}

function progress(
  job: ActiveJob,
  stage: JobStage,
  pct: number,
  message?: string
): void {
  if (!jobs.has(job.videoId) || job.cancelled) return
  send({
    kind: 'progress',
    data: {
      videoId: job.videoId,
      stage,
      pct,
      message,
      title: job.title,
      model: job.model,
      ...(job.resplit ? { resplit: true } : {})
    }
  })
}

export function extractVideoId(url: string): string | null {
  return parseVideoId(url)
}

// everything both entry points (YouTube url / local file) need to know about
// which engines will run, shared by startJob and startLocalJob
interface EnginePlan {
  engine: string
  modelTag: string
  settings: ReturnType<typeof loadSettings>
  useGpu: boolean
  wantsVocals: boolean
  deviceArg: () => string
}

function resolveEngine(requestedModel: string, stems?: string[]): EnginePlan {
  // engine resolution from settings: roformer vocals when opted in (runs on
  // CPU too — no GPU fallback by design), otherwise htdemucs / htdemucs_ft.
  // The stored model tag encodes the variant so the cache below re-splits
  // whenever the effective engine changes. Suffixes are appended only when
  // non-default, so tags written by older versions stay cache-compatible
  const settings = loadSettings()
  const wantsVocals = !stems?.length || stems.includes('vocals')
  let engine: string
  if (requestedModel === MODEL_EXTENDED) {
    engine = requestedModel
  } else if (requestedModel === MODEL_DEFAULT && settings.roformerVocals && wantsVocals) {
    engine = MODEL_DEFAULT
  } else {
    engine = settings.htdemucsFt ? 'htdemucs_ft' : 'htdemucs'
  }
  const modelTag =
    engine +
    (settings.htdemucsFt && engine !== MODEL_EXTENDED ? '-ft' : '') +
    (settings.shifts === 2 ? '@s2' : '')

  // windows/linux honor the GPU toggle: 'cpu' is passed explicitly because
  // roformer.py's 'auto' prefers CUDA whenever the venv's torch supports it
  // (and the default linux wheel is CUDA-capable, so toggle-off must still
  // force CPU). macOS keeps 'auto' (MPS when available)
  const useGpu = settings.gpuSplit && process.platform !== 'darwin'
  const deviceArg = (): string => {
    if (process.platform === 'darwin') return 'auto'
    return useGpu ? 'cuda' : 'cpu'
  }

  return { engine, modelTag, settings, useGpu, wantsVocals, deviceArg }
}

// library cache check + song dir prep, shared by both entry points. Sends
// 'done' itself when the existing split already covers the request
function reuseOrPrepare(
  videoId: string,
  modelTag: string,
  stems?: string[]
): { covered: boolean; addedAt: number } {
  const existing = loadSongs().find((s) => s.videoId === videoId)
  const covered =
    existing &&
    existing.model === modelTag &&
    !!existing.stems?.length &&
    (stems?.length ? stems.every((s) => existing.stems!.includes(s)) : true)
  if (covered && stemsPresent(videoId, stemsFor(existing))) {
    send({ kind: 'done', data: { videoId, song: existing } })
    return { covered: true, addedAt: existing!.addedAt }
  }
  if (existing && (existing.model !== modelTag || !stemsPresent(videoId, stemsFor(existing)))) {
    rmSync(songDir(videoId), { recursive: true, force: true })
  }

  mkdirSync(songDir(videoId), { recursive: true })
  return { covered: false, addedAt: existing?.addedAt ?? Date.now() }
}

async function convertToWav(job: ActiveJob, inputPath: string): Promise<void> {
  const videoId = job.videoId
  progress(job, 'convert', 0, 'Converting to WAV')
  const ffmpeg = getStatus().ffmpeg.path
  if (!ffmpeg) {
    throw Object.assign(
      new Error('Something went wrong with the built-in audio tools. Try reinstalling Stem-Machine.'),
      { videoId }
    )
  }
  await runProcess(job, ffmpeg as string, [
    '-y',
    '-i',
    inputPath,
    '-af',
    'aresample=44100:resampler=soxr',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    mixWavPath(videoId)
  ])
  if (job.cancelled || !jobs.has(videoId)) throw new Error('cancelled')
  progress(job, 'convert', 100)
}

function beatsArgs(videoId: string): string[] {
  return [
    beatsScript(),
    '--input',
    mixWavPath(videoId),
    '--out',
    beatsPath(videoId),
    '--checkpoint',
    beatModelPath()
  ]
}

/* click inteligente: detecta as batidas logo depois da separação (~10s, CPU).
   Não é fatal: se falhar, a música entra na biblioteca sem click e o player
   oferece "analisar batidas" depois */
async function detectBeats(job: ActiveJob): Promise<void> {
  if (!(await ensureBeatEngine())) return
  if (job.cancelled || !jobs.has(job.videoId)) throw new Error('cancelled')
  progress(job, 'finalize', 0, 'Detecting beats')
  try {
    await runProcess(job, venvPython(), beatsArgs(job.videoId))
  } catch (err) {
    if (err instanceof Error && err.message === 'cancelled') throw err
  }
}

function sectionsArgs(videoId: string): string[] {
  return [
    sectionsScript(),
    '--stems-dir',
    stemsDir(videoId),
    '--out',
    sectionsPath(videoId),
    '--lib',
    sectionsLibDir(),
    '--models',
    sectionsModelsDir()
  ]
}

/* seções automáticas logo depois das batidas. Não é fatal: sem elas a música
   entra na biblioteca e o player oferece "detectar seções" depois */
async function detectSections(job: ActiveJob): Promise<void> {
  if (!(await ensureSectionsEngine())) return
  if (job.cancelled || !jobs.has(job.videoId)) throw new Error('cancelled')
  progress(job, 'finalize', 0, 'Detecting sections')
  try {
    await runProcess(job, venvPython(), sectionsArgs(job.videoId))
  } catch (err) {
    if (err instanceof Error && err.message === 'cancelled') throw err
  }
}

// roda um script python fora de um job; a mensagem de erro vem do evento JSON dele
function runScript(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(venvPython(), args, { env: { ...process.env } })
    let scriptError = ''
    if (child.stdout) {
      createInterface({ input: child.stdout }).on('line', (line) => {
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'error') scriptError = String(ev.message)
        } catch {}
      })
    }
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(scriptError || `script exited with code ${code}`))
    )
  })
}

// uma análise por música por vez (o botão pode ser clicado de novo enquanto roda)
const analyses = new Map<string, Promise<unknown>>()

function once<T>(key: string, work: () => Promise<T>): Promise<T> {
  let pending = analyses.get(key) as Promise<T> | undefined
  if (!pending) {
    pending = work().finally(() => analyses.delete(key))
    analyses.set(key, pending)
  }
  return pending
}

// músicas separadas antes do click (ou cuja detecção falhou): roda só a detecção
export function analyzeBeats(videoId: string): Promise<BeatGrid> {
  return once(`beats:${videoId}`, async () => {
    if (!existsSync(mixWavPath(videoId))) throw new Error('Original audio not found for this song')
    if (!(await ensureBeatEngine())) throw new Error('Beat engine unavailable')
    await runScript(beatsArgs(videoId))
    const grid = loadBeats(videoId)
    if (!grid) throw new Error('Beat detection produced no result')
    return grid
  })
}

export function analyzeSections(videoId: string): Promise<SectionMap> {
  return once(`sections:${videoId}`, async () => {
    if (!(await ensureSectionsEngine())) throw new Error('Sections engine unavailable')
    await runScript(sectionsArgs(videoId))
    const map = loadSections(videoId)
    if (!map) throw new Error('Section detection produced no result')
    return map
  })
}

const SEPARABLE_STEMS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']

/* adicionar stem a uma música da biblioteca, sem reenviar a música:
   - se o stem já está no disco (o separate.py grava os não escolhidos) e o motor
     é o mesmo, só passa a mostrá-lo
   - senão separa de novo a partir do mix.wav guardado. Os stems atuais vão para
     um backup e voltam se der erro ou se cancelar */
export async function addStems(videoId: string, extra: string[]): Promise<void> {
  const fail = (message: string): void =>
    send({ kind: 'failed', data: { videoId, message, resplit: true } })
  const song = loadSongs().find((s) => s.videoId === videoId)
  if (!song) return fail('Song not found')
  if (jobs.has(videoId)) return fail('This song is already being processed')
  const current = stemsFor(song)
  const wanted = SEPARABLE_STEMS.filter((s) => current.includes(s) || extra.includes(s))
  const needsSix = wanted.includes('guitar') || wanted.includes('piano')
  const plan = resolveEngine(needsSix ? MODEL_EXTENDED : MODEL_DEFAULT, wanted)

  if (song.model === plan.modelTag && stemsPresent(videoId, wanted)) {
    const updated = { ...song, stems: wanted }
    replaceSong(updated)
    send({ kind: 'done', data: { videoId, song: updated } })
    return
  }
  if (!existsSync(mixWavPath(videoId))) {
    return fail('The original audio for this song is missing — import it again')
  }

  const job: ActiveJob = { videoId, title: song.title, model: plan.modelTag, cancelled: false, resplit: true }
  jobs.set(videoId, job)
  const dir = stemsDir(videoId)
  const backup = `${dir}.bak`
  const startedAt = Date.now()
  rmSync(backup, { recursive: true, force: true })
  if (existsSync(dir)) renameSync(dir, backup)
  mkdirSync(dir, { recursive: true })
  try {
    const produced = await runSeparation(job, plan, wanted)
    if (job.cancelled || !jobs.has(videoId)) throw new Error('cancelled')
    if (!loadBeats(videoId)) await detectBeats(job)
    if (!loadSections(videoId)) await detectSections(job)
    rmSync(backup, { recursive: true, force: true })
    const updated = {
      ...song,
      model: plan.modelTag,
      stems: produced,
      took: Math.round((Date.now() - startedAt) / 1000)
    }
    replaceSong(updated)
    send({ kind: 'done', data: { videoId, song: updated } })
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    if (existsSync(backup)) renameSync(backup, dir)
    const message = err instanceof Error ? err.message : String(err)
    if (message !== 'cancelled') fail(message)
  } finally {
    jobs.delete(videoId)
  }
}

function finalizeJob(
  job: ActiveJob,
  info: { title: string; duration: number; addedAt: number; startedAt: number; source?: 'local' },
  producedStems: string[]
): void {
  progress(job, 'finalize', 100, 'Adding to library')
  const took = Math.round((Date.now() - info.startedAt) / 1000)
  const songs = upsertSong({
    videoId: job.videoId,
    title: info.title,
    duration: info.duration,
    addedAt: info.addedAt,
    model: job.model,
    stems: producedStems,
    took,
    source: info.source
  })
  send({ kind: 'done', data: { videoId: job.videoId, song: songs[0] } })
}

export async function startJob(
  rawUrl: string,
  requestedModel = MODEL_DEFAULT,
  stems?: string[]
): Promise<void> {
  const url = rawUrl.trim()
  const videoId = parseVideoId(url)
  if (!videoId) {
    send({ kind: 'failed', data: { videoId: '', message: 'Could not parse a YouTube URL or video id out of that' } })
    return
  }
  if (jobs.has(videoId)) {
    send({ kind: 'failed', data: { videoId, message: 'This song is already being processed' } })
    return
  }

  const plan = resolveEngine(requestedModel, stems)
  const job: ActiveJob = { videoId, model: plan.modelTag, cancelled: false }
  jobs.set(videoId, job)
  const startedAt = Date.now()

  const bail = (message: string): never => {
    throw Object.assign(new Error(message), { videoId })
  }

  try {
    const { covered, addedAt } = reuseOrPrepare(videoId, plan.modelTag, stems)
    if (covered) return

    progress(job, 'metadata', 0, 'Reading video info')

    let raw = ''
    await runProcess(job, venvYtDlp(), [...ytDlpRuntimeArgs(), '-J', '--no-playlist', '--skip-download', url], {
      onStdout: (chunk) => {
        raw += chunk
      }
    })
    let meta: { title: string; duration: number }
    try {
      const parsed = JSON.parse(raw)
      meta = {
        title: typeof parsed.title === 'string' ? parsed.title : 'Unknown title',
        duration: typeof parsed.duration === 'number' ? Math.round(parsed.duration) : 0
      }
      // warm the thumbnail cache for offline library browsing
      void cacheThumbnail(videoId, typeof parsed.thumbnail === 'string' ? parsed.thumbnail : undefined)
    } catch {
      bail('Could not read video metadata')
    }
    if (job.cancelled || !jobs.has(videoId)) return
    job.title = meta!.title
    progress(job, 'metadata', 100, meta!.title)

    progress(job, 'download', 0, 'Downloading audio from YouTube')
    let maxPct = 0
    await runProcess(
      job,
      venvYtDlp(),
      [
        ...ytDlpRuntimeArgs(),
        '-f',
        'bestaudio/best',
        '--no-playlist',
        '-o',
        rawDownloadPath(videoId),
        url
      ],
      {
        onStdout: (chunk) => {
          for (const piece of chunk.split(/[\r\n]/)) {
            const m = piece.match(/(\d+(?:\.\d+)?)%/)
            if (m) {
              const pct = parseFloat(m[1])
              if (pct > maxPct && pct <= 100) {
                maxPct = pct
                progress(job, 'download', pct)
              }
            }
          }
        }
      }
    )
    if (job.cancelled || !jobs.has(videoId)) return

    const dir = songDir(videoId)
    const rawFile = readdirSync(dir).find((f) => f.startsWith('raw.'))
    if (!rawFile) bail('Download produced no file')
    const rawPath = join(dir, rawFile as string)

    await convertToWav(job, rawPath)
    rmSync(rawPath, { force: true })

    const producedStems = await runSeparation(job, plan, stems)
    if (job.cancelled || !jobs.has(videoId)) return
    await detectBeats(job)
    await detectSections(job)
    finalizeJob(job, { title: meta!.title, duration: meta!.duration, addedAt, startedAt }, producedStems)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message !== 'cancelled') {
      send({ kind: 'failed', data: { videoId, message } })
    }
  } finally {
    jobs.delete(videoId)
  }
}

export async function startLocalJob(
  rawPath: string,
  requestedModel = MODEL_DEFAULT,
  stems?: string[]
): Promise<void> {
  const filePath = String(rawPath ?? '').trim()
  const ext = extname(filePath).slice(1).toLowerCase()
  if (!filePath || !AUDIO_EXTENSIONS.includes(ext)) {
    send({
      kind: 'failed',
      data: {
        videoId: '',
        message: filePath
          ? `“${ext || 'that file type'}” is not a supported audio format`
          : 'No file was selected'
      }
    })
    return
  }
  try {
    if (!statSync(filePath).isFile()) throw new Error('not a file')
  } catch {
    send({
      kind: 'failed',
      data: { videoId: '', message: 'That file could not be read — it may have been moved or deleted' }
    })
    return
  }

  const videoId = localSongId(filePath)
  if (jobs.has(videoId)) {
    send({ kind: 'failed', data: { videoId, message: 'This song is already being processed' } })
    return
  }

  const plan = resolveEngine(requestedModel, stems)
  const title = basename(filePath).replace(/\.[^./\\]+$/, '') || 'Local file'
  // title goes on the job up front so progress events name the file while
  // there is still no library entry to read from
  const job: ActiveJob = { videoId, title, model: plan.modelTag, cancelled: false }
  jobs.set(videoId, job)
  const startedAt = Date.now()

  try {
    const { covered, addedAt } = reuseOrPrepare(videoId, plan.modelTag, stems)
    if (covered) return

    // no metadata/download stages for local files: ffmpeg reads the source
    // directly and everything downstream keys off mix.wav as usual
    await convertToWav(job, filePath)
    const duration = wavDuration(mixWavPath(videoId))

    const producedStems = await runSeparation(job, plan, stems)
    if (job.cancelled || !jobs.has(videoId)) return
    await detectBeats(job)
    await detectSections(job)
    finalizeJob(job, { title, duration, addedAt, startedAt, source: 'local' }, producedStems)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message !== 'cancelled') {
      send({ kind: 'failed', data: { videoId, message } })
    }
  } finally {
    jobs.delete(videoId)
  }
}

async function runSeparation(
  job: ActiveJob,
  plan: EnginePlan,
  stems: string[] | undefined
): Promise<string[]> {
  const videoId = job.videoId
  const { engine, settings, useGpu, wantsVocals, deviceArg } = plan
  const bail = (message: string): never => {
    throw Object.assign(new Error(message), { videoId })
  }

  mkdirSync(stemsDir(videoId), { recursive: true })
  progress(job, 'separate', 0, 'Waiting for a free engine slot…')

  const release = await acquireSeparation()
  try {
    if (job.cancelled || !jobs.has(videoId)) throw new Error('cancelled')
    // self-heal the GPU engine: the toggle may be on before the GPU torch
    // download has run (fresh setting, or a failed earlier attempt)
    if (useGpu) {
      if (
        !(await ensureGpuEngine(
          (pct) => progress(job, 'separate', 0, `Downloading GPU engine: ${pct}%`),
          await detectGpuVendor()
        ))
      ) {
        bail('Could not prepare the GPU engine — switch back to CPU in Settings and try again')
      }
    }
    let scriptError: string | null = null
    const producedStems: string[] = []

    const lineParsers = (mapPct: (pct: number, msg?: string) => number) => {
      // the separate stage must never move backwards: scripts can emit
      // multiple internal sweeps, and message-only events (pct 0) update
      // the status text without touching the bar
      let lastPct = 0
      return {
        onLine: (line: string): void => {
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(line)
          } catch {
            return
          }
          if (parsed.type === 'progress') {
            const pct = Number(parsed.pct ?? 0)
            const message =
              typeof parsed.message === 'string' ? parsed.message : undefined
            if (message && pct === 0) {
              progress(job, 'separate', lastPct, message)
              return
            }
            const mapped = Math.max(lastPct, mapPct(pct, message))
            lastPct = mapped
            progress(job, 'separate', mapped, message)
          } else if (parsed.type === 'error') {
            scriptError = `Separation failed: ${String(parsed.message)}`
          } else if (parsed.type === 'done' && Array.isArray(parsed.stems)) {
            producedStems.push(...(parsed.stems as unknown[]).map(String))
          }
        }
      }
    }

    if (engine === MODEL_EXTENDED) {
      progress(job, 'separate', 0, 'Separating stems')
      await runProcess(
        job,
        venvPython(),
        [
          separateScript(),
          '--input',
          mixWavPath(videoId),
          '--out',
          stemsDir(videoId),
          '--model',
          MODEL_EXTENDED,
          '--device',
          deviceArg(),
          '--shifts',
          String(settings.shifts),
          ...(stems?.length ? ['--only', stems.join(',')] : [])
        ],
        lineParsers((pct) => pct)
      )
    } else if (engine === MODEL_DEFAULT) {
      const otherStems = (
        stems?.length ? stems : ['drums', 'bass', 'other', 'vocals']
      ).filter((s) => s !== 'vocals')
      // the demucs phase takes roughly twice as long as the vocals pass,
      // so the bar reflects that split
      const roformerSpan = otherStems.length > 0 ? 35 : 100
      // the first slice of the vocals phase is the engine download, when
      // one is needed; awaiting it here means roformer.py never races
      // the background fetch on the same checkpoint file
      const downloadSpan = Math.round(roformerSpan * 0.3)
      if (wantsVocals) {
        if (!(await ensureEngineDeps())) {
          bail('Could not prepare the engine components for vocal separation')
        }
        await ensureVocalsEngine((pct) =>
          progress(
            job,
            'separate',
            Math.round((pct / 100) * downloadSpan),
            `Downloading vocals engine (913MB): ${pct}%`
          )
        )
        const vocalsBase = downloadSpan
        progress(job, 'separate', vocalsBase, 'Separating vocals')
        await runProcess(
          job,
          venvPython(),
          [
            roformerScript(),
            '--input',
            mixWavPath(videoId),
            '--out',
            stemsDir(videoId),
            '--ckpt-dir',
            modelsDir(),
            '--device',
            deviceArg()
          ],
          lineParsers((pct) =>
            vocalsBase + Math.round((pct / 100) * (roformerSpan - vocalsBase))
          )
        )
      }
      if (otherStems.length > 0) {
        if (settings.htdemucsFt) {
          if (
            !(await ensureFtWeights((pct) =>
              progress(
                job,
                'separate',
                wantsVocals ? roformerSpan : 0,
                `Downloading fine-tuned engine (~320MB): ${pct}%`
              )
            ))
          ) {
            bail('Could not download the fine-tuned engine weights')
          }
        }
        progress(
          job,
          'separate',
          wantsVocals ? roformerSpan : 0,
          `Separating ${otherStems.join(', ')}`
        )
        await runProcess(
          job,
          venvPython(),
          [
            separateScript(),
            '--input',
            mixWavPath(videoId),
            '--out',
            stemsDir(videoId),
            '--model',
            settings.htdemucsFt ? 'htdemucs_ft' : 'htdemucs',
            '--device',
            deviceArg(),
            '--shifts',
            String(settings.shifts),
            '--only',
            otherStems.join(',')
          ],
          lineParsers((pct, msg) =>
            wantsVocals && !msg
              ? roformerSpan + Math.round((pct / 100) * (100 - roformerSpan))
              : pct
          )
        )
      }
    } else {
      progress(job, 'separate', 0, 'Separating stems')
      if (settings.htdemucsFt) {
        if (
          !(await ensureFtWeights((pct) =>
            progress(job, 'separate', 0, `Downloading fine-tuned engine (~320MB): ${pct}%`)
          ))
        ) {
          bail('Could not download the fine-tuned engine weights')
        }
      }
      await runProcess(
        job,
        venvPython(),
        [
          separateScript(),
          '--input',
          mixWavPath(videoId),
          '--out',
          stemsDir(videoId),
          '--model',
          engine,
          '--device',
          deviceArg(),
          '--shifts',
          String(settings.shifts),
          ...(stems?.length ? ['--only', stems.join(',')] : [])
        ],
        lineParsers((pct) => pct)
      )
    }

    if (job.cancelled || !jobs.has(videoId)) throw new Error('cancelled')
    if (scriptError) bail(scriptError)

    if (!stemsPresent(videoId, producedStems)) bail('Separation finished but stem files are missing')

    return producedStems
  } finally {
      release()
    }
}

/* macOS errno -86 (EBADARCH, "Bad CPU type in executable"): a spawned tool
   cannot run on this CPU — historically the x86_64 ffmpeg that older builds
   bundled for Apple Silicon Macs without Rosetta. Say that, not "Unknown
   system error -86" */
function friendlySpawnError(err: NodeJS.ErrnoException): Error {
  if (err.errno === -86 || /Unknown system error -86/.test(err.message ?? '')) {
    return new Error(
      "Stem-Machine's built-in audio tools don't work on this Mac — update Stem-Machine to the latest version"
    )
  }
  return err
}

function runProcess(
  job: ActiveJob,
  cmd: string,
  args: string[],
  opts: { onStdout?: (chunk: string) => void; onLine?: (line: string) => void } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (job.cancelled || !jobs.has(job.videoId)) return reject(new Error('cancelled'))
    const child = spawn(cmd, args, { env: { ...process.env } })
    job.proc = child

    let stdoutTail = ''
    let stderrTail = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutTail = (stdoutTail + text).slice(-2000)
      opts.onStdout?.(text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000)
    })

    if (opts.onLine && child.stdout) {
      const rl = createInterface({ input: child.stdout })
      rl.on('line', (line) => opts.onLine?.(line))
    }

    child.on('error', (err) => reject(friendlySpawnError(err)))
    child.on('close', (code) => {
      if (job.cancelled || !jobs.has(job.videoId)) return reject(new Error('cancelled'))
      if (code === 0) return resolve()
      const detail =
        stderrTail.split('\n').filter(Boolean).slice(-2).join(' — ') ||
        stdoutTail.split('\n').filter(Boolean).slice(-1).join('')
      reject(
        new Error(
          detail
            ? `${cmd.split('/').pop()} exited (${code}): ${detail}`
            : `${cmd.split('/').pop()} exited with code ${code}`
        )
      )
    })
  })
}

export async function searchYouTube(query: string): Promise<
  Array<{ videoId: string; title: string; channel?: string; duration?: number }>
> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const results = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      venvYtDlp(),
      [
        ...ytDlpRuntimeArgs(),
        '--no-warnings',
        '-J',
        '--flat-playlist',
        '--no-playlist',
        `ytsearch15:${trimmed}`
      ],
      { env: { ...process.env } }
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (c: Buffer) => {
      out += c.toString()
    })
    child.stderr?.on('data', (c: Buffer) => {
      err = (err + c.toString()).slice(-1000)
    })
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      reject(new Error('Search timed out'))
    }, 30000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err.split('\n').filter(Boolean).slice(-1).join('') || `search exited ${code}`))
    })
  })

  try {
    const data = JSON.parse(results)
    const entries = Array.isArray(data.entries) ? data.entries : []
    const mapped = entries
      .filter((e: Record<string, unknown>) => typeof e.id === 'string' && typeof e.title === 'string')
      .map((e: Record<string, unknown>) => ({
        videoId: e.id as string,
        title: e.title as string,
        channel:
          typeof e.uploader === 'string'
            ? e.uploader
            : typeof e.channel === 'string'
              ? e.channel
              : undefined,
        duration: typeof e.duration === 'number' ? Math.round(e.duration) : undefined
      }))
    return mapped
  } catch {
    return []
  }
}

function killTree(proc: ChildProcess): void {
  if (!proc.pid) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
    } catch {}
  } else {
    try {
      proc.kill('SIGKILL')
    } catch {}
  }
}

export function cancelJob(videoId?: string): void {
  const targets = videoId
    ? ([jobs.get(videoId)].filter(Boolean) as ActiveJob[])
    : Array.from(jobs.values())
  for (const job of targets) {
    job.cancelled = true
    killTree(job.proc as ChildProcess)
    jobs.delete(job.videoId)
    if (!job.resplit) rmSync(songDir(job.videoId), { recursive: true, force: true })
    send({ kind: 'failed', data: { videoId: job.videoId, message: 'Cancelled' } })
  }
}

export function isBusy(): boolean {
  return jobs.size > 0
}
