# Passagem de bastão: Stem-Machine

Documento para um agente de código (Codex) continuar o projeto. Escrito em 2026-11-04 a partir do estado real do repositório, do `docs/ROADMAP.md` e do histórico do trabalho. Onde algo não foi verificado, está dito.

## 1. Quem é o dono e como ele quer ser atendido

- **João Marcos**, músico e desenvolvedor fullstack (Angular/NestJS), mora no Brasil. O Stem-Machine é **uso pessoal**: não vender, não competir, nada de telemetria nem atualização automática do autor original.
- Tem TDAH. Isso muda o jeito de responder, e ele pediu isso explicitamente:
  - **Português do Brasil**, curto, objetivo, passos pequenos. Dê uma **recomendação clara** (não só opções) e explique o **porquê**.
  - **Todo fechamento de resposta** traz, nesta ordem: **Lista** (as pendências numeradas, vindas do `docs/ROADMAP.md`), **Recomendação** (uma, com o motivo) e **Próximo passo** (um só).
  - Ao terminar uma feature, explique **como usar, o que foi adicionado e como funciona**, antes do fechamento.
  - Separe sempre o que foi **verificado** (rodou, leu, testou) do que foi **presumido**.
- **Design antes de código** em feature nova: apresente um design curto no chat e espere um "pode". Só proponha o próximo passo, não o inicie sozinho.
- **Commits separados e claros** a cada etapa, versão semântica no `package.json` e `package-lock.json` e registro no `CHANGELOG.md`. **Não faça `push` sem pedido.**
- Ao reportar progresso, **reconheça o avanço de forma concreta**, não genérica.

## 2. Estado do repositório AGORA (leia antes de mexer em qualquer arquivo)

Repositório: `git@github.com:Jcamihao/Stem-Machine.git` (privado), local em `/home/caminhao/codeStage/stem-machine` (WSL2).

**Há trabalho em duas frentes que ainda não foi reconciliado:**

1. **`origin/main` está 3 commits à frente do local** (o local é ancestral dele, então dá fast-forward):
   - `97ad1af` Redesign das telas: tema escuro de estúdio (v2): tokens de tema, fontes Manrope e JetBrains Mono locais, Biblioteca com barra lateral, Player com faixas de 80 px, painéis em pílula, página do celular recolorida.
   - `eb22a93` Celular: mixer com volume, mudo e solo de cada faixa (comandos novos `stemVolume`, `stemMute`, `stemSolo`; o estado publicado ao celular ganha a lista de faixas).
   - `3e4c743` Merge do PR #1 (feito pelo dono).
2. **A árvore local tem alterações NÃO commitadas** (versão **0.10.2**), feitas depois do último commit local (`312dacb`, 2026-10-31):
   - Metrônomo avulso (BPM manual 30–300, **TAP tempo**, pan próprio) e pan do pad, no PC e no celular: arquivos novos `src/renderer/src/components/QuickControls.tsx` e `src/renderer/src/lib/metronome.ts`.
   - Controles rápidos sem música aberta (pad, metrônomo, **PAN L/R**) no celular e no PC.
   - Documentação reescrita: `README.md`, `SECURITY.md`, `CHANGELOG.md` (novo), `docs/DEVELOPMENT.md` e `docs/INSTALL.md` (novos), `docs/ROADMAP.md` reescrito.
   - **Eu (Claude) não revisei esse código.** Vi só o estatístico do diff e o CHANGELOG. Audite antes de confiar.
3. **12 arquivos foram mexidos nos dois lados** (vão conflitar): `package.json`, `package-lock.json`, `src/main/remote.ts`, `src/main/remote/page.html`, `src/renderer/src/App.tsx`, `src/renderer/src/components/{Library,PadButton,Player}.tsx`, `src/renderer/src/components/studio/StudioHeader.tsx`, `src/renderer/src/lib/{commands,remote}.ts`, `src/shared/remote.ts`.

**Procedimento recomendado (confirme com o dono antes de rodar, porque mexe em trabalho que não é seu):**
1. `git status` e `npm run typecheck` no estado atual. Se passar, commite o trabalho local numa **branch** (`wip/controles-rapidos`), em commits lógicos (documentação, metrônomo/TAP/pan, PAN L/R). Nada de `reset --hard`, `checkout .`, `stash drop` ou `clean`.
2. `git fetch` e leve `main` para `origin/main` com `git merge --ff-only origin/main`.
3. Faça o merge da branch em `main` e resolva os 12 conflitos **preservando as duas features**: o redesign decide a **aparência** (tokens, componentes de estúdio); os controles rápidos decidem o **comportamento** novo, que precisa adotar os tokens do redesign.
4. Depois do merge: `npm run typecheck`, `npm run build`, `node scripts/remote-tests/server/run.cjs` (54 testes) e `node scripts/remote-tests/page/page.test.cjs` (98 verificações). Os dois lados mexeram no estado publicado ao celular e na página: **reexecute as suítes** e confira se os comandos novos dos dois lados (`stemVolume/Mute/Solo` e os do metrônomo) validam no servidor.
5. Escolha a versão do merge (sugestão: 0.11.0), atualize `package.json`, `package-lock.json` e `CHANGELOG.md`.
6. **Não faça `push`**: peça ao dono.

