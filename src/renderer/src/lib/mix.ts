// mixagem salva por música: só o que difere do padrão vai para o mix.json
// (música nunca mexida não ganha arquivo). Funções puras, testáveis fora do app
import type { MixState } from '../../../shared/types'

export interface MixInput {
  vols: Partial<Record<string, number>>
  mutes: Set<string>
  solos: Set<string>
  pans: Partial<Record<string, number>>
  eqs: Partial<Record<string, { low: number; mid: number; high: number } | undefined>>
  master: number
  speed: number
  semitones: number
  tuningHz: number
  clickFactor: number
}

export const DEFAULT_MASTER = 0.9

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3

// null = tudo no padrão
export function buildMix(m: MixInput): MixState | null {
  const out: MixState = {}
  const vols = Object.fromEntries(Object.entries(m.vols).filter(([, v]) => typeof v === 'number' && !near(v, 1)))
  if (Object.keys(vols).length) out.vols = vols as Record<string, number>
  if (m.mutes.size) out.mutes = [...m.mutes].sort()
  if (m.solos.size) out.solos = [...m.solos].sort()
  const pans = Object.fromEntries(Object.entries(m.pans).filter(([, v]) => typeof v === 'number' && !near(v, 0)))
  if (Object.keys(pans).length) out.pans = pans as Record<string, number>
  const eqs = Object.fromEntries(
    Object.entries(m.eqs).filter(([, e]) => e && (!near(e.low, 0) || !near(e.mid, 0) || !near(e.high, 0)))
  )
  if (Object.keys(eqs).length) out.eqs = eqs as NonNullable<MixState['eqs']>
  if (!near(m.master, DEFAULT_MASTER)) out.master = m.master
  if (!near(m.speed, 1)) out.speed = m.speed
  if (m.semitones !== 0) out.semitones = m.semitones
  if (m.tuningHz !== 440) out.tuningHz = m.tuningHz
  if (m.clickFactor !== 1) out.clickFactor = m.clickFactor
  return Object.keys(out).length ? out : null
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

const record = <T>(v: unknown, pick: (x: unknown) => T | null): Record<string, T> => {
  const out: Record<string, T> = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) {
      const val = pick(x)
      if (val !== null) out[k] = val
    }
  }
  return out
}

// valida o que veio do disco (arquivo editado/corrompido não pode quebrar o player)
export function parseMix(raw: MixState | null): MixInput {
  const r: MixState = raw && typeof raw === 'object' ? raw : {}
  const list = (v: unknown): Set<string> => new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const clickFactor = r.clickFactor === 0.5 || r.clickFactor === 2 ? r.clickFactor : 1
  return {
    vols: record(r.vols, (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(2, Math.max(0, x)) : null)),
    mutes: list(r.mutes),
    solos: list(r.solos),
    pans: record(r.pans, (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(-1, x)) : null)),
    eqs: record(r.eqs, (x) => {
      const e = x as { low?: unknown; mid?: unknown; high?: unknown } | null
      return e && typeof e === 'object'
        ? { low: num(e.low, -12, 12, 0), mid: num(e.mid, -12, 12, 0), high: num(e.high, -12, 12, 0) }
        : null
    }),
    master: num(r.master, 0, 1, DEFAULT_MASTER),
    speed: num(r.speed, 0.5, 1.5, 1),
    semitones: Math.round(num(r.semitones, -12, 12, 0)),
    tuningHz: Math.round(num(r.tuningHz, 430, 450, 440)),
    clickFactor
  }
}
