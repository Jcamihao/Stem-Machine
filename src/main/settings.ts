import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { userDataDir } from './env'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types'

function settingsFile(): string {
  return join(userDataDir(), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const data = JSON.parse(readFileSync(settingsFile(), 'utf8'))
    return { ...DEFAULT_SETTINGS, ...(data && typeof data === 'object' ? data : {}) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...patch }
  const next: AppSettings = {
    shifts: merged.shifts === 2 ? 2 : 1,
    htdemucsFt: !!merged.htdemucsFt,
    roformerVocals: !!merged.roformerVocals,
    gpuSplit: !!merged.gpuSplit,
    hideVideo: !!merged.hideVideo,
    exportFormat: merged.exportFormat === 'aac' ? 'aac' : 'wav',
    outputSplit: !!merged.outputSplit,
    padSource: typeof merged.padSource === 'string' && merged.padSource ? merged.padSource : 'synth',
    padKey: Number.isInteger(merged.padKey) ? (((merged.padKey % 12) + 12) % 12) : 0,
    padVolume: clamp01(merged.padVolume, DEFAULT_SETTINGS.padVolume),
    padBrightness: clamp01(merged.padBrightness, DEFAULT_SETTINGS.padBrightness),
    padTransition: merged.padTransition === 'fast' ? 'fast' : 'slow'
  }
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', next)
  }
  return next
}
