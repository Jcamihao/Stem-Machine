import { useEffect, useState } from 'react'

// o PAN L/R (saída dividida) vem das configurações; os painéis do pad e do metrônomo mostram o lado só quando ele está ligado
export function useOutputSplit(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    void window.stemkit.getSettings().then((s) => setOn(!!s.outputSplit))
    return window.stemkit.onSettingsChange((s) => setOn(!!s.outputSplit))
  }, [])
  return on
}
