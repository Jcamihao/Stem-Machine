// bundle da cola (remote.ts) com o electron trocado pelo stub
export * from '../../../src/main/remote'
// o stub que a cola enxerga (handlers do ipcMain), para o teste chamar
import * as electron from 'electron'
export const stub = (electron as unknown as { __stub: unknown }).__stub
