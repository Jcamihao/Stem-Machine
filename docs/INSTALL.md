# Instalação e atualização

Este guia vale para o **Stem-Machine 0.10.2** e para builds futuras com o mesmo formato de pacote.

## Antes de instalar

- Feche o Stem-Machine que estiver aberto.
- Use o instalador produzido para o seu sistema operacional e arquitetura.
- Na primeira abertura, reserve internet e espaço em disco: o app prepara Python e os modelos localmente.

## Windows

1. Execute `Stem-Machine-<versão>-Setup.exe`.
2. Siga o instalador. Ele é por usuário e não deve exigir conta de administrador.
3. Abra **Stem-Machine** pelo Menu Iniciar.

Para atualizar, execute o instalador da versão nova sobre a instalação atual.

## macOS

1. Abra `Stem-Machine-<versão>-mac-arm64.dmg` em Apple Silicon ou `...-mac-x64.dmg` em Intel.
2. Arraste o app para **Aplicativos**.
3. Abra-o normalmente.

Builds locais podem não ser notarizadas. Se o macOS bloquear a abertura, use **Ajustes do Sistema → Privacidade e Segurança → Abrir assim mesmo** depois de conferir a origem do arquivo.

## Linux

### DEB

Em Debian, Ubuntu e derivados:

```bash
sudo apt install ./Stem-Machine-<versão>-linux-amd64.deb
stem-machine
```

`apt` instala também as dependências declaradas pelo pacote. Para atualizar, repita o comando com o `.deb` novo.

### AppImage

```bash
chmod +x Stem-Machine-<versão>-linux-x86_64.AppImage
./Stem-Machine-<versão>-linux-x86_64.AppImage
```

Use a AppImage quando não quiser ou não puder instalar um pacote do sistema. Alguns desktops exigem FUSE para executar AppImages.

### Instalação local sem sudo

Extraia o pacote na pasta do usuário e crie um launcher local:

```bash
mkdir -p ~/.local/bin
dpkg-deb -x Stem-Machine-<versão>-linux-amd64.deb ~/.local
printf '%s\n' '#!/usr/bin/env sh' 'exec "$HOME/.local/opt/Stem-Machine/stem-machine" "$@"' > ~/.local/bin/stem-machine
chmod +x ~/.local/bin/stem-machine
```

Garanta que `~/.local/bin` esteja no `PATH`, então rode `stem-machine`. Para atualizar, extraia a versão nova novamente em `~/.local`.

## Confirmar a build instalada

Abra o aplicativo, confira a versão na tela **About** e valide ao menos:

1. biblioteca abre;
2. BPM manual, TAP tempo, pan do metrônomo, pan do pad e PAN L/R respondem;
3. uma música existente toca;
4. se usar o celular, o PIN e a página remota conectam na rede local.

Não há atualização automática neste fork. A atualização é sempre feita instalando uma build nova.