## 3. O que o app é

App desktop Electron para músico: separa faixas (stems) de uma música e oferece um "estúdio" para tocar junto (multitrack com click, guia de voz, pad, loop, tom e velocidade). Fork pessoal do StemKit (MIT, danielravina/stemkit), hoje independente.

- **Stack:** Electron 33 + React + TypeScript + Tailwind (electron-vite, electron-builder). Python em processos filhos, dentro de um venv do app.
- **Instalado no Windows do dono em** `C:\Users\johnm\OneDrive\Documentos\Stem-Machine` (pasta portátil, atalho no Menu Iniciar). **Dados em** `%APPDATA%\Stem-Machine` (`songs/`, `library.json`, `settings.json`, `scenes.json`, `models/`, `venv/`, `sections-lib/`, `chords-lib/`, `pads/`, `voice/`, `uploads/` temporária).
- **Máquina:** WSL2 sobre Windows 11, RTX 5060 de 8 GB (a separação usa a GPU). O terminal do WSL tem `ELECTRON_RUN_AS_NODE=1` definido: ao abrir o Electron use `env -u ELECTRON_RUN_AS_NODE`.
- **Motores:** separação Demucs/RoFormer; batidas `beat_this` com DBN (`python/beats.py`); seções `all-in-one-infer` (`python/sections.py`); acordes da rede ISMIR 2019 de music-x-lab (`python/chords.py`, `python/vendor/chordrec`); tom e velocidade em tempo real com Signalsmith Stretch (WASM em AudioWorklet); guia de voz com o TTS do Windows (Maria).
- **Áudio:** motor Web Audio em `src/renderer/src/lib/engine.ts`. Por faixa: volume → EQ de 3 bandas → pan → barramento de música ou de "cue" (click e guia). Modo **PAN L/R** põe click e guia no canal L e música (e pad) no R. O salto de parte é agendado no relógio do áudio (`engine.scheduleJump`, cai exato no "1" do compasso).
- **Canal único de comandos:** `src/renderer/src/lib/commands.ts` (`runCommand`, `registerCommandHandler`). Teclado, MIDI e celular chamam os mesmos comandos. O `Player.tsx` é o hub grande (estado, mixagem, atalhos).

## 4. O que já foi feito (resumo; detalhes e datas em `CHANGELOG.md` e no git)

- Separação local, busca/links do YouTube, importação de áudio; adicionar faixa depois sem reenviar a música.
- Player: mixagem por faixa, EQ, pan, solo, mute, velocidade e transposição em tempo real, exportação WAV/AAC, **mixagem salva por música** (`mix.json`).
- Click inteligente (batidas e "1" do compasso detectados), loop A–B, seções automáticas e editáveis (mover limite, dividir, juntar, remover, renomear entre 9 nomes fixos), acordes, tom da música, guia de voz (Maria) que chama a parte 2 compassos antes e conta no tempo.
- **Pad** sintetizado ou importado (transposição por velocidade de leitura, detecção do tom do arquivo pelo nome ou pelo áudio), pad automático entre músicas.
- **Troca de parte na virada do compasso**, loop da parte atual pelo celular/MIDI.
- **Setlist** (antes "Cenas"): "Setlist de hoje", busca, duplicar, arrastar, tom/BPM/duração por linha, total, gaveta ao vivo no player, "Próxima: título · tom · BPM", avanço automático opcional. **S4 (setlist no celular) já está marcado como concluído** no ROADMAP local.
- **Controle MIDI** com aprendizagem de teclas (Web MIDI, sem driver).
- **Controle pelo celular** (servidor HTTP na rede local, desligado por padrão, PIN de 6 dígitos): partes, transporte, tom, BPM, click, loop, pad com volume, cenas, biblioteca, **adicionar músicas** (link do YouTube e envio de arquivo até 500 MB, com fila, progresso e cancelar) e, no `origin`, mixer por faixa.
- Segurança do servidor do celular (não enfraqueça): PIN comparado em tempo constante e bloqueio por IP, token só na memória, `Host` só como IP/localhost (contra DNS rebinding), corpo JSON máximo 4 KB, 30 comandos/s por token, upload em stream para pasta aleatória com `wx`, nome limpo, extensão de áudio, 500 MB, CSP na página. Testes em `scripts/remote-tests/`.

