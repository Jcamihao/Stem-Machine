// próximo "1" do compasso (virada do compasso) a partir de t, com folga mínima para
// dar tempo de agendar o salto no relógio do áudio. null = não há mais compassos
export function nextDownbeat(downbeats: number[], t: number, minLead = 0.08): number | null {
  return downbeats.find((d) => d >= t + minLead) ?? null
}
