import { useEffect, useState } from 'react'
import { SmIcon } from './SmIcon'

interface Props {
  version?: string
  onClose: () => void
}

export function About({ version, onClose }: Props): React.ReactElement {
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')

  useEffect(() => {
    const off = window.stemkit.onUpdateEvent((event) => {
      switch (event.status) {
        case 'checking':
          setCheckingUpdates(true)
          setUpdateMessage('Verificando…')
          break
        case 'available':
          setCheckingUpdates(false)
          setUpdateMessage(`Baixando a versão ${event.version}…`)
          break
        case 'none':
          setCheckingUpdates(false)
          setUpdateMessage('Você está na versão mais recente.')
          break
        case 'progress':
          setCheckingUpdates(false)
          setUpdateMessage(`Baixando a atualização · ${event.pct ?? 0}%`)
          break
        case 'downloaded':
          setCheckingUpdates(false)
          setUpdateMessage(`A versão ${event.version} está pronta. Reinicie o Stem-Machine para instalar.`)
          break
        case 'error':
          setCheckingUpdates(false)
          setUpdateMessage('Erro ao verificar: sem conexão. Tente de novo mais tarde.')
          break
      }
    })
    return off
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const checkForUpdates = async (): Promise<void> => {
    setCheckingUpdates(true)
    setUpdateMessage('Verificando…')
    try {
      const result = await window.stemkit.checkForUpdates()
      if (result.ok) return
    } catch {
      // Show the same message if the updater IPC call itself fails.
    }
    setCheckingUpdates(false)
    setUpdateMessage('Erro ao verificar: sem conexão. Tente de novo mais tarde.')
  }

  const isErr = /^Erro/.test(updateMessage)
  const isOk = /mais recente|está pronta/.test(updateMessage)
  const busy = checkingUpdates || /Baixando/.test(updateMessage)
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="relative w-[420px] max-w-[94vw] rounded-[18px] border border-ln3 bg-pop p-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.6)] rise-in flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          title="Fechar"
          className="no-drag absolute right-4 top-4 w-8 h-8 rounded-full bg-btn border border-ln3 text-[#e6e6e8] grid place-items-center hover:bg-btn2"
        >
          <SmIcon name="x" size={16} />
        </button>
        <span className="w-14 h-14 rounded-2xl bg-acc text-acc-ink grid place-items-center">
          <SmIcon name="split" size={28} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="about-title" className="text-[22px] font-extrabold">Sobre o Stem-Machine</h2>
          {version && <p className="font-mono text-[13px] font-semibold text-sub">versão {version}</p>}
          <p className="text-[13px] text-mute mt-1">Separe músicas em stems e toque tudo localmente.</p>
        </div>

        <div className="flex flex-col gap-2">
          <p
            role="status"
            className={`flex items-center gap-2.5 rounded-xl border bg-pop px-3.5 py-3 text-[13px] font-semibold ${
              !updateMessage ? 'hidden' : isErr ? 'border-bad/40 text-bad3' : isOk ? 'border-ok/40 text-[#d6d6da]' : 'border-ln3 text-[#d6d6da]'
            }`}
          >
            <span className={`flex ${isErr ? 'text-bad' : isOk ? 'text-ok' : 'text-acc2'} ${checkingUpdates ? 'animate-spin' : ''}`}>
              <SmIcon name={isErr ? 'alert' : isOk ? 'check' : checkingUpdates ? 'loader' : 'download'} size={15} />
            </span>
            {updateMessage}
          </p>
          <button
            onClick={() => void window.stemkit.openExternal('https://github.com/Jcamihao/Stem-Machine/issues')}
            className="no-drag flex items-center justify-center gap-2 h-10 rounded-full bg-btn border border-ln3 text-[#e6e6e8] text-[13px] font-bold hover:bg-btn2"
          >
            Obter ajuda <SmIcon name="ext" size={13} stroke={2.6} />
          </button>
          <button
            onClick={() => void checkForUpdates()}
            disabled={busy}
            className="no-drag flex items-center justify-center gap-2 h-10 rounded-full bg-acc text-acc-ink text-[13px] font-extrabold hover:bg-acc2 disabled:opacity-50 disabled:cursor-wait"
          >
            <SmIcon name="refresh" size={16} /> {checkingUpdates ? 'Verificando…' : 'Verificar atualizações'}
          </button>
        </div>
      </div>
    </div>
  )
}
