// stub mínimo do 'electron' para testar remote.ts e o pipeline fora do Electron
const fs = require('fs')
const os = require('os')
const path = require('path')
const userData = process.env.SM_USERDATA || fs.mkdtempSync(path.join(os.tmpdir(), 'sm-userdata-'))
const handlers = {}
const listeners = {}
const quit = []
module.exports = {
  app: { getPath: () => userData, on: (ev, cb) => ev === 'before-quit' && quit.push(cb), isPackaged: false, getVersion: () => '0.0.0', getAppPath: () => process.cwd() },
  ipcMain: { handle: (c, f) => (handlers[c] = f), on: (c, f) => (listeners[c] = f) },
  BrowserWindow: { getAllWindows: () => [] },
  net: {},
  dialog: {},
  shell: {},
  __stub: { userData, handlers, listeners, quit }
}