## 5. O que falta (fonte de verdade: `docs/ROADMAP.md`)

Ordem de prioridade do dono:

1. **S5: tom específico por música dentro de um setlist** (P). Proposta de design (o dono **ainda não aprovou**; apresente e espere o "pode"):
   - `Scene` ganha `keys?: (number | null)[]`, um array **paralelo** a `songs` com a diferença em semitons daquele setlist; `null` ou ausente = usa o tom salvo na mixagem da música. Setlist antigo continua valendo.
   - `moveSong`, `removeSong`, `moveTo`, duplicar e a limpeza em `src/main/scenes.ts` precisam manter os dois arrays alinhados (testes unitários).
   - Cada linha do painel ganha Tom −/+ mostrando "Gm → Am". `library:meta` precisa devolver a tônica e o modo (hoje só `key` e `keyShift` como texto).
   - Abrir uma música **pelo setlist** (Tocar, ◀ ▶, gaveta, celular) aplica o tom do setlist **depois** de restaurar a mixagem salva, sem apagá-la. Mudar o tom no player **dentro de um setlist** grava naquela linha (e na mixagem, como hoje). O pad entre músicas usa o tom do setlist (`song:padkey` recebe os semitons).
   - Decisão pendente do dono: o tom do setlist **vence** sempre (recomendado) ou o tom salvo da música vence.
2. **SE1: parte personalizada** (M): nome livre, cor escolhida, criar do zero marcando início e fim na barra. Hoje `SECTION_LABELS` (`SectionBar.tsx`) tem 9 nomes fixos; um rótulo desconhecido já renderiza cinza com o próprio texto. Edições em `src/renderer/src/lib/edits.ts`.
3. **SE2: nomes livres em tudo** (P, depende de SE1): celular, MIDI ("ir para o próximo refrão" usa o rótulo-chave, `goToNext`) e setlist precisam aceitar o nome personalizado. O catálogo do MIDI está em `src/shared/midi.ts` (`SECTION_NAMES`).
4. **Guia com a sua voz: gravar as 13 palavras no app** (M). As palavras estão em `GUIDE_WORDS` (`src/main/voice.ts`): intro, verse "Verso", prechorus "Pré refrão", chorus "Refrão", bridge "Ponte", solo "Solo", inst "Instrumental", break "Pausa", outro "Final", c1..c4 "Um, Dois, Três, Quatro". Hoje gera WAVs com a Maria em `%APPDATA%\Stem-Machine\voice\maria`. Plano: botão guiado ("Diga: Verso") grava cada palavra, salva em `voice/custom`, escolha "Maria × Minha voz", e passa pela **mesma cadeia** de `src/renderer/src/lib/guide.ts` (saturação `tanh`, normalização, `fitToLength` que comprime para caber no tempo sem mudar o tom). O dono já deu uma amostra de voz e o clone por IA (Chatterbox) ficou **robótico**: está descartado.
5. **SE3** guia para partes personalizadas (M, depende de SE1 e da gravação); **SE4** melhorar a detecção de seções e aprender com as correções (G, investigar); **log de correções** para treino (M).
6. **Depois:** cifra colada que transpõe; arranjos (reordenar, repetir, cortar partes, salvar versões); preferências aprendidas; filtros e gênero na biblioteca; letra; pacote para um amigo (Windows + NVIDIA); áudio→MIDI; saídas separadas por faixa (ASIO, provavelmente fora); app iOS nativo (só se o navegador não bastar).

### Validação em campo pendente (ninguém testou de verdade)

- Download real de um link do YouTube **pelo celular** (só se testaram as respostas e o caso "já existe").
- Envio de arquivo pelo **Safari do iPhone/iPad** (seletor de arquivos do iOS, tela apagando no meio do envio).
- **Controle MIDI com hardware** de verdade.
- Acordes, troca de partes, setlist e PAN L/R **com áudio real**: todos os testes automáticos rodaram mudos.
- O código não commitado da seção 2 e o merge com o redesign.

## 6. Como trabalhar neste repositório

