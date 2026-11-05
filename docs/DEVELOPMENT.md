# Desenvolvimento e entrega

## Ambiente

- Node.js 24 ou superior.
- `npm install` para dependências de desenvolvimento.
- A build empacotada traz ffmpeg. Em um checkout, os comandos que executam ou empacotam o app baixam o binário automaticamente quando necessário.

```bash
npm install
npm run dev
```

## Verificação

```bash
npm run typecheck       # TypeScript: main e renderer
npm run build           # bundles Electron/Vite, sem instalador
```

Os testes do controle remoto ficam em `scripts/remote-tests/`:

```bash
node scripts/remote-tests/server/run.cjs
node scripts/remote-tests/page/page.test.cjs
```

Esses testes requerem Node 24 e as dependências indicadas nos READMEs das respectivas pastas.

## Versão e changelog

1. Atualize `version` em `package.json` e no topo de `package-lock.json`.
2. Registre a entrega em [CHANGELOG.md](../CHANGELOG.md).
3. Atualize [README.md](../README.md) e [ROADMAP.md](ROADMAP.md) se a mudança afetar recursos, requisitos, uso ou estado do produto.

Use versão semântica: correção em `x.y.Z`, recurso compatível em `x.Y.0` e mudança incompatível em `X.0.0`.

## Empacotar

Rode no sistema operacional para o qual o pacote será distribuído:

```bash
npm run dist        # macOS: DMG + ZIP
npm run dist:win    # Windows: NSIS + ZIP
npm run dist:linux  # Linux: AppImage + DEB
```

Os pacotes saem em `release/`. O comando busca o ffmpeg da plataforma se ele ainda não existir em `extras/`.

## Encerramento obrigatório de uma alteração

1. Rode `npm run typecheck`.
2. Gere o instalador da plataforma atual.
3. Instale a build recém-gerada conforme [INSTALL.md](INSTALL.md).
4. Abra a build instalada e faça uma verificação proporcional à alteração.
5. Relate o artefato gerado, a instalação e o que foi validado.

No Linux sem `sudo`, a instalação em `~/.local/opt/Stem-Machine` é aceita para validação local; o pacote `.deb` continua sendo o artefato distribuível.
