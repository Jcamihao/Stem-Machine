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
| 7 | Controle MIDI (aprender tecla, mapa de ações, "próximo refrão") | M | **feito** (v0.7.0; falta testar com um controlador de verdade) |
| 4 | Controle pelo celular no navegador (rede local, PIN, partes, play, tom, BPM, pad, cenas) | G | **feito** (v0.8.0; falta testar no Safari do iPhone e do iPad) |
| 5 | Guia com a sua voz: **gravar as 13 palavras dentro do app** (o clone por IA ficou robótico e foi descartado) | M | a fazer |

## Setlist do dia (pedido em 2026-10-31)

Evolução das cenas: montar o setlist do dia e transitar entre as músicas sem passar pela biblioteca. Proposta inicial, a detalhar antes de implementar.

| # | Item | Esforço |
|---|------|---------|
| S1 | **Montar rápido:** buscar na biblioteca, duplicar o setlist de outro dia, ordenar | M | **feito** (v0.9.0) |
| S2 | **Modo ao vivo:** tela com o setlist inteiro, música atual e próxima em destaque, pular para qualquer uma com um toque | M | **feito** (v0.9.0, gaveta no player) |
| S3 | **Transição contínua:** emendar uma música na outra com o pad (item 6), tom da próxima visível | M | **feito** (pad entre músicas + "Próxima: título · tom · BPM") |
| S4 | **Setlist no celular:** lista e pulo de música pelo controle remoto (depende do item 4) | M |
| S5 | **Tom por música dentro do setlist** (hoje o tom vem da mixagem salva da música) | P |

Ordem sugerida: S1 e S2 logo depois do item 4; S3 junto com o 6 já feito; S4 com o item 4; S5 por último.

## Seções: detecção e partes personalizadas (pedido em 2026-10-31)

Hoje: o app detecta as partes sozinho (modelo all-in-one) e você pode mover o limite, dividir, juntar, remover e renomear, mas só entre 9 nomes fixos. Dois problemas: a detecção erra em algumas músicas, e não dá para criar uma parte com nome próprio ("Tag", "Vamp", "Refrão 2x"). Proposta inicial, a detalhar antes de implementar.

| # | Item | Esforço |
|---|------|---------|
| SE1 | **Parte personalizada:** nome livre e cor escolhida por você (hoje só os 9 nomes fixos); criar do zero marcando início e fim na barra | M |
| SE2 | **Nomes livres funcionando em tudo:** celular, MIDI ("próximo refrão" usa o nome-chave) e setlist precisam aceitar o nome personalizado | P |
| SE3 | **Guia de voz com o nome da parte personalizada** (a guia só tem as 13 palavras fixas; precisa gerar a voz do nome, ou falar "parte N"). Depende do item "guia com a sua voz" | M |
| SE4 | **Melhorar a detecção automática:** medir onde erra (comparando com as suas correções), testar ajustes e alternativas (acordes e repetição da música) e **aprender com o que você corrige** (junta com o log de correções) | G, a investigar |

Ordem sugerida: SE1 e SE2 primeiro (resolvem o dia a dia sem esperar a detecção ficar perfeita); SE4 depois, com os dados das suas correções.

## Celular: adicionar músicas (pedido em 2026-10-31)

Hoje o celular só controla o que já está na biblioteca. Pedido: colocar links do YouTube e arquivos de áudio direto pelo celular, e a separação roda no PC. Proposta inicial, a detalhar antes de implementar.

| # | Item | Esforço |
|---|------|---------|
| CA1 | **Link do YouTube pelo celular:** colar o link na página, o PC baixa e separa | M |
| CA2 | **Arquivo de áudio pelo celular:** enviar do iPhone (Arquivos, Gravador, iCloud) para o PC, com barra de progresso | M |
| CA3 | **Fila e progresso no celular:** "na fila", baixando, separando %, concluída, erro e cancelar; a música nova aparece na aba Músicas | M |

Depende do item 4 (controle pelo celular, feito). Faz sentido junto com o S4.

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
