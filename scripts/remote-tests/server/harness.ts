// ponto de entrada do bundle de teste: só reexporta o que os testes usam (sem Electron)
export { RemoteServer, pruneUploads, removeUploadFolder } from '../../../src/main/remoteServer'
export { RemoteJobs } from '../../../src/main/remoteJobs'
export { localSongId } from '../../../src/shared/local'
export { MAX_UPLOAD_BYTES, safeUploadName } from '../../../src/shared/remote'
