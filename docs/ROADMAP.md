# Roadmap do Stem-Machine

Atualizado em **2026-11-05**, versão em desenvolvimento: **0.12.0**.

Esta é a fonte de verdade das pendências de produto. Estimativas são apenas referência: P (pequeno), M (médio) e G (grande).

## Entregue

- Separação local de stems, busca/links do YouTube e importação de áudio.
- Player com mixagem por faixa, EQ, pan, solo, mute, velocidade, transposição e exportação WAV/AAC.
- Batidas, click sincronizado, loop A–B, seções, acordes e guia de voz Maria.
- Pad sintetizado/importado, saída PAN L/R e mixagem persistida por música.
- Cenas/setlists, próxima música com tom/BPM e pad de transição.
- Controle MIDI com aprendizagem de teclas.
- Controle pelo celular com PIN na rede local, partes, transporte, tom, BPM, pad, metrônomo, PAN L/R, cenas e biblioteca.
- Setlist no celular: abrir cena, listar músicas e pular diretamente para uma faixa (**S4 concluído**).
- Adicionar músicas pelo celular: YouTube, upload de áudio até 500 MB, fila, progresso, erro e cancelamento.
- Redesign das telas, tema escuro de estúdio (v2), e mixer por faixa no celular (volume, mudo e solo).
- Controles rápidos no PC e no celular mesmo sem música aberta: metrônomo avulso com BPM manual, TAP tempo e pan; pad com pan; e PAN L/R.
- Metrônomo e pad independentes da música, TAP medido no celular, botão "BPM da música" (acompanha a velocidade) e lado L / L+R / R de cada um no PAN L/R, no PC e no celular.

## Prioridade atual

| Item | Esforço | Estado |
|---|---:|---|
| S5 — Tom específico por música dentro de um setlist, sem mudar a mixagem da biblioteca | P | a fazer |
| SE1 — Criar parte personalizada, com nome livre, cor e intervalo marcado na barra | M | a fazer |
| SE2 — Fazer nomes livres funcionarem no celular, MIDI e setlist | P | depende de SE1 |
| Guia com a sua voz — gravar no app as 13 palavras da guia | M | a fazer |

## Seções e detecção

| Item | Esforço | Estado |
|---|---:|---|
| SE3 — Guia de voz para partes com nome personalizado | M | depende de SE1 e da gravação da voz |
| SE4 — Melhorar detecção automática e aprender com correções | G | investigar depois de registrar correções |
| Log de correções para treino | M | a fazer |

## Depois

| Item | Esforço |
|---|---:|
| Cifra colada que transpõe com a música | P–M |
| Arranjos: reordenar, repetir, cortar partes e salvar versões | G |
| Preferências aprendidas | M |
| Filtros e gênero na biblioteca | P |
| Letra | G |
| Pacote para amigo: Windows + NVIDIA | M |
| Áudio para MIDI | G |
| Saídas separadas por faixa (ASIO; possivelmente fora de escopo) | G |
| App iOS nativo, somente se o controle pelo navegador não bastar | G |

## Validação em campo pendente

- Testar download real de link do YouTube pelo celular.
- Testar envio de arquivo pelo Safari no iPhone/iPad.
- Testar controle MIDI com um controlador físico.
- Validar acordes, troca de partes, cenas e PAN L/R em ensaio ou culto com áudio real.

## Decisões já tomadas

- Não perseguir 12 stems: não há modelo aberto confiável para as separações desejadas.
- Não usar GPU em nuvem: a execução local atende sem custo recorrente.
- Não usar clone de voz por IA para a guia: o resultado foi robótico; a direção é gravar a própria voz.
