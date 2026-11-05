# Testes de áudio (metrônomo e pad)
Renderizam o metrônomo e o pad num AudioContext offline e medem o que sai em cada canal.
Cobrem: lado L, L+R e R no PAN L/R, trocar o lado com o som tocando, pan sem o PAN L/R, o botão "BPM da música" (acompanhar, desligar ao mexer no BPM) e o TAP.
Rodar: `source ~/.nvm/nvm.sh && nvm use 24 && node scripts/audio-tests/run.cjs` (saída 0 = tudo ok).
Precisa de um Chromium e do puppeteer-core (`CHROME` e `PUPPETEER_CORE` trocam os caminhos).
