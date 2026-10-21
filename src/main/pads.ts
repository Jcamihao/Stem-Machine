// pads importados pelo usuário: o arquivo é copiado para %APPDATA%\Stem-Machine\pads
// e o índice (nome + tom em que o arquivo está) fica em pads.json. O renderer lê os
// bytes e toca/transpõe (lib/pad.ts); aqui só guarda
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { randomUUID } from 'crypto'
import { dialog } from 'electron'
import { userDataDir } from './env'
import type { PadSample } from '../shared/types'

const PAD_EXTENSIONS = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac']

function padsDir(): string {
  return join(userDataDir(), 'pads')
}

function indexFile(): string {
  return join(padsDir(), 'pads.json')
}

export function listPads(): PadSample[] {
  try {
    const data = JSON.parse(readFileSync(indexFile(), 'utf8'))
    return Array.isArray(data) ? data.filter((p) => p && typeof p.id === 'string' && existsSync(join(padsDir(), p.file))) : []
  } catch {
    return []
  }
}

function savePads(pads: PadSample[]): PadSample[] {
  mkdirSync(padsDir(), { recursive: true })
  writeFileSync(indexFile(), JSON.stringify(pads, null, 2))
  return pads
}

function findPad(id: string): PadSample {
  const pad = listPads().find((p) => p.id === id)
  if (!pad) throw new Error('Pad not found')
  return pad
}

// escolhe o arquivo e copia; o tom começa em Dó e o usuário ajusta no painel
export async function importPad(): Promise<PadSample | null> {
  const result = await dialog.showOpenDialog({
    title: 'Importar pad',
    buttonLabel: 'Importar',
    properties: ['openFile'],
    filters: [{ name: 'Áudio', extensions: PAD_EXTENSIONS }]
  })
  const src = result.filePaths[0]
  if (result.canceled || !src) return null
  const ext = extname(src).toLowerCase()
  if (!PAD_EXTENSIONS.includes(ext.slice(1))) throw new Error('Unsupported file')
  const id = randomUUID()
  const pad: PadSample = { id, name: basename(src, extname(src)), key: 0, file: `${id}${ext}` }
  mkdirSync(padsDir(), { recursive: true })
  copyFileSync(src, join(padsDir(), pad.file))
  savePads([...listPads(), pad])
  return pad
}

export function updatePad(id: string, patch: { key?: number }): PadSample[] {
  findPad(id)
  return savePads(
    listPads().map((p) =>
      p.id === id && Number.isInteger(patch.key) && patch.key! >= 0 && patch.key! < 12 ? { ...p, key: patch.key! } : p
    )
  )
}

export function removePad(id: string): PadSample[] {
  const pad = findPad(id)
  rmSync(join(padsDir(), pad.file), { force: true })
  return savePads(listPads().filter((p) => p.id !== id))
}

export function readPad(id: string): Buffer {
  return readFileSync(join(padsDir(), findPad(id).file))
}
