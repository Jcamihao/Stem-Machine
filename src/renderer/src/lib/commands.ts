// canal único de comandos: teclado, (depois) celular e MIDI chamam o mesmo caminho.
// Quem sabe executar (o player aberto, o pad) registra um handler; o primeiro que
// devolver true "pegou" o comando. Handlers mais novos têm prioridade
export type Command =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'seek'; time: number }
  | { type: 'goToSection'; index: number }
  | { type: 'loopSection'; index: number }
  | { type: 'semitones'; delta: number }
  | { type: 'bpm'; delta: number }
  | { type: 'click' }
  | { type: 'metronomeToggle' } // metrônomo avulso, inclusive com música aberta
  | { type: 'loop' } // liga/desliga o loop A–B
  | { type: 'goToNext'; label: string } // próxima parte com esse nome (ex.: 'chorus') depois da posição atual
  | { type: 'pad'; key?: number } // sem nota: liga/desliga o pad
  | { type: 'padVolume'; value: number } // volume do pad, 0..1
  | { type: 'stemVolume'; id: string; value: number } // volume de uma faixa (celular)
  | { type: 'stemMute'; id: string }
  | { type: 'stemSolo'; id: string }
  | { type: 'padPan'; value: number } // -1 L ... 1 R
  | { type: 'metronomeBpm'; value: number }
  | { type: 'metronomeTap' }
  | { type: 'metronomePan'; value: number }
  | { type: 'outputSplit' } // click/guia no L, música no R
  | { type: 'nextSong' }
  | { type: 'prevSong' }
  | { type: 'openSong'; id: string } // abre uma música da biblioteca (celular)
  | { type: 'openScene'; id: string } // toca uma cena desde a primeira música (celular)

export type CommandHandler = (command: Command) => boolean | void

const handlers: CommandHandler[] = []

export function registerCommandHandler(handler: CommandHandler): () => void {
  handlers.push(handler)
  return () => {
    const i = handlers.lastIndexOf(handler)
    if (i >= 0) handlers.splice(i, 1)
  }
}

// true se alguém executou
export function runCommand(command: Command): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i](command) === true) return true
  }
  return false
}
