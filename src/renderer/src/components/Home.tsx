import { useEffect, useRef, useState } from 'react'
import {
  MODEL_DEFAULT,
  MODEL_EXTENDED,
  DEFAULT_STEMS,
  type AppSettings,
  type SearchResult,
  type Song,
  type StemId
} from '../../../shared/types'
import { parseVideoId } from '../../../shared/url'
import { STEM_INFO, PREFERRED_ORDER } from '../lib/stems'
import { fmtTime } from '../lib/format'
import { SmIcon } from './SmIcon'

interface Props {
  hasSongs: boolean
  songs: Song[]
  pending?: Record<string, { label: string; error?: boolean }>
  settings?: AppSettings
  onStart: (url: string, model: string, stems?: string[]) => void
  onStartLocal: (filePath: string, model: string, stems?: string[]) => void
  onSelect: (videoId: string) => void
  onOpenSettings: () => void
}

// click e guia não se escolhem: são gerados automaticamente (batidas e seções)
const ALL_STEMS = PREFERRED_ORDER.filter((id) => id !== 'click' && id !== 'guide')

export function Home({
  hasSongs,
  songs,
  pending = {},
  settings,
  onStart,
  onStartLocal,
  onSelect,
  onOpenSettings
}: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<StemId>>(new Set<StemId>(DEFAULT_STEMS as StemId[]))
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchedFor, setSearchedFor] = useState('')
  const seqRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const usesExtended = [...selected].some((id) => id === 'guitar' || id === 'piano')
  const derivedModel = usesExtended ? MODEL_EXTENDED : MODEL_DEFAULT
  const orderedSelection = ALL_STEMS.filter((id) => selected.has(id))
  // guitarra e piano sempre disponíveis: quando escolhidos, a música usa o
  // motor de 6 fontes (o "Cleaner instruments" só cobre a separação em 4)
  const engineLabel = usesExtended
    ? 'motor de 6 fontes'
    : settings?.roformerVocals
      ? 'motor de estúdio'
      : settings?.htdemucsFt
        ? 'motor aprimorado'
        : 'motor padrão'
  const timeHint = usesExtended || settings?.roformerVocals
    ? 'Uma música de 4 minutos leva cerca de três minutos para separar.'
    : settings?.htdemucsFt || settings?.shifts === 2
      ? 'Uma música de 4 minutos demora um pouco mais com as opções de qualidade ligadas.'
      : 'Uma música de 4 minutos leva cerca de três minutos para separar.'

  const toggleStem = (id: StemId): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startWithSelection = (videoIdOrUrl: string): void => {
    onStart(
      videoIdOrUrl.startsWith('http') ? videoIdOrUrl : `https://www.youtube.com/watch?v=${videoIdOrUrl}`,
      derivedModel,
      orderedSelection
    )
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runSearch = async (q: string): Promise<void> => {
    const seq = ++seqRef.current
    setSearching(true)
    setSearchError(null)
    try {
      const res = await window.stemkit.searchYouTube(q)
      if (seqRef.current === seq) {
        setResults(res)
        setSearchedFor(q)
      }
    } catch (err) {
      if (seqRef.current === seq) {
        setSearchError(err instanceof Error ? err.message : String(err))
        setResults([])
      }
    } finally {
      if (seqRef.current === seq) setSearching(false)
    }
  }

  const handleInput = (value: string): void => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = value.trim()
    if (!trimmed || parseVideoId(trimmed)) {
      setResults([])
      setSearchError(null)
      setSearching(false)
      return
    }
    debounceRef.current = setTimeout(() => void runSearch(trimmed), 450)
  }

  const submit = (): void => {
    const trimmed = query.trim()
    if (!trimmed || selected.size === 0) return
    if (parseVideoId(trimmed)) {
      startWithSelection(trimmed)
      setQuery('')
      setResults([])
      return
    }
    if (searching) return
    void runSearch(trimmed)
  }

  const startResult = (r: SearchResult): void => {
    startWithSelection(r.videoId)
  }

  const pickAndStart = async (): Promise<void> => {
    if (selected.size === 0) return
    const filePath = await window.stemkit.pickAudioFile()
    if (filePath) onStartLocal(filePath, derivedModel, orderedSelection)
  }

  const isLink = !!parseVideoId(query)
  return (
    <div className="h-full flex flex-col overflow-y-auto px-8 pb-6 bg-app">
      <div className="w-full max-w-[820px] mx-auto pt-4 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-[40px] font-extrabold tracking-[-0.025em] leading-[1.1]">Transforme qualquer música em stems.</h1>
          <p className="text-[16px] text-sub">
            Busque no YouTube, cole um link ou escolha um arquivo. A separação roda no seu computador.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <div
            className={`flex-1 flex items-center gap-2.5 h-[52px] rounded-full bg-pop px-5 text-[16px] ${
              selected.size === 0 ? 'border border-ln2' : 'border-[1.5px] border-acc focus-within:shadow-[0_0_0_4px_rgba(255,91,31,0.15)]'
            }`}
          >
            <SmIcon name={isLink ? 'link' : 'search'} size={20} className="text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Buscar no YouTube ou colar um link…"
              spellCheck={false}
              className={`no-drag flex-1 min-w-0 bg-transparent outline-none placeholder:text-dim ${isLink ? 'font-mono text-[14px]' : ''}`}
            />
          </div>
          <button
            onClick={() => void pickAndStart()}
            disabled={selected.size === 0}
            title="Escolher arquivo de áudio (mp3, wav, flac…)"
            className="no-drag w-[52px] h-[52px] rounded-full bg-pop border border-ln2 text-[#e6e6e8] grid place-items-center hover:bg-btn disabled:opacity-45 disabled:hover:bg-pop"
          >
            <SmIcon name="folder" size={20} className="pointer-events-none" />
          </button>
          <button
            onClick={submit}
            disabled={!query.trim() || selected.size === 0}
            className="no-drag inline-flex items-center gap-2 h-[52px] px-[26px] rounded-full bg-acc text-acc-ink text-[15px] font-extrabold hover:bg-acc2 active:scale-[0.98] transition-all disabled:opacity-45 disabled:hover:bg-acc disabled:active:scale-100"
          >
            {isLink && <SmIcon name="split" size={16} />}
            {isLink ? 'Separar' : 'Buscar'}
          </button>
        </div>
        {isLink && <p className="-mt-3 text-[13px] text-sub">Link detectado — vai direto para a separação.</p>}

        <div className="bg-panel border border-ln rounded-[14px] px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[14px] font-extrabold">Instrumentos</span>
            <span
              className={`font-mono text-[11px] font-semibold px-2 py-[3px] rounded-full border ${
                selected.size === 0
                  ? 'text-sub bg-chip border-ln2'
                  : usesExtended
                    ? 'text-vio2 bg-vio/15 border-vio/40'
                    : 'text-sub bg-chip border-ln2'
              }`}
            >
              {selected.size === 0 ? 'marque ao menos 1' : `${engineLabel} · ${selected.size} stems`}
            </span>
            <button
              onClick={onOpenSettings}
              title="Configurações"
              className="no-drag ml-auto w-[30px] h-[30px] rounded-full text-sub hover:text-fg hover:bg-white/10 grid place-items-center"
            >
              <SmIcon name="gear" size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ALL_STEMS.map((id) => {
              const info = STEM_INFO[id]
              const on = selected.has(id)
              return (
                <button
                  key={id}
                  onClick={() => toggleStem(id)}
                  className={`no-drag inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[14px] font-bold border-[1.5px] transition-colors ${
                    on ? 'text-fg' : 'text-mute border-ln2 hover:text-fg hover:border-[#55555c]'
                  }`}
                  style={on ? { background: `${info.color}29`, borderColor: info.color } : undefined}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: on ? info.color : '#3a3a40' }} />
                  {info.label}
                </button>
              )
            })}
          </div>
          {selected.size === 0 && (
            <div className="flex items-center gap-2 text-[13px] font-bold text-bad2">
              <SmIcon name="alert" size={16} /> Marque pelo menos 1 instrumento.
            </div>
          )}
        </div>

        {(searching || searchError || results.length > 0) && (
          <div className="flex flex-col gap-0.5">
            {searching && (
              <div className="flex flex-col gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="grid grid-cols-[112px_1fr] gap-4 items-center animate-pulse" style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="h-14 rounded-[9px] bg-chip" />
                    <div className="flex flex-col gap-2">
                      <div className="h-3 rounded-full bg-btn" style={{ width: `${70 - i * 6}%` }} />
                      <div className="h-[9px] w-[30%] rounded-full bg-[#18181b]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!searching && searchError && (
              <div className="flex gap-3 items-start bg-bad/10 border border-bad/35 text-bad3 rounded-xl px-[18px] py-4 text-[14px] leading-normal">
                <SmIcon name="alert" size={20} className="text-bad mt-px" />
                <span>
                  <b className="text-bad2">Falha na busca:</b> {searchError}
                </span>
              </div>
            )}
            {!searching && !searchError && results.length > 0 && (
              <div className="rise-in flex flex-col gap-0.5">
                <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-dim font-semibold mb-2">
                  Resultados para “{searchedFor}”
                </p>
                {results.map((r) => {
                  const p = pending[r.videoId]
                  const inProgress = !!p && !p.error
                  const failed = !!p?.error
                  const saved = !p && songs.some((s) => s.videoId === r.videoId)
                  return (
                    <button
                      key={r.videoId}
                      onClick={() => (inProgress || failed || saved ? onSelect(r.videoId) : startResult(r))}
                      title={
                        inProgress
                          ? 'Ver o progresso'
                          : failed
                            ? 'Ver o erro'
                            : saved
                              ? 'Abrir da biblioteca'
                              : 'Separar em stems'
                      }
                      className="no-drag group w-full grid grid-cols-[112px_minmax(0,1fr)_auto] gap-4 items-center p-2 rounded-xl text-left hover:bg-pop transition-colors"
                    >
                      <span className="relative block w-[112px] h-[63px]">
                        <img
                          src={`https://i.ytimg.com/vi/${r.videoId}/default.jpg`}
                          alt=""
                          className="w-full h-full rounded-[9px] object-cover bg-chip"
                          draggable={false}
                        />
                        {typeof r.duration === 'number' && r.duration > 0 && (
                          <span className="absolute bottom-[5px] right-[5px] bg-black/80 rounded-[5px] text-[10px] font-mono font-semibold px-[5px] py-0.5">
                            {fmtTime(r.duration)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex flex-col gap-[3px]">
                        <span className="block text-[15px] font-bold truncate">{r.title}</span>
                        <span className="block text-[12px] text-mute">{r.channel}</span>
                      </span>
                      {inProgress ? (
                        <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-bold bg-btn border border-ln3 text-acc3">
                          <span className="animate-spin inline-flex"><SmIcon name="loader" size={14} stroke={2.6} /></span>
                          <span className="max-w-[120px] truncate">{p!.label}</span>
                        </span>
                      ) : failed ? (
                        <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-bold bg-bad/10 border border-bad/40 text-bad2">
                          <SmIcon name="alert" size={14} stroke={2.6} /> falhou — ver
                        </span>
                      ) : saved ? (
                        <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-bold bg-ok/10 border border-ok/40 text-ok2">
                          <SmIcon name="check" size={14} stroke={2.6} /> Na biblioteca
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-bold bg-acc text-acc-ink opacity-0 group-hover:opacity-100 transition-opacity">
                          Separar <SmIcon name="arrowr" size={14} stroke={2.6} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {!hasSongs && results.length === 0 && !searching && (
          <p className="text-[13px] text-dim">{timeHint}</p>
        )}
        {hasSongs && results.length === 0 && !searching && !searchError && (
          <p className="text-[13px] text-dim">{timeHint}</p>
        )}
      </div>
    </div>
  )
}
