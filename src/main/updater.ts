import { ipcMain } from 'electron'

/* fork pessoal: sem atualização automática. O autor original publica releases
   no próprio repositório e o electron-updater trocaria este app pela versão
   dele, apagando as alterações locais. Os handlers continuam registrados
   porque a tela About e o preload os chamam */
export function initUpdater(): void {
  ipcMain.handle('update:check', async () => ({ ok: false }))
  ipcMain.handle('update:install', () => {})
}
