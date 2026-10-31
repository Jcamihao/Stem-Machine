import { useEffect } from 'react'
import { MIDI_ACTIONS, describeBinding } from '../../../shared/midi'
import { midi, useMidi } from '../lib/midi'

// controle MIDI: lista de ações; "Aprender" espera a próxima tecla do controlador
export function MidiPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const s = useMidi()
  useEffect(() => {
    void midi.start()
    return () => midi.learn(null) // fechar o painel cancela um "aprender" pendente
  }, [])

  const groups = [...new Set(MIDI_ACTIONS.map((a) => a.group))]
  const keysOf = (id: string): string[] => Object.entries(s.map).filter(([, a]) => a === id).map(([k]) => k)
  const btn = 'no-drag h-7 px-2.5 rounded-md bg-[#262626] text-[12px] font-semibold text-white hover:bg-[#333]'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-[680px] max-w-[94vw] h-[600px] max-h-[92vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl flex flex-col text-white">
        <div className="h-14 shrink-0 flex items-center px-5 border-b border-white/10">
          <h2 className="flex-1 text-[15px] font-bold">Controle MIDI</h2>
          <button onClick={onClose} title="Fechar" className="no-drag text-white/60 hover:text-white text-[18px] leading-none">×</button>
        </div>
        <div className="shrink-0 px-5 py-3 border-b border-white/10 text-[12px] flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {!s.supported ? (
              <span className="text-rose-300">Este sistema não tem MIDI.</span>
            ) : s.error ? (
              <span className="text-rose-300">Erro: {s.error}</span>
            ) : s.inputs.length === 0 ? (
              <span className="text-amber-300">Nenhum controlador detectado. Ligue o teclado ou pad por USB e clique em Reconectar.</span>
            ) : (
              <span className="text-emerald-300">Conectado: {s.inputs.join(', ')}</span>
            )}
            <div className="text-white/45 mt-0.5 truncate">{s.last ? `Última tecla: ${s.last}` : 'Aperte uma tecla do controlador para ver se ele responde.'}</div>
          </div>
          <button onClick={() => void midi.start()} className={btn}>Reconectar</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <p className="text-[11px] font-semibold text-white/45 uppercase tracking-wide mb-1.5">{group}</p>
              <div className="flex flex-col gap-1">
                {MIDI_ACTIONS.filter((a) => a.group === group).map((a) => {
                  const waiting = s.learning === a.id
                  return (
                    <div key={a.id} className="flex items-center gap-2 min-h-9 px-2.5 py-1 rounded-md bg-[#1e1e1e]">
                      <span className="w-[210px] shrink-0 text-[13px]">{a.label}</span>
                      <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                        {keysOf(a.id).map((k) => (
                          <span key={k} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded bg-[#2a2a2a] text-[11px]">
                            {describeBinding(k)}
                            <button onClick={() => midi.unbind(k)} title="Tirar esta tecla" className="no-drag w-4 h-4 rounded hover:bg-rose-500/40 leading-none">×</button>
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => midi.learn(waiting ? null : a.id)}
                        className={`no-drag h-7 px-2.5 rounded-md text-[12px] font-semibold ${waiting ? 'bg-amber-300 text-black animate-pulse' : 'bg-[#262626] text-white hover:bg-[#333]'}`}
                      >
                        {waiting ? 'Aperte a tecla…' : 'Aprender'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
