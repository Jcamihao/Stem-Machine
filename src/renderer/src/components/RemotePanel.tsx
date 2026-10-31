import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import type { RemoteStatus } from '../../../shared/remote'

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
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="w-44 h-44 rounded-lg bg-white" role="img" aria-label={`QR code de ${text}`}>
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
  const btn = 'no-drag h-8 px-3 shrink-0 whitespace-nowrap rounded-md bg-[#262626] text-[13px] font-semibold text-white hover:bg-[#333]'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[560px] max-w-[94vw] max-h-[92vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl flex flex-col text-white">
        <div className="h-14 shrink-0 flex items-center px-5 border-b border-white/10">
          <h2 className="flex-1 text-[15px] font-bold">Controle pelo celular</h2>
          <button onClick={onClose} title="Fechar" className="no-drag text-white/60 hover:text-white text-[18px] leading-none">×</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold">Ligar o controle</div>
              <div className="text-[12px] text-white/45">O celular abre uma página do app e toca, troca de parte, tom e pad.</div>
            </div>
            <button
              role="switch"
              aria-checked={on}
              disabled={!status || busy}
              onClick={toggle}
              title={on ? 'Desligar' : 'Ligar'}
              className={`no-drag relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${on ? 'bg-emerald-400' : 'bg-[#333]'}`}
            >
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {status?.error && <div className="px-3 py-2 rounded-md bg-rose-500/15 text-rose-200 text-[13px]">Erro: {status.error}</div>}

          {live && status && (
            <>
              <div className="flex gap-5 items-start">
                {status.urls[0] ? <Qr text={status.urls[0]} /> : null}
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                  <div>
                    <p className="text-[11px] font-semibold text-white/45 uppercase tracking-wide mb-1">Endereço</p>
                    {status.urls.length === 0 ? (
                      <p className="text-[13px] text-amber-300">Nenhuma rede encontrada. Conecte o computador ao Wi-Fi ou ao hotspot do celular.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {status.urls.map((url) => (
                          <button key={url} onClick={() => copy(url)} title="Copiar" className="no-drag text-left px-3 py-2 rounded-md bg-[#1e1e1e] hover:bg-[#2a2a2a]">
                            <span className="block text-[18px] font-bold tracking-tight break-all">{url}</span>
                            <span className="block text-[11px] text-white/45">{copied === url ? 'Copiado' : 'Clique para copiar'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-white/45 uppercase tracking-wide mb-1">PIN</p>
                    <div className="flex items-center gap-3">
                      <span className="text-[34px] leading-none font-bold tracking-[0.18em] tabular-nums">{status.pin}</span>
                      <button onClick={newPin} className={btn}>Gerar novo PIN</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`text-[13px] ${status.clients > 0 ? 'text-emerald-300' : 'text-white/45'}`}>
                {status.clients === 0 ? 'Nenhum celular conectado.' : status.clients === 1 ? '1 celular conectado.' : `${status.clients} celulares conectados.`}
              </div>
            </>
          )}

          <div className="text-[12px] text-white/55 flex flex-col gap-1 border-t border-white/10 pt-3">
            <p>A conexão é HTTP simples na sua rede. Use o seu roteador ou o hotspot do celular, não um Wi-Fi público.</p>
            <p>O Windows pode pedir para liberar a rede na primeira vez: permita em redes privadas.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
