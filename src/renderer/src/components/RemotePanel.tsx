import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import type { RemoteStatus } from '../../../shared/remote'
import { SmIcon } from './SmIcon'

// QR do endereço, gerado aqui mesmo (sem rede): um quadradinho por módulo, com a margem
// branca que os leitores exigem
function Qr({ text }: { text: string }): React.ReactElement {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
    return { size: n + 8, path: d }
  }, [text])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="w-[176px] h-[176px] rounded-lg bg-white" role="img" aria-label={`QR code de ${text}`}>
      <path d={path} fill="#000" />
    </svg>
  )
}

// controle pelo celular: liga o servidor local, mostra endereço, QR e PIN
export function RemotePanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void window.stemkit.remoteStatus().then((s) => alive && setStatus(s))
    const off = window.stemkit.onRemoteStatus((s) => setStatus(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  const toggle = (): void => {
    if (!status || busy) return
    setBusy(true)
    void window.stemkit
      .remoteSetEnabled(!status.enabled)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  const newPin = (): void => {
    if (!window.confirm('Gerar um novo PIN desconecta todos os celulares agora. Continuar?')) return
    void window.stemkit.remoteNewPin().then(setStatus)
  }
  const copy = (url: string): void => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied((cur) => (cur === url ? null : cur)), 1500)
    })
  }

  const on = !!status?.enabled
  const live = !!status?.running
  const btn = 'no-drag inline-flex items-center gap-1.5 h-[30px] px-3 shrink-0 whitespace-nowrap rounded-full bg-btn border border-ln3 text-[12px] font-bold text-[#e6e6e8] hover:bg-btn2'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[640px] max-w-[94vw] max-h-[92vh] bg-pop border border-ln3 rounded-[18px] shadow-[0_30px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden text-fg">
        <div className="shrink-0 flex items-center px-[22px] py-[18px]">
          <h2 className="flex-1 text-[20px] font-extrabold">Controle pelo celular</h2>
          <button onClick={onClose} title="Fechar" className="no-drag w-[34px] h-[34px] rounded-full bg-btn border border-ln3 text-[#e6e6e8] grid place-items-center hover:bg-btn2">
            <SmIcon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-[22px] pb-[18px] flex flex-col gap-4">
          <div className="flex items-center gap-3 bg-well border border-btn2 rounded-xl px-3.5 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold">Ligar o controle</div>
              <div className="text-[12px] text-mute">O celular abre uma página do app e toca, troca de parte, tom e pad.</div>
            </div>
            <button
              role="switch"
              aria-checked={on}
              disabled={!status || busy}
              onClick={toggle}
              title={on ? 'Desligar' : 'Ligar'}
              className={`no-drag relative w-[42px] h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${on ? 'bg-acc' : 'bg-ln2'}`}
            >
              <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full transition-transform ${on ? 'translate-x-[18px] bg-acc-ink' : 'bg-mute'}`} />
            </button>
          </div>

          {!on && <span className="text-[13px] text-mute">Ligue para mostrar o QR code, o endereço e o PIN.</span>}

          {status?.error && (
            <div className="flex gap-2.5 items-center bg-bad/[0.08] border border-bad/40 rounded-xl px-3.5 py-3 text-[13px] font-semibold text-bad3">
              <span className="text-bad flex"><SmIcon name="alert" size={16} /></span> Erro: {status.error}
            </div>
          )}

          {live && status && (
            <>
              <div className="flex gap-5 items-start">
                {status.urls[0] ? (
                  <div className="w-[200px] h-[200px] shrink-0 rounded-2xl bg-fg grid place-items-center"><Qr text={status.urls[0]} /></div>
                ) : null}
                <div className="flex-1 min-w-0 flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <p className="font-mono text-[10px] font-semibold tracking-[0.08em] text-dim uppercase">Endereço na rede</p>
                    {status.urls.length === 0 ? (
                      <div className="flex gap-2.5 items-center bg-well border border-ln2 rounded-xl px-3.5 py-3 text-[13px] font-semibold text-[#d6d6da]">
                        <span className="text-mute flex"><SmIcon name="wifioff" size={16} /></span>
                        Nenhuma rede encontrada. Conecte o computador ao Wi-Fi ou ao hotspot do celular.
                      </div>
                    ) : (
                      status.urls.map((url) => (
                        <button
                          key={url}
                          onClick={() => copy(url)}
                          title="Copiar"
                          className={`no-drag flex items-center gap-2 h-[38px] px-3 rounded-[10px] bg-well border text-left font-mono text-[13px] font-semibold ${copied === url ? 'border-ok' : 'border-ln2 text-[#d6d6da] hover:bg-chip'}`}
                        >
                          <span className="truncate">{url}</span>
                          {copied === url ? (
                            <span className="ml-auto inline-flex items-center gap-1 text-ok2 font-sans text-[11px] font-bold"><SmIcon name="check" size={13} stroke={2.6} /> Copiado</span>
                          ) : (
                            <span className="ml-auto text-mute flex"><SmIcon name="copy" size={13} stroke={2.6} /></span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="font-mono text-[10px] font-semibold tracking-[0.08em] text-dim uppercase">PIN</p>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[28px] leading-none font-bold tracking-[0.18em] tabular-nums">{status.pin}</span>
                      <button onClick={newPin} className={btn}><SmIcon name="refresh" size={13} stroke={2.6} /> Gerar novo PIN</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] font-bold">
                    <span className={`w-2 h-2 rounded-full ${status.clients > 0 ? 'bg-ok' : 'bg-[#55555c]'}`} />
                    {status.clients === 0 ? 'Nenhum celular conectado.' : status.clients === 1 ? '1 celular conectado' : `${status.clients} celulares conectados`}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 flex gap-2.5 items-start px-[22px] py-3.5 bg-warn/[0.07] border-t border-btn2 text-[12px] text-[#e8cf95] leading-normal">
          <span className="text-warn flex mt-px"><SmIcon name="lock" size={16} /></span>
          <div className="flex flex-col gap-1">
            <p>A conexão é HTTP simples na sua rede. Use o roteador da banda ou o hotspot do celular — não um Wi-Fi público.</p>
            <p>O Windows pode pedir para liberar a rede na primeira vez: permita em redes privadas.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
