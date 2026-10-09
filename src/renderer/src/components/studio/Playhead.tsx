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
    <div ref={ref} className="absolute top-0 bottom-0 w-px bg-white pointer-events-none z-10">
      <div className="absolute -top-0.5 -translate-x-1/2 left-0 w-3.5 h-4 bg-white [clip-path:polygon(0_0,100%_0,100%_65%,50%_100%,0_65%)]" />
    </div>
  )
}
