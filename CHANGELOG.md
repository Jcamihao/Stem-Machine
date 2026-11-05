# Histórico de versões

## 0.12.0 — 2026-11-05

- **Metrônomo independente da música:** abrir ou trocar de música não para mais o metrônomo nem muda o BPM dele.
- **Botão "BPM da música":** com uma música com batidas aberta, o metrônomo adota o BPM dela e acompanha mudanças de velocidade. Mexer no BPM ou no TAP desliga o acompanhamento.
- **TAP no celular:** o tempo é medido no próprio celular (sem o atraso da rede) e só o BPM final vai ao PC.
- **Lado do pad e do metrônomo no PAN L/R:** cada um escolhe L, L+R ou R; com o PAN L/R desligado vale o pan de cada um. No celular os sliders de pan ficam desativados enquanto o PAN L/R está ligado.
- Testes novos: `scripts/audio-tests/` (roteamento de canais e lógica do follow/TAP) e casos de servidor para os comandos novos. Limite inferior do teste de envio lento corrigido (era instável).

## 0.11.0 — 2026-11-04

- **Redesign das telas, tema escuro de estúdio (v2):** barra lateral na biblioteca, faixas de 80 px no player, painéis em pílula, fontes Manrope e JetBrains Mono locais, página do celular recolorida.
- **Mixer por faixa no celular:** volume, mudo e solo de cada faixa (metrônomo e guia vão até 200%).
- Junta o redesign e o mixer com os controles rápidos da 0.10.x (metrônomo avulso com TAP, pan do pad e do metrônomo, PAN L/R). Os comandos do celular dos dois lados valem juntos.

## 0.10.2 — 2026-11-01

- Metrônomo agora tem BPM manual (30–300), **TAP tempo** por média dos últimos toques e pan próprio, persistidos entre aberturas.
- Pad agora tem pan próprio, também persistido.
- Os controles estão no PC e no celular, dentro dos painéis de Metrônomo e Pad.
- **PAN L/R** continua sendo um modo de saída prioritário: nele metrônomo/guia vão para L e pad/música para R, ignorando os pans individuais.

## 0.10.1 — 2026-11-01

- Controle remoto ganhou controles rápidos disponíveis sem música aberta: pad, metrônomo avulso e PAN L/R.
- O PC passou a expor os mesmos controles na biblioteca e no player.
- O metrônomo avulso conserva o último BPM conhecido e inicia em 120 BPM.
- Documentação reescrita: apresentação, requisitos, instalação, uso, build, entrega e privacidade.

## 0.10.0 — 2026-10-31

- Adicionar músicas pelo celular: link do YouTube, envio de arquivo, fila, progresso, erro e cancelamento.

## 0.9.0 — 2026-10-31

- Setlists: montagem, cópia, ordenação, gaveta de modo ao vivo e transição com pad.

Versões anteriores estão resumidas no [roadmap](docs/ROADMAP.md).
