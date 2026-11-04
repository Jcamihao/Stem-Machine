import { useEffect, useRef } from 'react'
import type { EnvStatus } from '../../../shared/types'
import { SmIcon } from './SmIcon'

interface Props {
  status: EnvStatus
  logs: { message: string; level: string }[]
  onInstall: () => void
}

export function Setup({ status, logs, onInstall }: Props): React.ReactElement {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  const failed = !status.bootstrapping && logs.some((l) => l.level === 'error')
  const started = status.bootstrapping || logs.length > 0

  return (
    <div className="h-full flex flex-col justify-center px-20 bg-app">
      <div className="w-full max-w-[640px] rise-in flex flex-col gap-6">
        {!started && (
          <span className="w-16 h-16 rounded-[18px] bg-acc text-acc-ink grid place-items-center">
            <SmIcon name="split" size={30} />
          </span>
        )}
        <div className="flex flex-col gap-2.5">
          <h1 className={`${started ? 'text-[34px]' : 'text-[46px]'} font-extrabold tracking-[-0.025em] leading-[1.05]`}>
            {failed ? 'A instalação parou' : started ? 'Preparando o Stem-Machine' : 'Bem-vindo ao Stem-Machine'}
          </h1>
          {!started && (
            <p className="text-[17px] text-sub">Configuração única — depois disso tudo funciona offline.</p>
          )}
        </div>

        {!status.bootstrapping && (
          <div className="flex items-center gap-4">
            <button
              onClick={onInstall}
              className="no-drag inline-flex items-center gap-2.5 h-[52px] px-[26px] rounded-full bg-acc text-acc-ink text-[16px] font-extrabold hover:bg-acc2 active:scale-[0.98] transition-all"
            >
              <SmIcon name={failed ? 'refresh' : 'download'} size={20} />
              {failed ? 'Tentar de novo' : 'Começar (~2 GB, uma vez só)'}
            </button>
            {!started && <span className="text-[14px] text-sub">Instala o ambiente e o motor de separação.</span>}
          </div>
        )}

        {started && (
          <div
            ref={logRef}
            className="max-h-[300px] overflow-y-auto rounded-[14px] bg-well border border-btn2 px-[22px] py-5 font-mono text-[13px] leading-normal flex flex-col gap-2.5"
          >
            {logs.map((l, i) => (
              <div
                key={i}
                className={`flex gap-2.5 items-start ${
                  l.level === 'error'
                    ? 'text-bad3 bg-bad/10 border border-bad/35 rounded-[10px] px-3.5 py-3'
                    : l.level === 'success'
                      ? 'text-ok'
                      : 'text-[#d6d6da]'
                }`}
              >
                {l.level === 'error' && <SmIcon name="alert" size={16} className="text-bad mt-0.5" />}
                {l.level === 'success' && <SmIcon name="check" size={16} />}
                <span>{l.message}</span>
              </div>
            ))}
            {status.bootstrapping && (
              <div className="flex items-center gap-2.5 text-acc2">
                <span className="animate-spin inline-flex">
                  <SmIcon name="loader" size={16} />
                </span>
                trabalhando…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
