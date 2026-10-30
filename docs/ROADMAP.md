# Stem-Machine: plano

Fonte única do que falta. Ordem = importância (bases primeiro). Estimativa de esforço: P (pequeno), M (médio), G (grande), palpite, não medido.

## Feito

- Loop A–B, click inteligente, adicionar faixa depois, seções, acordes, tom da música
- Guia de voz (Maria), saída L/R, velocidade e tom em tempo real, EQ e pan por faixa
- Pad contínuo (sintetizado ou importado, com detecção do tom), mixagem salva por música
- **Bloco A (bases):** camada de comandos, troca de parte na virada do compasso, cenas (setlist básico)

## Bloco B: em andamento

| # | Item | Esforço | Estado |
|---|------|---------|--------|
| 6 | Pad automático entre músicas (numa cena, entra no tom da próxima e some no play) | P | **feito** (v0.6.0) |
| 7 | Controle MIDI (aprender tecla, mapa de ações, "próximo refrão") | M | a fazer |
| 4 | Controle pelo celular no navegador (rede local, PIN, partes, play, tom, BPM, pad, cenas) | G | a fazer |
| 5 | Guia com a sua voz: **gravar as 13 palavras dentro do app** (o clone por IA ficou robótico e foi descartado) | M | a fazer |

## Setlist do dia (pedido em 2026-10-31)

Evolução das cenas: montar o setlist do dia e transitar entre as músicas sem passar pela biblioteca. Proposta inicial, a detalhar antes de implementar.

| # | Item | Esforço |
|---|------|---------|
| S1 | **Montar rápido:** buscar na biblioteca, duplicar o setlist de outro dia, ordenar | M |
| S2 | **Modo ao vivo:** tela com o setlist inteiro, música atual e próxima em destaque, pular para qualquer uma com um toque | M |
| S3 | **Transição contínua:** emendar uma música na outra com o pad (item 6), tom da próxima visível | M |
| S4 | **Setlist no celular:** lista e pulo de música pelo controle remoto (depende do item 4) | M |
| S5 | **Tom por música dentro do setlist** (hoje o tom vem da mixagem salva da música) | P |

Ordem sugerida: S1 e S2 logo depois do item 4; S3 junto com o 6 já feito; S4 com o item 4; S5 por último.

## Depois

| # | Item | Esforço |
|---|------|---------|
| 8 | Metrônomo avulso com tap tempo | P |
| 9 | Cifra colada (transpõe com a música) | P–M |
| 10 | Arranjos (reordenar, repetir, cortar partes; salvar versões) | G |
| 11 | Preferências aprendidas | M |
| 12 | Filtros e gênero na biblioteca | P |
| 13 | Letra | G |
| 14 | Log das correções para treino | M |
| 15 | Pacote instalável para o amigo (Windows + NVIDIA) | M |
| 16 | Áudio para MIDI | G |
| 17 | Saídas separadas por faixa (exige ASIO, provável que fique fora) | G |
| 18 | App nativo iOS com xtool (só se o controle pelo celular não bastar) | G |

## Descartado

- 12 stems (sem modelo aberto bom para violão×guitarra, solo×base, teclado×piano).
- GPU na nuvem (AWS, Colab): o PC resolve de graça.
- Guia na voz clonada por IA (Chatterbox): soou robótica.

## Para você validar

- Precisão dos acordes pelo ouvido.
- Troca de parte e cenas no som real (os testes rodaram mudos).
