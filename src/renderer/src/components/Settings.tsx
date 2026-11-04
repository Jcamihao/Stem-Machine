import { useEffect, useState } from 'react'
import type { AppSettings, EngineStatus, GpuVendor } from '../../../shared/types'
import { SmIcon } from './SmIcon'

interface Props {
  settings: AppSettings
  gpu?: boolean
  gpuVendor?: GpuVendor
  onChange: (patch: Partial<AppSettings>) => void
  onClose: () => void
}

function Toggle({
  on,
  disabled,
  loading,
  onClick
}: {
  on: boolean
  disabled?: boolean
  loading?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`no-drag relative shrink-0 w-[42px] h-6 rounded-full transition-colors ${
        loading ? 'bg-ln2 cursor-wait' : on ? 'bg-acc' : 'bg-ln2 hover:bg-ln4'
      } ${disabled && !loading ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-3 h-3 rounded-full border-2 border-white/25 border-t-white/80 animate-spin" />
        </span>
      ) : (
        <span
          className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full transition-transform ${
            on ? 'translate-x-[18px] bg-acc-ink' : 'translate-x-0 bg-mute'
          }`}
        />
      )}
    </button>
  )
}

function DownloadBar({
  pct,
  starting,
  error
}: {
  pct: number | null
  starting?: boolean
  error?: string | null
}): React.ReactElement | null {
  if (error) {
    return <p className="text-[12px] text-bad2">{error}</p>
  }
  if (starting) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] text-acc3">Começando…</span>
        <div className="flex-1 h-[5px] rounded-full bg-btn2 overflow-hidden">
          <div className="h-full w-full bg-acc animate-pulse opacity-40" />
        </div>
      </div>
    )
  }
  if (pct === null || pct >= 100) return null
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-[5px] rounded-full bg-btn2 overflow-hidden">
        <div className="h-full bg-acc transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] font-semibold text-acc3">{pct}%</span>
    </div>
  )
}

function ConfirmButton({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="no-drag inline-flex items-center gap-1.5 self-start h-[30px] px-3 rounded-full bg-btn border border-ln3 text-[#e6e6e8] text-[12px] font-bold hover:bg-btn2"
    >
      <SmIcon name="download" size={13} stroke={2.6} /> {label}
    </button>
  )
}

function SectionHeader({ label }: { label: string }): React.ReactElement {
  return <h3 className="font-mono text-[10px] font-semibold tracking-[0.08em] text-acc3 uppercase px-0.5 pt-2.5 pb-1">{label}</h3>
}

