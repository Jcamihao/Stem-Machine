import type { StemId } from '../../../shared/types'
import { MicIcon, DrumIcon, BassIcon, WaveIcon, PianoIcon, GuitarIcon, MetronomeIcon, GuideIcon } from '../components/Icons'

export interface StemMeta {
  id: StemId
  label: string
  color: string
  icon: React.ReactNode
}

const ALL_META: Record<StemId, StemMeta> = {
  vocals: { id: 'vocals', label: 'Vocais', color: '#ff5b1f', icon: <MicIcon /> },
  drums: { id: 'drums', label: 'Bateria', color: '#7b61ff', icon: <DrumIcon /> },
  bass: { id: 'bass', label: 'Baixo', color: '#3d8bff', icon: <BassIcon /> },
  guitar: { id: 'guitar', label: 'Guitarra', color: '#e2407a', icon: <GuitarIcon /> },
  piano: { id: 'piano', label: 'Piano', color: '#b8d63a', icon: <PianoIcon /> },
  other: { id: 'other', label: 'Outro', color: '#33c7d6', icon: <WaveIcon /> },
  click: { id: 'click', label: 'Metrônomo Inteligente', color: '#f5b638', icon: <MetronomeIcon /> },
  guide: { id: 'guide', label: 'Guia', color: '#a8a8b2', icon: <GuideIcon /> }
}

// gerados por último: click abaixo de other, guia abaixo do click
const PREFERRED_ORDER: StemId[] = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other', 'click', 'guide']

export { ALL_META as STEM_INFO, PREFERRED_ORDER }

export function buildStemMeta(available: StemId[]): StemMeta[] {
  return PREFERRED_ORDER.filter((id) => available.includes(id)).map((id) => ALL_META[id])
}
