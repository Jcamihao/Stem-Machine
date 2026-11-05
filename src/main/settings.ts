import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { userDataDir } from './env'
import { DEFAULT_SETTINGS, type AppSettings } from '../shared/types'
import { cleanMidiMap } from '../shared/midi'
import { OUTPUT_SIDES, PIN_RE, type OutputSide } from '../shared/remote'

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

function side(v: unknown, fallback: OutputSide): OutputSide {
  return OUTPUT_SIDES.includes(v as OutputSide) ? (v as OutputSide) : fallback
}

function clampPan(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : fallback
}

function clampMetronomeVolume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : fallback
}

function clampBpm(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(300, Math.max(30, v))) : fallback
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
    padPan: clampPan(merged.padPan, DEFAULT_SETTINGS.padPan),
    padSide: side(merged.padSide, DEFAULT_SETTINGS.padSide),
    padBrightness: clamp01(merged.padBrightness, DEFAULT_SETTINGS.padBrightness),
    padTransition: merged.padTransition === 'fast' ? 'fast' : 'slow',
    metronomeBpm: clampBpm(merged.metronomeBpm, DEFAULT_SETTINGS.metronomeBpm),
    metronomePan: clampPan(merged.metronomePan, DEFAULT_SETTINGS.metronomePan),
    metronomeSide: side(merged.metronomeSide, DEFAULT_SETTINGS.metronomeSide),
    metronomeVolume: clampMetronomeVolume(merged.metronomeVolume, DEFAULT_SETTINGS.metronomeVolume),
    sectionSwitch: merged.sectionSwitch === 'now' ? 'now' : 'bar',
    sceneAutoAdvance: !!merged.sceneAutoAdvance,
    padBetween: !!merged.padBetween,
    midiMap: cleanMidiMap(merged.midiMap),
    remoteEnabled: !!merged.remoteEnabled,
    remotePin: typeof merged.remotePin === 'string' && PIN_RE.test(merged.remotePin) ? merged.remotePin : ''
  }
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2))
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', next)
  }
  return next
}
