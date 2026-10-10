import { spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { getStatus } from './env'
import { loadSongs, songDir, stemsDir, stemsFor } from './library'

/* velocidade e tom sem um alterar o outro: cada faixa é processada uma vez com o
   Rubber Band (filtro do ffmpeg que já vem no app) e guardada por música. As 2
   combinações mais recentes ficam em cache; voltar a elas é instantâneo */
const KEEP = 2
const PARALLEL = 6

function variantsRoot(videoId: string): string {
  return join(songDir(videoId), 'variants')
}

function send(videoId: string, done: number, total: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('variant:progress', { videoId, done, total })
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getStatus().ffmpeg.path as string, args)
    let stderr = ''
    child.stderr?.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-600)
    })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))))
  })
}

const inFlight = new Map<string, Promise<void>>()

export async function variantBuffers(
  videoId: string,
  speed: number,
  semitones: number
): Promise<Record<string, Uint8Array>> {
  if (!getStatus().ffmpeg.path) throw new Error('Audio tools not ready yet')
  const song = loadSongs().find((s) => s.videoId === videoId)
  if (!song) throw new Error('Song not found')
  const stems = stemsFor(song)
  // o motor (model) entra na chave: depois de "adicionar stem" as faixas são outras
  const key = `${(song.model ?? 'm').replace(/[^\w@.-]/g, '_')}__s${Math.round(speed * 100)}_t${semitones}`
  const dir = join(variantsRoot(videoId), key)

  let pending = inFlight.get(`${videoId}/${key}`)
  if (!pending) {
    pending = (async () => {
      mkdirSync(dir, { recursive: true })
      const todo = stems.filter((name) => !existsSync(join(dir, `${name}.wav`)))
      let done = stems.length - todo.length
      send(videoId, done, stems.length)
      const pitch = Math.pow(2, semitones / 12)
      const queue = [...todo]
      const worker = async (): Promise<void> => {
        for (let name = queue.shift(); name; name = queue.shift()) {
          const out = join(dir, `${name}.wav`)
          const part = join(dir, `${name}.part.wav`)
          // formantes preservados na voz: transpor não deixa o cantor "de desenho"
          const filter = `rubberband=tempo=${speed}:pitch=${pitch}:pitchq=quality${name === 'vocals' ? ':formant=preserved' : ''}`
          await runFfmpeg(['-v', 'error', '-y', '-i', join(stemsDir(videoId), `${name}.wav`), '-af', filter, '-c:a', 'pcm_s16le', part])
          renameSync(part, out)
          send(videoId, ++done, stems.length)
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker))
    })().finally(() => inFlight.delete(`${videoId}/${key}`))
    inFlight.set(`${videoId}/${key}`, pending)
  }
  await pending

  // marca como usada agora e apaga as combinações mais antigas (cada uma ocupa ~300MB)
  const now = new Date()
  utimesSync(dir, now, now)
  const all = readdirSync(variantsRoot(videoId))
    .map((name) => ({ name, at: statSync(join(variantsRoot(videoId), name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
  for (const old of all.slice(KEEP)) rmSync(join(variantsRoot(videoId), old.name), { recursive: true, force: true })

  const out: Record<string, Uint8Array> = {}
  await Promise.all(stems.map(async (name) => (out[name] = new Uint8Array(await readFile(join(dir, `${name}.wav`))))))
  return out
}
