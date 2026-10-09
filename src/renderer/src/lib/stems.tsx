import type { StemId } from '../../../shared/types'
import { MicIcon, DrumIcon, BassIcon, WaveIcon, PianoIcon, GuitarIcon, MetronomeIcon, GuideIcon } from '../components/Icons'

export interface StemMeta {
  id: StemId
  label: string
  color: string
  icon: React.ReactNode
}

const ALL_META: Record<StemId, StemMeta> = {
  vocals: { id: 'vocals', label: 'Vocais', color: '#A78BFA', icon: <MicIcon /> },
  drums: { id: 'drums', label: 'Bateria', color: '#F87171', icon: <DrumIcon /> },
  bass: { id: 'bass', label: 'Baixo', color: '#60A5FA', icon: <BassIcon /> },
  guitar: { id: 'guitar', label: 'Guitarra', color: '#F472B6', icon: <GuitarIcon /> },
  piano: { id: 'piano', label: 'Piano', color: '#FBBF24', icon: <PianoIcon /> },
  other: { id: 'other', label: 'Outro', color: '#34D399', icon: <WaveIcon /> },
  click: { id: 'click', label: 'Metrônomo Inteligente', color: '#7DD3FC', icon: <MetronomeIcon /> },
  guide: { id: 'guide', label: 'Guia', color: '#FDBA74', icon: <GuideIcon /> }
}

// gerados por último: click abaixo de other, guia abaixo do click
const PREFERRED_ORDER: StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other', 'click', 'guide']

export { ALL_META as STEM_INFO, PREFERRED_ORDER }

export function buildStemMeta(available: StemId[]): StemMeta[] {
  return PREFERRED_ORDER.filter((id) => available.includes(id)).map((id) => ALL_META[id])
}