**Ambiente:** Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`; o padrão do nvm é o 20). `npm install` pode precisar de `npm rebuild electron esbuild` (o npm 11 bloqueia os postinstall).

**Verificação:** `npm run typecheck`; `npm run build`; `node scripts/remote-tests/server/run.cjs`; `node scripts/remote-tests/page/page.test.cjs`. **Os testes novos devem ficar no repositório**: pastas temporárias somem entre sessões e já se perderam testes por isso.

**Build e instalação local no Windows do dono** (o que fiz, e que o `docs/DEVELOPMENT.md` descreve de forma equivalente):
`env -u ELECTRON_RUN_AS_NODE npx electron-vite build && env -u ELECTRON_RUN_AS_NODE npx electron-builder --win dir -c.win.signAndEditExecutable=false` e depois `cp -r release/win-unpacked/. "/mnt/c/Users/johnm/OneDrive/Documentos/Stem-Machine/"`.

**Teste no app real sem atrapalhar o desktop:** abra o app com `STEM_MACHINE_HIDDEN=1` (janela fora da tela, sem foco), `--remote-debugging-port=9230 --mute-audio`, e dirija pela página com CDP usando o próprio `Stem-Machine.exe` como Node (`ELECTRON_RUN_AS_NODE=1 --experimental-websocket script.mjs`). Captura de tela funciona com a janela fora da tela. Páginas do celular podem ser testadas em Chromium headless (`~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, driver `puppeteer-core` em `/home/caminhao/codeStage/PraiseApp/node_modules`), e o WSL alcança o servidor do celular pelo IP da rede (ex.: `192.168.1.13:8787`).

### Regras de segurança dos testes (aprendidas com erros reais)

- **Nunca feche o Stem-Machine pelo nome.** O app do dono pode estar aberto, com o iPhone conectado na porta 8787. Antes de instalar ou testar, confira: `Get-CimInstance Win32_Process -Filter "Name='Stem-Machine.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' }` e `Get-NetTCPConnection -LocalPort 8787`. **Não instale por cima de um app aberto**: peça ao dono para fechar e esperar o "fechei".
- Feche **só a sua instância de teste**, identificada por `-cmatch 'remote-debugging-port'` (com `-cmatch`, porque `-match` é case-insensitive e casa "Stem" no caminho), e use `taskkill /PID <pid> /T /F`.
- **O app de teste compartilha `%APPDATA%\Stem-Machine` com o app do dono.** Já aconteceu de o app de teste, ao ler `remoteEnabled: true` das configurações, subir o servidor e ocupar a porta 8787 antes do app dele ("porta em uso"). Faça **backup de `settings.json`, `scenes.json` e `library.json` antes** e **restaure depois**, deixe `remoteEnabled` como estava (padrão: desligado), apague músicas de teste (`window.stemkit.deleteSong`) e confira a pasta `songs/` e o `library.json` byte a byte.
- Se o teste adicionar músicas de verdade (envio ou link), apague-as no fim. Considere usar `--user-data-dir` próprio para testes que não precisem da biblioteca real.
- Não injete teclado/mouse/captura de tela global no Windows do dono (já interferiu em outro programa dele). Teste por dentro do app.
- **Não decompile nem copie o Trilha** (app concorrente freeware; a licença proíbe descompilar). Só informação pública (página, licença, arquivos instalados) é permitida.

## 7. Decisões já tomadas (não reabrir sem motivo)

- **Não perseguir 12 stems:** não há modelo aberto confiável para violão×guitarra, solo×base, teclado×piano. Só existem abertos: voz principal×backing (Mel-RoFormer Karaoke) e peças da bateria (DrumSep).
- **Sem GPU em nuvem** (AWS, Colab): a RTX local resolve sem custo; o YouTube bloqueia downloads a partir de servidores.
- **Sem app iOS nativo por enquanto:** o controle pelo navegador cobre o uso ao vivo sem Apple ID, sem expiração de 7 dias e sem xtool.
- **Guia de voz:** gravar a própria voz, não clonar por IA.
- **BS-RoFormer SW** foi testado e **não adotado** (o dono ouviu chimbal vazando na guitarra).
- O ambiente de voz do experimento (`~/.cache/stemmachine-voice`, cerca de 3 GB) pode ser apagado a pedido do dono.

## 8. Armadilhas técnicas conhecidas

- Os motores em Python ficam em pastas isoladas (`pip --target --no-deps`) com versões fixas: não misture o PyTorch 2.7 do app com o 2.6 de experimentos.
- Play/Espaço é ignorado enquanto as faixas ainda decodificam; hoje o pedido fica numa fila (`playWhenReadyRef`) e o estado publicado ao celular traz `loading`.
- O estado `RemoteState` é remontado campo a campo em `src/main/remote.ts` (`cleanState`): ao acrescentar campo, atualize **tipo compartilhado, `cleanState`, publicador do renderer e página**.
- Strings de teste dentro de template literals do JavaScript perdem o `\s` (vira `s`): use `String.raw` ou arquivos.
- Botões da faixa de acordes têm o mesmo `title` que os de seção: selecione pelo trecho exclusivo.
