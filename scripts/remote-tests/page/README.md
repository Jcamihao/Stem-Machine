# Teste da página do celular (`src/main/remote/page.html`)
Servidor falso do contrato inteiro (fase 1 + adicionar músicas): `fake-server.cjs` (upload recebe os bytes de verdade, atrasos configuráveis).
Teste: `page.test.cjs`, Chromium headless via puppeteer-core (PraiseApp/node_modules) contra o servidor falso; cobre PIN, Tocar/Cenas/Músicas (regressão), link, upload, erros, jobs, XSS, layout, e (seção 7b) BPM da música, TAP medido no celular (relógio da página congelado), lados L | L+R | R com PAN L/R, capturas `metro-*` e checagem de sintaxe iOS 12+.
Rodar: `source ~/.nvm/nvm.sh && nvm use 24 && node scripts/remote-tests/page/page.test.cjs` (saída 0 = tudo ok).
Variáveis: `SHOTS=<pasta>` capturas (390x844, 844x390, 820x1180, 1180x820), `WORK=<pasta>` arquivos de teste (20 MB, sparse de 501 MB), `CHROME=<caminho>`.
Servidor falso solto: `node scripts/remote-tests/page/fake-server.cjs` (PIN 123456) (só 127.0.0.1) e abra a URL no navegador.
