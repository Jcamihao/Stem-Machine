# Stem-Machine

**Stem-Machine 0.10.2** é uma mini-DAW local para ensaio e palco. Ele baixa uma faixa do YouTube — ou recebe um arquivo de áudio —, separa os instrumentos em stems e permite tocar, estudar e controlar a música pelo PC ou pelo celular.

O processamento acontece no computador. Não há conta, chave de API, telemetria ou atualização automática neste fork. A primeira preparação requer internet para baixar o runtime Python e os modelos; depois, trabalhar com arquivos locais funciona sem conexão.

> Fork pessoal de [danielravina/stemkit](https://github.com/danielravina/stemkit), sob licença MIT. O aviso de copyright original está em [LICENSE](LICENSE). Este fork não recebe atualizações automáticas do projeto original.

![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS%20%7C%20Linux-18181b)
![Local](https://img.shields.io/badge/processamento-local-34d399)

<p align="center">
  <img src="docs/stemkit.png" alt="Stem-Machine: stems em faixas separadas, formas de onda e controles de mixagem" width="100%">
</p>

## O que ele faz

- Busca no YouTube, aceita links ou importa arquivos de áudio locais.
- Separa voz, bateria, baixo e outros; o modelo estendido também oferece piano e guitarra quando disponível.
- Toca stems sincronizados com volume, mute, solo, pan e EQ por faixa.
- Exporta uma faixa ou todas em WAV; AAC/M4A é opcional nas configurações.
- Detecta batidas, BPM, seções e acordes; seções e acordes podem ser corrigidos manualmente.
- Tem click sincronizado, loop A–B, mudança de tom e velocidade em tempo real e guia de voz das seções.
- Mantém um pad contínuo, sintetizado ou importado, com tom, volume, brilho, pan e transição configuráveis.
- Oferece saída **PAN L/R**: metrônomo e guia no canal esquerdo para o retorno; música em mono no direito para o PA.
- Permite criar cenas/setlists, reorganizar músicas, pular diretamente para uma faixa e preparar a próxima com tom e BPM visíveis.
- Aceita controladores MIDI com modo “Aprender”.
- Inclui controle remoto na rede local pelo celular: transporte, partes, tom, BPM, click, pad, PAN L/R, setlist, biblioteca e adicionar músicas por link ou arquivo.
- Mantém metrônomo avulso, pad e PAN L/R acessíveis no PC e no celular sem uma música aberta. O metrônomo tem BPM manual, TAP tempo e pan próprio; o pad também tem pan próprio. Em PAN L/R, a separação de canais tem prioridade sobre esses pans individuais.

## Requisitos

- **Windows:** Windows 10/11 64-bit.
- **macOS:** macOS 12 ou mais recente, Apple Silicon ou Intel 64-bit.
- **Linux:** distribuição 64-bit atual, como Ubuntu 22.04+.
- Espaço e internet na primeira preparação: aproximadamente **2 GB ou mais**, conforme os modelos escolhidos.
- GPU é opcional. NVIDIA é suportada no Windows/Linux; AMD/ROCm é experimental no Linux; no macOS o app usa MPS quando disponível ou CPU.

Não é necessário instalar Python, ffmpeg ou Node.js para usar uma versão instalada: o app prepara Python e modelos e já traz ffmpeg.

## Instalar e usar

Os instaladores ficam em `release/` quando a build é feita localmente, ou na release publicada.

### Windows

Execute `Stem-Machine-<versão>-Setup.exe`. Caso o SmartScreen apareça em uma build não assinada, use **Mais informações → Executar assim mesmo** somente se você confia na origem do instalador.

### macOS

Abra o `.dmg`, arraste o app para Aplicativos e execute-o. Em builds não notarizadas, o macOS pode exigir **Ajustes do Sistema → Privacidade e Segurança → Abrir assim mesmo**.

### Linux

```bash
# pacote do sistema (recomendado)
sudo apt install ./Stem-Machine-<versão>-linux-amd64.deb

# ou pacote portátil
chmod +x Stem-Machine-<versão>-linux-x86_64.AppImage
./Stem-Machine-<versão>-linux-x86_64.AppImage
```

Veja [docs/INSTALL.md](docs/INSTALL.md) para instalação sem `sudo`, atualização e validação.

Depois de instalar, abra o app e clique em **Get started**. A primeira preparação baixa os componentes necessários; mantenha o app aberto até ela terminar.

## Uso rápido

1. Na biblioteca, clique em **Adicionar** e pesquise/cole um link do YouTube, ou escolha um arquivo de áudio.
2. Aguarde download, conversão e separação. A música entrará na biblioteca.
3. Abra a música para controlar stems, click, tom, BPM, seções, acordes, loop e exportação.
4. Use **Setlist** para criar uma cena, ordenar as músicas e entrar no modo ao vivo.
5. Use os controles de **Metrônomo**, **Pad** e **PAN L/R** no cabeçalho; eles também funcionam sem música aberta.

### Controle pelo celular

1. No PC, abra **Celular** na biblioteca e ative o controle.
2. Abra no telefone um dos endereços mostrados ou escaneie o QR code.
3. Digite o PIN de seis dígitos.

PC e celular devem estar na mesma rede local. A página remota usa HTTP local e um PIN; não a exponha em Wi‑Fi público. Pelo celular também é possível enviar arquivos de áudio de até **500 MB** ou colar links do YouTube; o PC faz o processamento.

## Dados, privacidade e limites

- Biblioteca, stems, mixagens, pads, setlists, configurações e modelos ficam na pasta de dados do app no computador.
- O áudio não é enviado a um servidor do Stem-Machine. O download de um link do YouTube e os downloads iniciais de runtime/modelos naturalmente usam a internet.
- Não há telemetria nem atualização automática neste fork. Atualize instalando uma build nova.
- Baixar conteúdo do YouTube pode contrariar os termos da plataforma. Use somente conteúdo para o qual você tenha permissão.
- Arquivos protegidos por DRM, como downloads de streaming de Spotify ou Apple Music, não podem ser importados.

## Desenvolver a partir do código

Use Node.js **24 ou superior**.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Os scripts escolhem automaticamente uma instalação Node 24+ do `nvm`, quando existir. No Linux/macOS, `dev` ou um comando de pacote busca o ffmpeg necessário. Para baixar manualmente:

```bash
bash scripts/fetch-ffmpeg.sh        # macOS ou Linux
powershell scripts/fetch-ffmpeg.ps1 # Windows
```

## Gerar instaladores

Gere os pacotes no sistema operacional de destino:

```bash
npm run dist        # macOS: DMG e ZIP
npm run dist:win    # Windows: instalador NSIS e ZIP
npm run dist:linux  # Linux: AppImage e DEB
```

Os artefatos saem em `release/`. Antes de encerrar uma alteração, o fluxo do projeto é: rodar `npm run typecheck`, gerar o instalador e instalar/testar a build recém-gerada. Consulte [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) e [docs/INSTALL.md](docs/INSTALL.md).

## Estrutura do projeto

```text
src/main/       Processo principal Electron: pipeline, biblioteca, rede local e ambiente
src/preload/    Ponte IPC entre Electron e interface
src/renderer/   Interface React: biblioteca, player, setlist e controles
src/shared/     Tipos e contratos compartilhados
python/         Separação, batidas, seções e acordes
scripts/        Empacotamento, ffmpeg e testes do controle remoto
docs/           Instalação, desenvolvimento e roadmap
```

## Estado do produto

- [Roadmap](docs/ROADMAP.md) — funcionalidades concluídas, pendências e validações de campo.
- [Histórico de versões](CHANGELOG.md) — mudanças por versão.
- [Segurança](SECURITY.md) — escopo e como relatar um problema.
