# Testes do servidor do celular (fase 1 + adicionar músicas)
Rodar: `source ~/.nvm/nvm.sh && nvm use 24 && node scripts/remote-tests/server/run.cjs` (a partir da raiz do repo).
O `run.cjs` empacota o servidor com esbuild para o tmp do sistema (nada entra no repo) e roda `node --test` em `*.test.cjs`.
`remote.ts` (cola) roda com um stub de `electron` (`stub-electron.cjs`); só o IPC/pipeline reais do Electron ficam sem teste.
Duração: ~1 min (há envios lentos de 30 MB e a espera real de 10 s do corte de pedido incompleto).
