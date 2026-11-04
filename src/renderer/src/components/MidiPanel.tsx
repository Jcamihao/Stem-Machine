import { useEffect } from 'react'
import { MIDI_ACTIONS, describeBinding } from '../../../shared/midi'
import { midi, useMidi } from '../lib/midi'
import { SmIcon } from './SmIcon'

// controle MIDI: lista de ações; "Aprender" espera a próxima tecla do controlador
export function MidiPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const s = useMidi()
  useEffect(() => {
    void midi.start()
    return () => midi.learn(null) // fechar o painel cancela um "aprender" pendente
  }, [])

  const groups = [...new Set(MIDI_ACTIONS.map((a) => a.group))]
  const keysOf = (id: string): string[] => Object.entries(s.map).filter(([, a]) => a === id).map(([k]) => k)
  const btn = 'no-drag inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-btn border border-ln3 text-[#e6e6e8] text-[12px] font-bold hover:bg-btn2'
  const connected = s.supported && !s.error && s.inputs.length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[760px] max-w-[94vw] max-h-[92vh] bg-pop border border-ln3 rounded-[18px] shadow-[0_30px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden text-fg">
        <div className="shrink-0 flex items-center px-[22px] py-[18px]">
          <h2 className="flex-1 text-[20px] font-extrabold">Controle MIDI</h2>
          <button onClick={onClose} title="Fechar" className="no-drag w-[34px] h-[34px] rounded-full bg-btn border border-ln3 text-[#e6e6e8] grid place-items-center hover:bg-btn2">
            <SmIcon name="x" size={16} />
          </button>
        </div>
        <div
          className={`shrink-0 mx-[22px] flex items-center gap-3 rounded-xl px-3.5 py-3 border ${
            connected ? 'bg-ok/[0.08] border-ok/35' : !s.supported || s.error ? 'bg-bad/[0.08] border-bad/40' : 'bg-well border-ln2'
          }`}
        >
          {!s.supported || s.error ? (
            <span className="text-bad flex"><SmIcon name="alert" size={16} /></span>
          ) : (
            <span className={`w-[9px] h-[9px] rounded-full ${connected ? 'bg-ok shadow-[0_0_0_4px_rgba(139,212,80,0.2)]' : 'bg-[#55555c]'}`} />
          )}
          <div className="flex-1 min-w-0 text-[13px] font-semibold">
            {!s.supported ? (
              <span className="text-bad3">Este sistema não tem MIDI.</span>
            ) : s.error ? (
              <span className="text-bad3">Erro: {s.error}</span>
            ) : s.inputs.length === 0 ? (
              <span className="text-[#d6d6da]">Nenhum controlador detectado. Conecte pelo USB e clique em Reconectar.</span>
            ) : (
              <span>Conectado: <span className="text-ok2">{s.inputs.join(' · ')}</span></span>
            )}
            <div className="font-mono text-[12px] font-medium text-sub mt-0.5 truncate">{s.last ? `Última tecla: ${s.last}` : 'Aperte uma tecla do controlador para ver se ele responde.'}</div>
          </div>
          <button onClick={() => void midi.start()} className={btn}><SmIcon name="refresh" size={13} stroke={2.6} /> Reconectar</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-[22px] pt-3.5 pb-[22px] flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-semibold tracking-[0.08em] text-dim px-1 pb-1 uppercase">{group}</p>
              {MIDI_ACTIONS.filter((a) => a.group === group).map((a) => {
                const waiting = s.learning === a.id
                return (
                  <div key={a.id} className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-[10px] border ${waiting ? 'bg-acc/[0.08] border-acc/50' : 'bg-well border-ln'}`}>
                    <span className="flex-1 min-w-0 text-[13px] font-semibold">{a.label}</span>
                    {keysOf(a.id).map((k) => (
                      <span key={k} className="inline-flex items-center gap-1.5 h-[26px] pl-[9px] pr-1.5 rounded-[7px] bg-btn2 border border-ln4 font-mono text-[11px] font-semibold">
                        {describeBinding(k)}
                        <button onClick={() => midi.unbind(k)} title="Tirar esta tecla" className="no-drag text-mute hover:text-bad2 flex"><SmIcon name="x" size={13} stroke={2.6} /></button>
                      </span>
                    ))}
                    <button
                      onClick={() => midi.learn(waiting ? null : a.id)}
                      className={`no-drag h-7 px-3 rounded-full text-[12px] font-bold border ${waiting ? 'bg-acc border-acc text-acc-ink animate-pulse' : 'bg-btn border-ln3 text-[#e6e6e8] hover:bg-btn2'}`}
                    >
                      {waiting ? 'Aperte a tecla…' : 'Aprender'}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
