import type { OutputSide } from '../../../shared/remote'

const OPTIONS: { value: OutputSide; label: string; title: string }[] = [
  { value: 'left', label: 'L', title: 'Só no canal esquerdo' },
  { value: 'both', label: 'L+R', title: 'Nos dois canais' },
  { value: 'right', label: 'R', title: 'Só no canal direito' }
]

// escolha do lado no PAN L/R: o pan não vale nesse modo, vale o lado de cada fonte
export function SideSelect({ value, onChange }: { value: OutputSide; onChange: (side: OutputSide) => void }): React.ReactElement {
  return (
    <span className="flex-1 flex rounded-full bg-white/10 p-[3px]" role="radiogroup" aria-label="Lado no PAN L/R">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`no-drag flex-1 h-6 rounded-full text-[11px] font-bold ${value === o.value ? 'bg-amber-300 text-black' : 'text-white/70 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}
