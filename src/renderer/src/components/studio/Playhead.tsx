import { useEffect, useRef } from 'react'

interface Props {
  duration: number
  getPosition: () => number
}

// linha da posição atual atravessando a régua e todas as faixas
export function Playhead({ duration, getPosition }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      if (ref.current && duration > 0) {
        ref.current.style.left = `${Math.min(100, (getPosition() / duration) * 100)}%`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, getPosition])
  return (
    <div ref={ref} className="absolute top-0 bottom-0 w-0.5 -ml-px bg-acc shadow-[0_0_12px_rgba(255,91,31,0.6)] pointer-events-none z-10">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-acc rounded-t-[3px] rounded-b-full" />
    </div>
  )
}
