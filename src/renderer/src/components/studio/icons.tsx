// ícones da tela estúdio (traço 2px, 24x24)
const Svg = ({ d, className = 'w-5 h-5', fill }: { d: string; className?: string; fill?: boolean }): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />
  </svg>
)

export const BackIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M19 12H5m6-6-6 6 6 6" />
export const NoteIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
export const SplitIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M3 7h6l6 10h6M3 17h6l2-3.3M15 7h6m-3-3 3 3-3 3m0 4 3 3-3 3" />
export const TuneIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M4 18h16M4 12h16M4 6h16M9 4v4m6 8v4m-3-10v4" />
export const MeterIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M6 4h4M8 4v6M14 4h4l-4 6h4M6 14h4l-4 6h4M14 14h4m-2 0v6" />
export const ExportIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M12 3v12m-5-5 5 5 5-5M5 21h14" />
export const MoreIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} fill d="M12 7a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 7Zm0 6.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm0 6.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />
export const ChevronIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="m6 9 6 6 6-6" />
export const VolumeIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
export const RewindIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} fill d="M11 6v12l-8.5-6L11 6Zm10 0v12l-8.5-6L21 6Z" />
export const ForwardIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} fill d="M13 6v12l8.5-6L13 6ZM3 6v12l8.5-6L3 6Z" />
export const PauseBarsIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M9 5v14M15 5v14" />
export const PlayTriIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} fill d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" />
export const LoopIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-3v2a4 4 0 0 1-4 4H4" />
export const LyricsIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M4 5h16v11H8l-4 4V5Zm5 5h.01M15 10h.01" />
export const ChordsIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M4 20V4h16v16H4Zm5-16v16m6-16v16M4 9h16" />
export const SectionsIcon = (p: { className?: string }): React.ReactElement => <Svg {...p} d="M4 12a4 4 0 0 1 4-4h12m-4-4 4 4-4 4M20 12a4 4 0 0 1-4 4H4m4 4-4-4 4-4" />
