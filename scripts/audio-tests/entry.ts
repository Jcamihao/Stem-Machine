// roda no Chromium (puppeteer): renderiza o metrônomo e o pad em um AudioContext offline e
// mede o que sai em cada canal; testa também a lógica do "BPM da música" e do TAP
import { pad } from '../../src/renderer/src/lib/pad'
import { metronome } from '../../src/renderer/src/lib/metronome'
import { DEFAULT_SETTINGS } from '../../src/shared/types'
import type { OutputSide } from '../../src/shared/remote'

const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'route'
const engineName = q.get('engine') ?? 'metronome'
const split = q.get('split') === '1'
const side = (q.get('side') ?? 'left') as OutputSide
const pan = Number(q.get('pan') ?? 0)
const SR = 48000
const LEN = 6

const post = (body: unknown): Promise<Response> => fetch('/r?id=' + encodeURIComponent(location.search), { method: 'POST', body: JSON.stringify(body) })
const saved: Record<string, unknown>[] = []
;(window as unknown as { stemkit: unknown }).stemkit = {
  setSettings: async (p: Record<string, unknown>) => { saved.push(p) },
  listPads: async () => [],
  getSettings: async () => DEFAULT_SETTINGS,
  onSettingsChange: () => () => {}
}

if (mode === 'logic') {
  // ---- BPM da música (follow) e TAP, sem áudio
  const out: string[] = []
  const eq = (a: unknown, b: unknown, m: string): void => { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`FAIL ${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
  metronome.applySettings({ ...DEFAULT_SETTINGS, metronomeBpm: 120 })
  const st = () => metronome.getState()
  eq([st().songBpm, st().follow, st().bpm], [null, false, 120], 'início')
  metronome.toggleFollow(); eq(st().follow, false, 'sem música não liga o follow')
  metronome.setSongBpm(73); eq([st().songBpm, st().follow, st().bpm], [73, false, 120], 'saber o BPM da música não muda o do metrônomo (independente)')
  metronome.toggleFollow(); eq([st().follow, st().bpm], [true, 73], 'ligar adota o BPM da música')
  metronome.setSongBpm(80); eq([st().follow, st().bpm], [true, 80], 'acompanha quando a música muda (velocidade)')
  metronome.setBpmManual(100); eq([st().follow, st().bpm], [false, 100], 'BPM manual desliga o acompanhamento')
  metronome.setSongBpm(90); eq(st().bpm, 100, 'desligado: a música não mexe mais no BPM')
  metronome.toggleFollow(); eq([st().follow, st().bpm], [true, 90], 'liga de novo')
  metronome.toggleFollow(); eq([st().follow, st().bpm], [false, 90], 'toque no botão desliga e mantém o BPM')
  metronome.toggleFollow(); metronome.setSongBpm(null); eq([st().follow, st().songBpm, st().bpm], [false, null, 90], 'fechar a música desliga o follow e guarda o BPM')
  metronome.setSongBpm(500); eq(st().songBpm, 300, 'BPM da música limitado a 300'); metronome.setSongBpm(null)
  // TAP com relógio controlado
  let now = 0
  const realNow = performance.now.bind(performance)
  performance.now = () => now
  metronome.toggleFollow()
  metronome.setSongBpm(70); metronome.toggleFollow(); eq(st().follow, true, 'follow ligado antes do TAP')
  now = 1000; metronome.tap(); eq(st().follow, true, '1 toque só marca o tempo')
  now = 1500; metronome.tap(); eq([st().bpm, st().follow], [120, false], '2 toques a 500 ms = 120 BPM e desliga o follow')
  now = 2000; metronome.tap(); now = 2500; metronome.tap(); eq(st().bpm, 120, 'média estável')
  now = 5000; metronome.tap(); eq(st().bpm, 120, 'pausa > 2 s recomeça: o 1º toque não muda o BPM')
  now = 5400; metronome.tap(); eq(st().bpm, 150, 'depois da pausa, 400 ms = 150 BPM')
  performance.now = realNow
  const persisted = saved.filter((p) => 'metronomeBpm' in p)
  setTimeout(() => post({ id: location.search, fail: out, persistiu: saved.some((p) => 'metronomeBpm' in p), n: persisted.length }), 400)
} else {
  // ---- roteamento por canal em AudioContext offline
  let off!: OfflineAudioContext
  const realResume = OfflineAudioContext.prototype.resume
  ;(window as unknown as { AudioContext: unknown }).AudioContext = class extends OfflineAudioContext {
    constructor() { super(2, SR * LEN, SR); off = this }
    resume(): Promise<void> { return Promise.resolve() }
  }
  const intervals = new Map<number, () => void>(); let nid = 1
  ;(window as unknown as { setInterval: unknown }).setInterval = (cb: () => void) => { const i = nid++; intervals.set(i, cb); return i }
  ;(window as unknown as { clearInterval: unknown }).clearInterval = (i: number) => intervals.delete(i)
  const rt = window.setTimeout.bind(window)
  ;(window as unknown as { setTimeout: unknown }).setTimeout = (cb: () => void, ms = 0) => (ms >= 150 ? 0 : rt(cb, ms))

  const settings = { ...DEFAULT_SETTINGS, outputSplit: split, metronomeSide: side, padSide: side, metronomePan: pan, padPan: pan }
  metronome.applySettings(settings)
  pad.applySettings(settings)
  const target = engineName === 'pad' ? pad : metronome
  ;(async () => {
    await new Promise((r) => rt(r, 50))
    if (engineName === 'pad') await pad.pressKey(0)
    else await metronome.start()
    const events: Record<string, () => void> = mode === 'switch' ? { '3': () => (target as typeof pad).setSide(side === 'left' ? 'right' : 'left') } : {}
    for (let k = 1; k * 0.1 < LEN; k++) {
      const t = Math.round(k * 0.1 * 10) / 10
      off.suspend(t).then(async () => {
        const ev = events[String(t)]; if (ev) ev()
        for (const cb of [...intervals.values()]) cb()
        await realResume.call(off)
      })
    }
    const buf = await off.startRendering()
    const rms = (ch: number, a: number, b: number): number => { const d = buf.getChannelData(ch); let s = 0; const i0 = Math.floor(a * SR), i1 = Math.floor(b * SR); for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / (i1 - i0)) }
    // janelas depois do fade de entrada do pad (2,5 s): 'antes' = 1,6..2,9 só vale p/ metrônomo; usamos 3,2..5,9 e 0,8..2,9
    post({ id: location.search, engine: engineName, antes: [rms(0, 0.8, 2.9), rms(1, 0.8, 2.9)], depois: [rms(0, 3.3, 5.9), rms(1, 3.3, 5.9)] })
  })().catch((e) => post({ id: location.search, error: String(e && (e as Error).stack || e) }))
}