function Row({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="flex flex-col gap-2.5 bg-well border border-btn2 rounded-xl px-4 py-3.5">{children}</div>
}

function Seg<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}): React.ReactElement {
  return (
    <div className="flex shrink-0 rounded-full bg-chip border border-ln2 p-[3px]">
      {options.map((opt) => (
        <button
          key={String(opt.v)}
          onClick={() => onChange(opt.v)}
          className={`no-drag px-3.5 py-1.5 rounded-full text-[12px] font-bold ${value === opt.v ? 'bg-acc text-acc-ink' : 'text-sub hover:text-fg'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Settings({ settings, gpu, gpuVendor, onChange, onClose }: Props): React.ReactElement {
  const [engines, setEngines] = useState<EngineStatus | null>(null)
  const [vocalsPct, setVocalsPct] = useState<number | null>(null)
  const [ftPct, setFtPct] = useState<number | null>(null)
  const [gpuPct, setGpuPct] = useState<number | null>(null)
  const [vocalsError, setVocalsError] = useState<string | null>(null)
  const [ftError, setFtError] = useState<string | null>(null)
  const [gpuError, setGpuError] = useState<string | null>(null)
  const [vocalsStarting, setVocalsStarting] = useState(false)
  const [ftStarting, setFtStarting] = useState(false)
  const [gpuStarting, setGpuStarting] = useState(false)

  useEffect(() => {
    const off = window.stemkit.onEnvEvent((e) => {
      const vocals = e.message.match(/vocals engine: (\d+)%/)
      if (vocals) {
        setVocalsPct(parseInt(vocals[1], 10))
        setVocalsError(null)
      }
      if (/Vocals engine ready/.test(e.message)) setVocalsPct(100)
      if (/Vocals engine download failed/.test(e.message)) setVocalsError(e.message)

      const ft = e.message.match(/fine-tuned engine: (\d+)%/)
      if (ft) {
        setFtPct(parseInt(ft[1], 10))
        setFtError(null)
      }
      if (/Fine-tuned engine ready/.test(e.message)) setFtPct(100)
      if (/Fine-tuned engine download failed/.test(e.message)) setFtError(e.message)

      const gpuEngine = e.message.match(/GPU engine: (\d+)%/)
      if (gpuEngine) {
        setGpuPct(parseInt(gpuEngine[1], 10))
        setGpuError(null)
      }
      if (/GPU engine ready/.test(e.message)) setGpuPct(100)
      if (/GPU engine install failed/.test(e.message)) setGpuError(e.message)
    })
    return off
  }, [])

  // poll engine state so the confirm button / spinner reflect reality even
  // for downloads started elsewhere (startup prefetch, a split in progress)
  useEffect(() => {
    let alive = true
    const tick = (): void => {
      void window.stemkit.enginesStatus().then((s) => {
        if (!alive) return
        setEngines(s)
        if (s.vocalsDownloading || s.vocalsReady) setVocalsStarting(false)
        if (s.ftDownloading || s.ftVerified) setFtStarting(false)
        if (s.gpuDownloading || s.gpuReady) setGpuStarting(false)
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const gpuLine =
    gpu === true
      ? 'Usando a sua GPU — rápido'
      : gpu === false && gpuVendor
        ? 'Rodando na CPU — ligue a aceleração por GPU abaixo para separar bem mais rápido'
        : gpu === false
          ? 'Nenhuma GPU encontrada — espere ~20-35 min por música na CPU'
          : null

  const vocalsBusy = vocalsStarting || (engines?.vocalsDownloading ?? false)
  const ftBusy = ftStarting || (engines?.ftDownloading ?? false)
  const gpuBusy = gpuStarting || (engines?.gpuDownloading ?? false)
  const showVocalsConfirm =
    !!engines && settings.roformerVocals && !engines.vocalsReady && !vocalsBusy
  const showFtConfirm = !!engines && settings.htdemucsFt && !engines.ftVerified && !ftBusy
  const showGpuConfirm =
    !!engines && settings.gpuSplit && !!gpuVendor && !engines.gpuReady && !gpuBusy

  const startVocals = (): void => {
    setVocalsStarting(true)
    setVocalsPct(null)
    setVocalsError(null)
    void window.stemkit.fetchEngine('vocals')
  }

  const startFt = (): void => {
    setFtStarting(true)
    setFtPct(null)
    setFtError(null)
    void window.stemkit.fetchEngine('ft')
  }

  const startGpu = (): void => {
    setGpuStarting(true)
    setGpuPct(null)
    setGpuError(null)
    void window.stemkit.fetchEngine('gpu')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[720px] max-w-[94vw] max-h-[92vh] flex flex-col overflow-hidden rounded-[18px] rise-in bg-pop border border-ln3 shadow-[0_30px_80px_rgba(0,0,0,0.6)] text-fg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center px-[22px] py-[18px] border-b border-btn2">
          <h2 className="text-[20px] font-extrabold flex-1">Configurações</h2>
          <span className="font-mono text-[11px] font-semibold text-dim mr-2.5">Esc</span>
          <button
            onClick={onClose}
            title="Fechar"
            className="no-drag w-[34px] h-[34px] rounded-full bg-btn border border-ln3 text-[#e6e6e8] grid place-items-center hover:bg-btn2"
          >
            <SmIcon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-[22px] pt-2 pb-[22px] flex flex-col gap-[18px]">
          <section className="flex flex-col gap-1.5">
            <SectionHeader label="Saída (playback)" />
            <Row>
              <div className="flex items-center gap-3.5">
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <p className="text-[14px] font-bold">Click e guia no L, música no R</p>
                  <p className="text-[12px] text-mute leading-[1.45]">
                    Para mesa de som ou in-ear: metrônomo e guia só no canal esquerdo, música em mono no direito. Os
                    pans ficam sem efeito; os volumes de cada faixa continuam valendo.
                  </p>
                </div>
                <Toggle on={settings.outputSplit} onClick={() => onChange({ outputSplit: !settings.outputSplit })} />
              </div>
            </Row>
          </section>

          <section className="flex flex-col gap-1.5">
            <SectionHeader label="Separação" />
            <Row>
              <div className="flex items-center gap-3.5">
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <p className="text-[14px] font-bold">Vocais de estúdio</p>
                  <p className="text-[12px] text-mute leading-[1.45]">Vocais mais limpos e naturais.</p>
                  {gpuLine && <p className="text-[11px] text-dim">{gpuLine}</p>}
                </div>
                <Toggle
                  on={settings.roformerVocals}
                  disabled={vocalsBusy}
                  loading={vocalsBusy}
                  onClick={() => onChange({ roformerVocals: !settings.roformerVocals })}
                />
              </div>
              <DownloadBar pct={vocalsPct} starting={vocalsBusy && vocalsPct === null} error={vocalsError} />
              {showVocalsConfirm && <ConfirmButton label="Baixar agora · 913 MB" onClick={startVocals} />}
            </Row>

            {gpuVendor && (
              <Row>
                <div className="flex items-center gap-3.5">
                  <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                    <p className="text-[14px] font-bold">Aceleração por GPU</p>
                    <p className="text-[12px] text-mute leading-[1.45]">
                      {gpuVendor === 'amd'
                        ? 'Use a sua GPU AMD para separar bem mais rápido. Experimental — depende do hardware.'
                        : 'Use a sua GPU NVIDIA para separar bem mais rápido.'}
                    </p>
                  </div>
                  <Toggle
                    on={settings.gpuSplit}
                    disabled={gpuBusy}
                    loading={gpuBusy}
                    onClick={() => onChange({ gpuSplit: !settings.gpuSplit })}
                  />
                </div>
                <DownloadBar pct={gpuPct} starting={gpuBusy && gpuPct === null} error={gpuError} />
                {showGpuConfirm && <ConfirmButton label="Baixar agora · ~3 GB" onClick={startGpu} />}
              </Row>
            )}

            <Row>
              <div className="flex items-center gap-3.5">
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <p className="text-[14px] font-bold">Instrumentos mais limpos</p>
                  <p className="text-[12px] text-mute leading-[1.45]">Mais qualidade em bateria, baixo e outros. Até 4× mais lento.</p>
                </div>
                <Toggle
                  on={settings.htdemucsFt}
                  disabled={ftBusy}
                  loading={ftBusy}
                  onClick={() => onChange({ htdemucsFt: !settings.htdemucsFt })}
                />
              </div>
              <DownloadBar pct={ftPct} starting={ftBusy && ftPct === null} error={ftError} />
              {showFtConfirm && <ConfirmButton label="Baixar agora · ~320 MB" onClick={startFt} />}
            </Row>

            <Row>
              <div className="flex items-center gap-3.5">
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <p className="text-[14px] font-bold">Passada extra de qualidade</p>
                  <p className="text-[12px] text-mute leading-[1.45]">
                    Separa a música duas vezes e mistura os resultados. Até 3× mais lento.
                  </p>
                </div>
                <Seg
                  value={settings.shifts}
                  options={[
                    { v: 1 as const, label: 'Rápida' },
                    { v: 2 as const, label: 'Melhor' }
                  ]}
                  onChange={(v) => onChange({ shifts: v })}
                />
              </div>
            </Row>

            <p className="flex gap-2 items-center text-[12px] text-[#e8cf95] px-0.5 py-1">
              <span className="text-warn flex"><SmIcon name="alert" size={13} stroke={2.6} /></span>
              As mudanças valem só para separações futuras. Músicas já separadas mantêm o som atual — separe de novo para usar as novas opções.
            </p>
          </section>

          <section className="flex flex-col gap-1.5">
            <SectionHeader label="Reprodução" />
            <Row>
              <div className="flex items-center gap-3.5">
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <p className="text-[14px] font-bold">Esconder vídeo do YouTube</p>
                  <p className="text-[12px] text-mute leading-[1.45]">
                    Os stems sempre tocam localmente. Isso não carrega o vídeo enquanto toca e usa só miniaturas.
                  </p>
                </div>
                <Toggle on={settings.hideVideo} onClick={() => onChange({ hideVideo: !settings.hideVideo })} />
              </div>
            </Row>
          </section>

          <section className="flex flex-col gap-1.5">
            <SectionHeader label="Exportação" />
            <Row>
              <div className="flex items-center gap-3.5">
                <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                  <p className="text-[14px] font-bold">Formato de exportação</p>
                  <p className="text-[12px] text-mute leading-[1.45]">
                    AAC (.m4a) é convertido na exportação com o ffmpeg embutido — arquivos bem menores, com pequena perda de qualidade.
                  </p>
                </div>
                <Seg
                  value={settings.exportFormat}
                  options={[
                    { v: 'wav' as const, label: 'WAV' },
                    { v: 'aac' as const, label: 'AAC' }
                  ]}
                  onChange={(v) => onChange({ exportFormat: v })}
                />
              </div>
            </Row>
          </section>
        </div>
      </div>
    </div>
  )
}
