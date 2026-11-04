# Segurança

O Stem-Machine é um projeto pessoal, executado localmente. A versão suportada é sempre a build mais recente instalada manualmente.

## Relatar um problema

Não publique detalhes exploráveis em uma issue aberta. Use o recurso de reporte privado de vulnerabilidade do repositório ou entre em contato com o mantenedor com:

- versão e plataforma afetadas;
- passos mínimos para reproduzir;
- impacto esperado;
- evidências que não exponham dados pessoais ou músicas privadas.

## Superfícies relevantes

- App Electron, ponte IPC e processo Python local.
- Download de áudio pelo yt-dlp e execução do ffmpeg empacotado.
- Download inicial de runtime Python, pacotes e modelos via HTTPS.
- Controle pelo celular na rede local, protegido por PIN e token temporário.

## Boas práticas de uso

- Ative o controle pelo celular somente em rede confiável. Ele usa HTTP local, não HTTPS.
- Não exponha a porta do controle remoto à internet e não use Wi‑Fi público para esse controle.
- Instale apenas builds produzidas por fonte confiável.
- Revise permissões de firewall quando o sistema pedir acesso à rede local.

O app não envia stems, biblioteca ou configurações a um serviço do Stem-Machine e este fork não possui telemetria nem atualizador automático.
